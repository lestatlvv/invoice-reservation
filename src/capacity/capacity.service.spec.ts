import { ReservationStatus } from '@prisma/client';
import { InsufficientCapacityError } from '../common/domain-error.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { CapacityService } from './capacity.service.js';

describe('CapacityService', () => {
  const program = {
    id: '11111111-1111-4111-8111-111111111111',
    name: 'Working Capital Facility',
    currency: 'USD',
    creditLimit: { toString: () => '1000.0000' },
    reservedAmount: { toString: () => '900.0000' },
    updatedAt: new Date('2026-10-08T00:00:00.000Z'),
  };

  function setup(
    overrides: {
      existing?: object | null;
      fxRates?: Array<{
        base: string;
        quote: string;
        rate: { toString: () => string };
      }>;
    } = {},
  ) {
    const tx = {
      $queryRaw: vi.fn().mockResolvedValue([]),
      program: {
        findUnique: vi.fn().mockResolvedValue(program),
        update: vi
          .fn()
          .mockImplementation(
            ({ data }: { data: { reservedAmount: string } }) =>
              Promise.resolve({
                ...program,
                reservedAmount: { toString: () => data.reservedAmount },
              }),
          ),
      },
      reservation: {
        findUnique: vi.fn().mockResolvedValue(overrides.existing ?? null),
        create: vi.fn().mockImplementation(({ data }: { data: object }) =>
          Promise.resolve({
            id: 'res-1',
            reservedAt: new Date('2026-10-08T00:00:00.000Z'),
            releasedAt: null,
            ...data,
            invoiceAmount: {
              toString: () => (data as { invoiceAmount: string }).invoiceAmount,
            },
            reservedAmount: {
              toString: () =>
                (data as { reservedAmount: string }).reservedAmount,
            },
            fxRate: { toString: () => (data as { fxRate: string }).fxRate },
          }),
        ),
        update: vi.fn(),
      },
      fxRate: {
        findMany: vi
          .fn()
          .mockResolvedValue(
            overrides.fxRates ?? [
              {
                base: 'EUR',
                quote: 'USD',
                rate: { toString: () => '1.08000000' },
              },
            ],
          ),
      },
    };
    const prisma = {
      $transaction: vi.fn(async (fn: (client: typeof tx) => unknown) => fn(tx)),
    } as unknown as PrismaService;
    return { service: new CapacityService(prisma), tx };
  }

  it('converts FX and reserves when capacity remains', async () => {
    const { service, tx } = setup();
    const result = await service.reserve(program.id, {
      invoiceId: 'INV-1',
      amount: '50',
      currency: 'EUR',
    });
    expect(result.reservedAmount).toBe('54.0000');
    expect(result.availableAfter).toBe('46.0000');
    expect(tx.reservation.create).toHaveBeenCalled();
  });

  it('returns the existing reservation when the invoice is already active', async () => {
    const { service, tx } = setup({
      existing: {
        id: 'res-1',
        programId: program.id,
        invoiceId: 'INV-1',
        invoiceAmount: { toString: () => '10.0000' },
        invoiceCurrency: 'USD',
        reservedAmount: { toString: () => '10.0000' },
        fxRate: { toString: () => '1.00000000' },
        status: ReservationStatus.ACTIVE,
        reservedAt: new Date('2026-10-08T00:00:00.000Z'),
        releasedAt: null,
      },
    });
    const result = await service.reserve(program.id, {
      invoiceId: 'INV-1',
      amount: '999',
      currency: 'USD',
    });
    expect(result.id).toBe('res-1');
    expect(tx.reservation.create).not.toHaveBeenCalled();
  });

  it('rejects over-commit', async () => {
    const { service } = setup();
    await expect(
      service.reserve(program.id, {
        invoiceId: 'INV-2',
        amount: '200',
        currency: 'USD',
      }),
    ).rejects.toBeInstanceOf(InsufficientCapacityError);
  });

  it('is idempotent on release', async () => {
    const { service, tx } = setup({
      existing: {
        id: 'res-1',
        programId: program.id,
        invoiceId: 'INV-1',
        invoiceAmount: { toString: () => '10.0000' },
        invoiceCurrency: 'USD',
        reservedAmount: { toString: () => '10.0000' },
        fxRate: { toString: () => '1.00000000' },
        status: ReservationStatus.RELEASED,
        reservedAt: new Date('2026-10-08T00:00:00.000Z'),
        releasedAt: new Date('2026-10-08T01:00:00.000Z'),
      },
    });
    const result = await service.release(program.id, 'INV-1');
    expect(result.status).toBe(ReservationStatus.RELEASED);
    expect(tx.program.update).not.toHaveBeenCalled();
  });
});
