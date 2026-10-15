export class DomainError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly httpStatus: number,
  ) {
    super(message);
    this.name = new.target.name;
  }
}

export class ProgramNotFoundError extends DomainError {
  constructor(programId: string) {
    super(`Program ${programId} not found`, 'PROGRAM_NOT_FOUND', 404);
  }
}

export class ReservationNotFoundError extends DomainError {
  constructor(invoiceId: string) {
    super(
      `Reservation for invoice ${invoiceId} not found`,
      'RESERVATION_NOT_FOUND',
      404,
    );
  }
}

export class InsufficientCapacityError extends DomainError {
  constructor(available: string, requested: string, currency: string) {
    super(
      `Insufficient capacity: requested ${requested} ${currency}, available ${available} ${currency}`,
      'INSUFFICIENT_CAPACITY',
      409,
    );
  }
}

export class MissingFxRateError extends DomainError {
  constructor(from: string, to: string) {
    super(`No FX rate for ${from}/${to}`, 'MISSING_FX_RATE', 422);
  }
}

export class InvalidAmountError extends DomainError {
  constructor() {
    super('Amount must be greater than zero', 'INVALID_AMOUNT', 422);
  }
}

export class InvalidTreasuryEventError extends DomainError {
  constructor(reason: string) {
    super(`Invalid treasury event: ${reason}`, 'INVALID_TREASURY_EVENT', 422);
  }
}
