import { InvalidTreasuryEventError } from '../common/domain-error.js';
import {
  TREASURY_EVENT_TYPES,
  type OutstandingInvoice,
  type TreasuryCapacityEvent,
  type TreasuryEventType,
} from './treasury.types.js';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CURRENCY_RE = /^[A-Z]{3}$/;
const DECIMAL_RE = /^\d+(\.\d+)?$/;

export function parseTreasuryEvent(
  raw: string | Buffer | null,
): TreasuryCapacityEvent {
  if (raw == null) {
    throw new InvalidTreasuryEventError('empty payload');
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(typeof raw === 'string' ? raw : raw.toString('utf8'));
  } catch {
    throw new InvalidTreasuryEventError('payload is not JSON');
  }

  if (!isRecord(parsed)) {
    throw new InvalidTreasuryEventError('payload must be an object');
  }

  const eventType = requiredString(parsed, 'eventType');
  if (!isEventType(eventType)) {
    throw new InvalidTreasuryEventError(`unknown eventType ${eventType}`);
  }

  const programId = requiredString(parsed, 'programId');
  if (!UUID_RE.test(programId)) {
    throw new InvalidTreasuryEventError('programId must be a UUID');
  }

  const currency = requiredString(parsed, 'currency').toUpperCase();
  if (!CURRENCY_RE.test(currency)) {
    throw new InvalidTreasuryEventError('currency must be ISO 4217');
  }

  const creditLimit = requiredString(parsed, 'creditLimit');
  if (!DECIMAL_RE.test(creditLimit)) {
    throw new InvalidTreasuryEventError('creditLimit must be a decimal string');
  }

  const occurredAt = requiredString(parsed, 'occurredAt');
  if (Number.isNaN(Date.parse(occurredAt))) {
    throw new InvalidTreasuryEventError('occurredAt must be ISO-8601');
  }

  return {
    eventId: requiredString(parsed, 'eventId'),
    eventType,
    occurredAt,
    programId,
    programName: requiredString(parsed, 'programName'),
    currency,
    creditLimit,
    outstanding: parseOutstanding(parsed.outstanding),
    fxRates: parseFxRates(parsed.fxRates),
  };
}

function parseOutstanding(value: unknown): OutstandingInvoice[] | undefined {
  if (value == null) {
    return undefined;
  }
  if (!Array.isArray(value)) {
    throw new InvalidTreasuryEventError('outstanding must be an array');
  }
  return value.map((item, index) => {
    if (!isRecord(item)) {
      throw new InvalidTreasuryEventError(
        `outstanding[${index}] must be an object`,
      );
    }
    const currency = requiredString(item, 'currency').toUpperCase();
    if (!CURRENCY_RE.test(currency)) {
      throw new InvalidTreasuryEventError(
        `outstanding[${index}].currency is invalid`,
      );
    }
    const amount = requiredString(item, 'amount');
    if (!DECIMAL_RE.test(amount)) {
      throw new InvalidTreasuryEventError(
        `outstanding[${index}].amount is invalid`,
      );
    }
    const reserved = item.reservedAmountProgramCcy;
    if (
      reserved != null &&
      (typeof reserved !== 'string' || !DECIMAL_RE.test(reserved))
    ) {
      throw new InvalidTreasuryEventError(
        `outstanding[${index}].reservedAmountProgramCcy is invalid`,
      );
    }
    return {
      invoiceId: requiredString(item, 'invoiceId'),
      amount,
      currency,
      ...(typeof reserved === 'string'
        ? { reservedAmountProgramCcy: reserved }
        : {}),
    };
  });
}

function parseFxRates(value: unknown) {
  if (value == null) {
    return undefined;
  }
  if (!Array.isArray(value)) {
    throw new InvalidTreasuryEventError('fxRates must be an array');
  }
  return value.map((item, index) => {
    if (!isRecord(item)) {
      throw new InvalidTreasuryEventError(
        `fxRates[${index}] must be an object`,
      );
    }
    const base = requiredString(item, 'base').toUpperCase();
    const quote = requiredString(item, 'quote').toUpperCase();
    const rate = requiredString(item, 'rate');
    if (
      !CURRENCY_RE.test(base) ||
      !CURRENCY_RE.test(quote) ||
      !DECIMAL_RE.test(rate)
    ) {
      throw new InvalidTreasuryEventError(`fxRates[${index}] is invalid`);
    }
    return { base, quote, rate };
  });
}

function isEventType(value: string): value is TreasuryEventType {
  return (TREASURY_EVENT_TYPES as readonly string[]).includes(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function requiredString(record: Record<string, unknown>, key: string): string {
  const value = record[key];
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new InvalidTreasuryEventError(`${key} is required`);
  }
  return value.trim();
}
