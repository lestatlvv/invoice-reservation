import {
  InsufficientCapacityError,
  InvalidAmountError,
} from '../../common/domain-error.js';
import { assertPositiveAmount, assertSufficientCapacity } from './capacity.js';

describe('capacity domain', () => {
  it('rejects non-positive reservation amounts', () => {
    expect(() => assertPositiveAmount('0')).toThrow(InvalidAmountError);
    expect(() => assertPositiveAmount('-1')).toThrow(InvalidAmountError);
  });

  it('allows a reservation within remaining capacity', () => {
    const available = assertSufficientCapacity(
      '10000000',
      '9990000',
      '10000',
      'USD',
    );
    expect(available.toFixed(4)).toBe('10000.0000');
  });

  it('rejects over-commit', () => {
    expect(() => assertSufficientCapacity('1000', '900', '200', 'USD')).toThrow(
      InsufficientCapacityError,
    );
  });
});
