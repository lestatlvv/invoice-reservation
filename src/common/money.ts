import { Decimal } from 'decimal.js';

Decimal.set({ precision: 28, rounding: Decimal.ROUND_HALF_EVEN });

export { Decimal };

export function money(value: Decimal.Value): Decimal {
  if (value instanceof Decimal) {
    return value;
  }
  if (
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'bigint'
  ) {
    return new Decimal(value);
  }
  return new Decimal(String(value));
}

export function roundMoney(value: Decimal): Decimal {
  return value.toDecimalPlaces(4, Decimal.ROUND_HALF_EVEN);
}

export function roundRate(value: Decimal): Decimal {
  return value.toDecimalPlaces(8, Decimal.ROUND_HALF_EVEN);
}

export function formatMoney(value: Decimal.Value): string {
  return money(value).toFixed(4);
}

export function formatRate(value: Decimal.Value): string {
  return money(value).toFixed(8);
}

export function availableCapacity(
  creditLimit: Decimal.Value,
  reservedAmount: Decimal.Value,
): Decimal {
  return roundMoney(money(creditLimit).minus(money(reservedAmount)));
}
