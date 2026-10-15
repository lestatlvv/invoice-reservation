import { InvalidTreasuryEventError } from '../common/domain-error.js';
import { parseTreasuryEvent } from './treasury.parser.js';

const valid = {
  eventId: 'evt-1',
  eventType: 'PROGRAM_RECONCILED',
  occurredAt: '2026-10-08T12:00:00.000Z',
  programId: '11111111-1111-4111-8111-111111111111',
  programName: 'Working Capital Facility',
  currency: 'USD',
  creditLimit: '10000000.00',
  outstanding: [
    {
      invoiceId: 'INV-1',
      amount: '1000.00',
      currency: 'EUR',
      reservedAmountProgramCcy: '1080.00',
    },
  ],
};

describe('parseTreasuryEvent', () => {
  it('parses a valid reconciliation payload', () => {
    const event = parseTreasuryEvent(JSON.stringify(valid));
    expect(event.eventType).toBe('PROGRAM_RECONCILED');
    expect(event.outstanding).toHaveLength(1);
    expect(event.outstanding?.[0]?.reservedAmountProgramCcy).toBe('1080.00');
  });

  it('rejects unknown event types', () => {
    expect(() =>
      parseTreasuryEvent(JSON.stringify({ ...valid, eventType: 'NOPE' })),
    ).toThrow(InvalidTreasuryEventError);
  });

  it('rejects invalid JSON', () => {
    expect(() => parseTreasuryEvent('{')).toThrow(InvalidTreasuryEventError);
  });
});
