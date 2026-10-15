import { planReconciliation } from './reconciliation.js';

describe('planReconciliation', () => {
  const occurredAt = new Date('2026-10-08T12:00:00.000Z');

  it('skips snapshots older than the last applied watermark', () => {
    const plan = planReconciliation({
      occurredAt,
      lastReconciledAt: new Date('2026-10-08T13:00:00.000Z'),
      existingActive: [],
      outstanding: [{ invoiceId: 'INV-1', amount: '10', currency: 'USD' }],
    });
    expect(plan.skip).toBe(true);
    expect(plan.toUpsert).toEqual([]);
  });

  it('releases snapshot-eligible reservations missing from treasury', () => {
    const plan = planReconciliation({
      occurredAt,
      lastReconciledAt: new Date('2026-10-07T00:00:00.000Z'),
      existingActive: [
        {
          invoiceId: 'OLD',
          reservedAt: new Date('2026-10-08T11:00:00.000Z'),
          reservedAmount: '100.0000',
        },
      ],
      outstanding: [],
    });
    expect(plan.skip).toBe(false);
    expect(plan.toRelease).toEqual(['OLD']);
  });

  it('keeps local reservations newer than the snapshot watermark', () => {
    const plan = planReconciliation({
      occurredAt,
      lastReconciledAt: null,
      existingActive: [
        {
          invoiceId: 'LOCAL',
          reservedAt: new Date('2026-10-08T12:00:01.000Z'),
          reservedAmount: '50.0000',
        },
      ],
      outstanding: [
        { invoiceId: 'TREASURY', amount: '20', currency: 'USD' },
        { invoiceId: 'LOCAL', amount: '1', currency: 'USD' },
      ],
    });
    expect(plan.keepLocalInvoiceIds).toEqual(['LOCAL']);
    expect(plan.toUpsert.map((item) => item.invoiceId)).toEqual(['TREASURY']);
    expect(plan.toRelease).toEqual([]);
  });
});
