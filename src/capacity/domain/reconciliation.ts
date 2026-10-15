export interface ActiveReservationView {
  invoiceId: string;
  reservedAt: Date;
  reservedAmount: string;
}

export interface OutstandingInvoice {
  invoiceId: string;
  amount: string;
  currency: string;
  reservedAmountProgramCcy?: string;
}

export interface ReconciliationPlan {
  skip: boolean;
  toRelease: string[];
  toUpsert: OutstandingInvoice[];
  keepLocalInvoiceIds: string[];
}

export function planReconciliation(input: {
  occurredAt: Date;
  lastReconciledAt: Date | null;
  existingActive: ActiveReservationView[];
  outstanding: OutstandingInvoice[];
}): ReconciliationPlan {
  if (input.lastReconciledAt && input.occurredAt <= input.lastReconciledAt) {
    return {
      skip: true,
      toRelease: [],
      toUpsert: [],
      keepLocalInvoiceIds: [],
    };
  }

  const keepLocal = input.existingActive.filter(
    (reservation) => reservation.reservedAt > input.occurredAt,
  );
  const keepLocalInvoiceIds = keepLocal.map(
    (reservation) => reservation.invoiceId,
  );
  const keepSet = new Set(keepLocalInvoiceIds);

  const eligible = input.existingActive.filter(
    (reservation) => reservation.reservedAt <= input.occurredAt,
  );
  const outstandingIds = new Set(
    input.outstanding.map((item) => item.invoiceId),
  );

  return {
    skip: false,
    toRelease: eligible
      .filter((reservation) => !outstandingIds.has(reservation.invoiceId))
      .map((reservation) => reservation.invoiceId),
    toUpsert: input.outstanding.filter((item) => !keepSet.has(item.invoiceId)),
    keepLocalInvoiceIds,
  };
}
