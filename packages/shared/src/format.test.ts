import { describe, expect, it } from 'vitest';

import { pickDealBadge } from './domain';
import { formatAgo, formatApproxDistance, formatChatSeparator, formatEndsIn, formatPercentOff, formatPrice, formatReadReceipt, formatThreadTime, percentOff } from './format';

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

describe('formatAgo / formatEndsIn', () => {
  const now = new Date('2026-10-02T12:00:00Z');
  it('formats elapsed time', () => {
    expect(formatAgo('2026-10-02T11:59:30Z', now)).toBe('just now');
    expect(formatAgo('2026-10-02T11:56:00Z', now)).toBe('4m ago');
    expect(formatAgo('2026-10-02T10:00:00Z', now)).toBe('2h ago');
    expect(formatAgo('2026-09-29T12:00:00Z', now)).toBe('3d ago');
  });
  it('formats time remaining', () => {
    expect(formatEndsIn('2026-10-02T15:30:00Z', now)).toBe('Ends in 3h');
    expect(formatEndsIn('2026-10-03T13:00:00Z', now)).toBe('Ends in 1 day');
    expect(formatEndsIn('2026-10-02T11:00:00Z', now)).toBe('Ended');
  });
});

describe('chat times', () => {
  const now = new Date(2026, 9, 3, 19, 0); // Sat Oct 3 2026, 7:00 PM local
  const at = (d: number, h: number, m = 0) => new Date(2026, 9, d, h, m);
  it('labels inbox rows', () => {
    expect(formatThreadTime(at(3, 18, 44), now)).toBe('6:44 PM');
    expect(formatThreadTime(at(2, 8, 40), now)).toBe('Yesterday');
    expect(formatThreadTime(new Date(2026, 8, 30, 9), now)).toBe('Wed');
    expect(formatThreadTime(new Date(2026, 8, 24, 9), now)).toBe('Sep 24');
  });
  it('labels separators', () => {
    expect(formatChatSeparator(at(3, 18, 20), now)).toBe('Today 6:20 PM');
    expect(formatChatSeparator(at(2, 17, 58), now)).toBe('Yesterday 5:58 PM');
    expect(formatChatSeparator(new Date(2026, 8, 24, 9, 0), now)).toBe('Sep 24, 9:00 AM');
  });
  it('labels receipts', () => {
    expect(formatReadReceipt(at(3, 18, 44), now)).toBe('Read 6:44 PM');
    expect(formatReadReceipt(at(1, 10), now)).toBe('Read Thu');
  });
});
