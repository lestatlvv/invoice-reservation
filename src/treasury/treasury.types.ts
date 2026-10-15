export const TREASURY_EVENT_TYPES = [
  'CREDIT_LIMIT_CHANGED',
  'PROGRAM_RECONCILED',
] as const;

export type TreasuryEventType = (typeof TREASURY_EVENT_TYPES)[number];

export interface OutstandingInvoice {
  invoiceId: string;
  amount: string;
  currency: string;
  reservedAmountProgramCcy?: string;
}

export interface FxRateUpdate {
  base: string;
  quote: string;
  rate: string;
}

export interface TreasuryCapacityEvent {
  eventId: string;
  eventType: TreasuryEventType;
  occurredAt: string;
  programId: string;
  programName: string;
  currency: string;
  creditLimit: string;
  outstanding?: OutstandingInvoice[];
  fxRates?: FxRateUpdate[];
}
