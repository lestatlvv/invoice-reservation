import { MissingFxRateError } from '../common/domain-error.js';
import { money } from '../common/money.js';
import { convertAmount } from './fx.converter.js';

describe('convertAmount', () => {
  const rates = new Map([
    ['EUR:USD', money('1.08')],
    ['GBP:USD', money('1.27')],
  ]);
  const getRate = (base: string, quote: string) =>
    rates.get(`${base}:${quote}`) ?? null;

  it('returns the original amount when currencies match', () => {
    const result = convertAmount('1500.1', 'usd', 'USD', getRate);
    expect(result.rate.toString()).toBe('1');
    expect(result.converted.toFixed(4)).toBe('1500.1000');
  });

  it('applies a direct FX rate', () => {
    const result = convertAmount('1000', 'EUR', 'USD', getRate);
    expect(result.rate.toFixed(8)).toBe('1.08000000');
    expect(result.converted.toFixed(4)).toBe('1080.0000');
  });

  it('uses the inverse rate when only the opposite pair exists', () => {
    const result = convertAmount('1080', 'USD', 'EUR', getRate);
    expect(result.converted.toFixed(4)).toBe('1000.0000');
  });

  it('throws when no rate is available', () => {
    expect(() => convertAmount('10', 'JPY', 'USD', getRate)).toThrow(
      MissingFxRateError,
    );
  });
});
