import { MissingFxRateError } from '../common/domain-error.js';
import { Decimal, money, roundMoney, roundRate } from '../common/money.js';

export type RateLookup = (base: string, quote: string) => Decimal | null;

export function convertAmount(
  amount: Decimal.Value,
  from: string,
  to: string,
  getRate: RateLookup,
): { converted: Decimal; rate: Decimal } {
  const source = from.toUpperCase();
  const target = to.toUpperCase();
  const value = money(amount);

  if (source === target) {
    return { converted: roundMoney(value), rate: money(1) };
  }

  const direct = getRate(source, target);
  if (direct) {
    const rate = roundRate(direct);
    return { converted: roundMoney(value.times(rate)), rate };
  }

  const inverse = getRate(target, source);
  if (inverse && !inverse.isZero()) {
    const rate = roundRate(money(1).div(inverse));
    return { converted: roundMoney(value.times(rate)), rate };
  }

  throw new MissingFxRateError(source, target);
}
