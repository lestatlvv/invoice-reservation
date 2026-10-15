import {
  InsufficientCapacityError,
  InvalidAmountError,
} from '../../common/domain-error.js';
import {
  Decimal,
  availableCapacity,
  formatMoney,
  money,
  roundMoney,
} from '../../common/money.js';

export function assertPositiveAmount(amount: Decimal.Value): Decimal {
  const value = roundMoney(money(amount));
  if (!value.isFinite() || value.lte(0)) {
    throw new InvalidAmountError();
  }
  return value;
}

export function assertNonNegativeAmount(amount: Decimal.Value): Decimal {
  const value = roundMoney(money(amount));
  if (!value.isFinite() || value.lt(0)) {
    throw new InvalidAmountError();
  }
  return value;
}

export function assertSufficientCapacity(
  creditLimit: Decimal.Value,
  reservedAmount: Decimal.Value,
  requested: Decimal.Value,
  currency: string,
): Decimal {
  const available = availableCapacity(creditLimit, reservedAmount);
  const need = money(requested);
  if (need.gt(available)) {
    throw new InsufficientCapacityError(
      formatMoney(available),
      formatMoney(need),
      currency,
    );
  }
  return available;
}
