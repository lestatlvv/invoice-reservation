import { Injectable, Logger } from '@nestjs/common';
import { Prisma, ReservationStatus } from '@prisma/client';
import { InvalidTreasuryEventError } from '../common/domain-error.js';
import { money } from '../common/money.js';
import { planReconciliation } from '../capacity/domain/reconciliation.js';
import { convertAmount } from '../fx/fx.converter.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type {
  OutstandingInvoice,
  TreasuryCapacityEvent,
} from './treasury.types.js';

@Injectable()
export class TreasuryHandler {
  private readonly logger = new Logger(TreasuryHandler.name);

  constructor(private readonly prisma: PrismaService) {}

  async handle(event: TreasuryCapacityEvent): Promise<void> {
    try {
      await this.prisma.$transaction(async (tx) => {
        await this.apply(tx, event);
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        this.logger.debug(`Duplicate treasury event ${event.eventId}`);
        return;
      }
      throw error;
    }
  }

  private async apply(
    tx: Prisma.TransactionClient,
    event: TreasuryCapacityEvent,
  ): Promise<void> {
    const occurredAt = new Date(event.occurredAt);
    const currency = event.currency.toUpperCase();
    const creditLimit = money(event.creditLimit).toFixed(4);

    if (event.fxRates?.length) {
      for (const rate of event.fxRates) {
        await tx.fxRate.upsert({
          where: { base_quote: { base: rate.base, quote: rate.quote } },
          update: { rate: money(rate.rate).toFixed(8), asOf: occurredAt },
          create: {
            base: rate.base,
            quote: rate.quote,
            rate: money(rate.rate).toFixed(8),
            asOf: occurredAt,
          },
        });
      }
    }

    await tx.program.upsert({
      where: { id: event.programId },
      create: {
        id: event.programId,
        name: event.programName,
        currency,
        creditLimit,
      },
      update: {},
    });
    await tx.$queryRaw`SELECT id FROM programs WHERE id = ${event.programId}::uuid FOR UPDATE`;

    const program = await tx.program.findUniqueOrThrow({
      where: { id: event.programId },
    });

    if (event.eventType === 'CREDIT_LIMIT_CHANGED') {
      if (program.currency !== currency) {
        this.logger.warn(
          `Credit limit currency changed for ${event.programId}: ${program.currency} -> ${currency}. Reserved amounts stay in the previous unit until a PROGRAM_RECONCILED snapshot.`,
        );
      }
      await tx.program.update({
        where: { id: event.programId },
        data: {
          name: event.programName,
          currency,
          creditLimit,
          lastTreasuryEventId: event.eventId,
          version: { increment: 1 },
        },
      });
    } else {
      await this.reconcile(tx, event, occurredAt);
    }

    await tx.processedTreasuryEvent.create({
      data: {
        eventId: event.eventId,
        eventType: event.eventType,
        programId: event.programId,
      },
    });
  }

  private async reconcile(
    tx: Prisma.TransactionClient,
    event: TreasuryCapacityEvent,
    occurredAt: Date,
  ): Promise<void> {
    const program = await tx.program.findUniqueOrThrow({
      where: { id: event.programId },
    });

    const outstanding = event.outstanding ?? [];
    const existingActive = await tx.reservation.findMany({
      where: { programId: event.programId, status: ReservationStatus.ACTIVE },
    });

    const plan = planReconciliation({
      occurredAt,
      lastReconciledAt: program.lastReconciledAt,
      existingActive: existingActive.map((row) => ({
        invoiceId: row.invoiceId,
        reservedAt: row.reservedAt,
        reservedAmount: row.reservedAmount.toString(),
      })),
      outstanding,
    });

    if (plan.skip) {
      this.logger.debug(
        `Skipping stale reconciliation ${event.eventId} for ${event.programId}`,
      );
      return;
    }

    if (plan.toRelease.length > 0) {
      await tx.reservation.updateMany({
        where: {
          programId: event.programId,
          invoiceId: { in: plan.toRelease },
          status: ReservationStatus.ACTIVE,
        },
        data: {
          status: ReservationStatus.RELEASED,
          releasedAt: occurredAt,
        },
      });
    }

    for (const item of plan.toUpsert) {
      const converted = await this.outstandingToProgramCcy(
        tx,
        item,
        event.currency,
      );
      if (converted.amount.lte(0)) {
        throw new InvalidTreasuryEventError(
          `outstanding ${item.invoiceId} reserved amount must be positive`,
        );
      }
      await tx.reservation.upsert({
        where: {
          programId_invoiceId: {
            programId: event.programId,
            invoiceId: item.invoiceId,
          },
        },
        create: {
          programId: event.programId,
          invoiceId: item.invoiceId,
          invoiceAmount: money(item.amount).toFixed(4),
          invoiceCurrency: item.currency,
          reservedAmount: converted.amount.toFixed(4),
          fxRate: converted.rate.toFixed(8),
          status: ReservationStatus.ACTIVE,
          reservedAt: occurredAt,
        },
        update: {
          invoiceAmount: money(item.amount).toFixed(4),
          invoiceCurrency: item.currency,
          reservedAmount: converted.amount.toFixed(4),
          fxRate: converted.rate.toFixed(8),
          status: ReservationStatus.ACTIVE,
          reservedAt: occurredAt,
          releasedAt: null,
        },
      });
    }

    const active = await tx.reservation.findMany({
      where: { programId: event.programId, status: ReservationStatus.ACTIVE },
    });
    const reservedAmount = active.reduce(
      (sum, row) => sum.plus(money(row.reservedAmount.toString())),
      money(0),
    );

    await tx.program.update({
      where: { id: event.programId },
      data: {
        name: event.programName,
        currency: event.currency.toUpperCase(),
        creditLimit: money(event.creditLimit).toFixed(4),
        reservedAmount: reservedAmount.toFixed(4),
        lastReconciledAt: occurredAt,
        lastTreasuryEventId: event.eventId,
        version: { increment: 1 },
      },
    });
  }

  private async outstandingToProgramCcy(
    tx: Prisma.TransactionClient,
    item: OutstandingInvoice,
    programCurrency: string,
  ) {
    if (item.reservedAmountProgramCcy) {
      const amount = money(item.reservedAmountProgramCcy);
      const invoice = money(item.amount);
      const rate = invoice.isZero() ? money(1) : amount.div(invoice);
      return { amount, rate };
    }
    const rows = await tx.fxRate.findMany();
    const rates = new Map(
      rows.map((row) => [
        `${row.base}:${row.quote}`,
        money(row.rate.toString()),
      ]),
    );
    const converted = convertAmount(
      item.amount,
      item.currency,
      programCurrency,
      (base, quote) => rates.get(`${base}:${quote}`) ?? null,
    );
    return { amount: converted.converted, rate: converted.rate };
  }
}
