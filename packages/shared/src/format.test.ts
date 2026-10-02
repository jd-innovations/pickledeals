import { describe, expect, it } from 'vitest';

import { pickDealBadge } from './domain';
import { formatApproxDistance, formatPercentOff, formatPrice, percentOff } from './format';

describe('formatPrice', () => {
  it('drops zero cents', () => expect(formatPrice(17900)).toBe('$179'));
  it('keeps non-zero cents', () => expect(formatPrice(1999)).toBe('$19.99'));
});

describe('percentOff', () => {
  it('rounds down', () => expect(percentOff(17900, 27900)).toBe(35));
  it('is null with no saving', () => expect(percentOff(27900, 27900)).toBeNull());
  it('formats with a true minus sign', () => expect(formatPercentOff(36)).toBe('−36%'));
});

describe('formatApproxDistance', () => {
  it('hides sub-mile precision', () => expect(formatApproxDistance(900)).toBe('< 1 mi'));
  it('uses half-mile steps under 5 mi', () => expect(formatApproxDistance(5150)).toBe('~3 mi'));
  it('uses whole miles above 5 mi', () => expect(formatApproxDistance(19000)).toBe('~12 mi'));
});

describe('pickDealBadge', () => {
  it('shows only the highest-priority badge', () =>
    expect(pickDealBadge(['HOT DEAL', 'PRICE DROP'])).toBe('PRICE DROP'));
  it('returns null when none apply', () => expect(pickDealBadge([])).toBeNull());
});
