import { Injectable } from '@nestjs/common';
import { Prisma, ReservationStatus } from '@prisma/client';
import {
  ProgramNotFoundError,
  ReservationNotFoundError,
} from '../common/domain-error.js';
import {
  availableCapacity,
  Decimal,
  formatMoney,
  formatRate,
  money,
} from '../common/money.js';
import { convertAmount } from '../fx/fx.converter.js';
import { PrismaService } from '../prisma/prisma.service.js';
import {
  assertNonNegativeAmount,
  assertPositiveAmount,
  assertSufficientCapacity,
} from './domain/capacity.js';
import { CreateProgramDto } from './dto/create-program.dto.js';
import { CreateReservationDto } from './dto/create-reservation.dto.js';

export interface CapacityView {
  programId: string;
  name: string;
  currency: string;
  creditLimit: string;
  reserved: string;
  available: string;
  asOf: string;
}

export interface ReservationView {
  id: string;
  programId: string;
  invoiceId: string;
  invoiceAmount: string;
  invoiceCurrency: string;
  reservedAmount: string;
  programCurrency: string;
  fxRate: string;
  status: ReservationStatus;
  reservedAt: string;
  releasedAt: string | null;
  availableAfter?: string;
}

@Injectable()
export class CapacityService {
  constructor(private readonly prisma: PrismaService) {}

  async upsertProgram(dto: CreateProgramDto): Promise<CapacityView> {
    const creditLimit = assertNonNegativeAmount(dto.creditLimit);
    const currency = dto.currency.toUpperCase();
    const id = dto.id ?? crypto.randomUUID();
    const program = await this.prisma.program.upsert({
      where: { id },
      create: {
        id,
        name: dto.name,
        currency,
        creditLimit: creditLimit.toFixed(4),
      },
      update: {
        name: dto.name,
        currency,
        creditLimit: creditLimit.toFixed(4),
      },
    });
    return this.toCapacityView(program);
  }

  async getCapacity(programId: string): Promise<CapacityView> {
    const program = await this.prisma.program.findUnique({
      where: { id: programId },
    });
    if (!program) {
      throw new ProgramNotFoundError(programId);
    }
    return this.toCapacityView(program);
  }

  async listReservations(programId: string): Promise<ReservationView[]> {
    const program = await this.prisma.program.findUnique({
      where: { id: programId },
    });
    if (!program) {
      throw new ProgramNotFoundError(programId);
    }

    const rows = await this.prisma.reservation.findMany({
      where: { programId, status: ReservationStatus.ACTIVE },
      orderBy: { reservedAt: 'asc' },
    });
    return rows.map((row) => this.toReservationView(row, program.currency));
  }

  async reserve(
    programId: string,
    dto: CreateReservationDto,
  ): Promise<ReservationView> {
    const invoiceAmount = assertPositiveAmount(dto.amount);
    const invoiceCurrency = dto.currency.toUpperCase();

    return this.prisma.$transaction(async (tx) => {
      await this.lockProgram(tx, programId);
      const program = await tx.program.findUnique({ where: { id: programId } });
      if (!program) {
        throw new ProgramNotFoundError(programId);
      }

      const existing = await tx.reservation.findUnique({
        where: {
          programId_invoiceId: { programId, invoiceId: dto.invoiceId },
        },
      });
      if (existing?.status === ReservationStatus.ACTIVE) {
        return this.toReservationView(
          existing,
          program.currency,
          availableCapacity(program.creditLimit, program.reservedAmount),
        );
      }

      const { converted, rate } = await this.convertInTx(
        tx,
        invoiceAmount,
        invoiceCurrency,
        program.currency,
      );
      const currentReserved = money(program.reservedAmount.toString());
      assertSufficientCapacity(
        program.creditLimit,
        currentReserved,
        converted,
        program.currency,
      );

      const reservation =
        existing == null
          ? await tx.reservation.create({
              data: {
                programId,
                invoiceId: dto.invoiceId,
                invoiceAmount: invoiceAmount.toFixed(4),
                invoiceCurrency,
                reservedAmount: converted.toFixed(4),
                fxRate: rate.toFixed(8),
                status: ReservationStatus.ACTIVE,
              },
            })
          : await tx.reservation.update({
              where: { id: existing.id },
              data: {
                invoiceAmount: invoiceAmount.toFixed(4),
                invoiceCurrency,
                reservedAmount: converted.toFixed(4),
                fxRate: rate.toFixed(8),
                status: ReservationStatus.ACTIVE,
                reservedAt: new Date(),
                releasedAt: null,
              },
            });

      const nextReserved = currentReserved.plus(converted);
      const updated = await tx.program.update({
        where: { id: programId },
        data: {
          reservedAmount: nextReserved.toFixed(4),
          version: { increment: 1 },
        },
      });

      return this.toReservationView(
        reservation,
        updated.currency,
        availableCapacity(updated.creditLimit, updated.reservedAmount),
      );
    });
  }

  async release(
    programId: string,
    invoiceId: string,
  ): Promise<ReservationView> {
    return this.prisma.$transaction(async (tx) => {
      await this.lockProgram(tx, programId);
      const program = await tx.program.findUnique({ where: { id: programId } });
      if (!program) {
        throw new ProgramNotFoundError(programId);
      }

      const reservation = await tx.reservation.findUnique({
        where: { programId_invoiceId: { programId, invoiceId } },
      });
      if (!reservation) {
        throw new ReservationNotFoundError(invoiceId);
      }

      if (reservation.status === ReservationStatus.RELEASED) {
        return this.toReservationView(
          reservation,
          program.currency,
          availableCapacity(program.creditLimit, program.reservedAmount),
        );
      }

      const released = await tx.reservation.update({
        where: { id: reservation.id },
        data: {
          status: ReservationStatus.RELEASED,
          releasedAt: new Date(),
        },
      });

      const nextReserved = Decimal.max(
        money(0),
        money(program.reservedAmount.toString()).minus(
          money(reservation.reservedAmount.toString()),
        ),
      );
      const updated = await tx.program.update({
        where: { id: programId },
        data: {
          reservedAmount: nextReserved.toFixed(4),
          version: { increment: 1 },
        },
      });

      return this.toReservationView(
        released,
        updated.currency,
        availableCapacity(updated.creditLimit, updated.reservedAmount),
      );
    });
  }

  private async convertInTx(
    tx: Prisma.TransactionClient,
    amount: Decimal,
    from: string,
    to: string,
  ) {
    const rows = await tx.fxRate.findMany();
    const rates = new Map(
      rows.map((row) => [
        `${row.base}:${row.quote}`,
        money(row.rate.toString()),
      ]),
    );
    return convertAmount(
      amount,
      from,
      to,
      (base, quote) => rates.get(`${base}:${quote}`) ?? null,
    );
  }

  private async lockProgram(
    tx: Prisma.TransactionClient,
    programId: string,
  ): Promise<void> {
    await tx.$queryRaw`SELECT id FROM programs WHERE id = ${programId}::uuid FOR UPDATE`;
  }

  private toCapacityView(program: {
    id: string;
    name: string;
    currency: string;
    creditLimit: Prisma.Decimal;
    reservedAmount: Prisma.Decimal;
    updatedAt: Date;
  }): CapacityView {
    const creditLimit = money(program.creditLimit.toString());
    const reserved = money(program.reservedAmount.toString());
    return {
      programId: program.id,
      name: program.name,
      currency: program.currency,
      creditLimit: formatMoney(creditLimit),
      reserved: formatMoney(reserved),
      available: formatMoney(availableCapacity(creditLimit, reserved)),
      asOf: program.updatedAt.toISOString(),
    };
  }

  private toReservationView(
    reservation: {
      id: string;
      programId: string;
      invoiceId: string;
      invoiceAmount: Prisma.Decimal;
      invoiceCurrency: string;
      reservedAmount: Prisma.Decimal;
      fxRate: Prisma.Decimal;
      status: ReservationStatus;
      reservedAt: Date;
      releasedAt: Date | null;
    },
    programCurrency: string,
    availableAfter?: Decimal,
  ): ReservationView {
    return {
      id: reservation.id,
      programId: reservation.programId,
      invoiceId: reservation.invoiceId,
      invoiceAmount: formatMoney(reservation.invoiceAmount.toString()),
      invoiceCurrency: reservation.invoiceCurrency,
      reservedAmount: formatMoney(reservation.reservedAmount.toString()),
      programCurrency,
      fxRate: formatRate(reservation.fxRate.toString()),
      status: reservation.status,
      reservedAt: reservation.reservedAt.toISOString(),
      releasedAt: reservation.releasedAt?.toISOString() ?? null,
      ...(availableAfter
        ? { availableAfter: formatMoney(availableAfter) }
        : {}),
    };
  }
}
