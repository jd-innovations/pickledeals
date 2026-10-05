import { describe, expect, it } from 'vitest';

import { speakable, spoken, spokenBadge, spokenPrice } from './a11y';

describe('a11y labels', () => {
  it('joins only the parts that exist', () => {
    expect(spoken('Selkirk', null, '', undefined, false, ' Vanguard ')).toBe('Selkirk, Vanguard');
  });

  it('reads a price with what it was and the saving', () => {
    expect(spokenPrice(19500, 23499)).toBe('$195, was $234.99, 17% off');
    expect(spokenPrice(19500)).toBe('$195');
    expect(spokenPrice(19500, 19500)).toBe('$195');
  });

  it('never says a number for check-price offers (D1)', () => {
    expect(spokenPrice(null, 23499)).toBe('Check price');
    expect(spokenPrice(undefined, null, 'Check price at Amazon')).toBe('Check price at Amazon');
  });

  it('turns badges into sentence case', () => {
    expect(spokenBadge('LOWEST PRICE')).toBe('Lowest price');
    expect(spokenBadge(null)).toBeNull();
  });

  it('expands visual shorthand', () => {
    expect(speakable('Sarasota, FL · ~3 mi')).toBe('Sarasota, FL, about 3 miles');
    expect(speakable('Lakewood Ranch · < 1 mi')).toBe('Lakewood Ranch, under a mile');
    expect(speakable('~1 mi')).toBe('about 1 mile');
    expect(speakable('~2.5 mi')).toBe('about 2.5 miles');
    expect(speakable('↓ $40 this week')).toBe('down $40 this week');
    expect(speakable('+$24.35')).toBe('$24.35 more');
    expect(speakable('$189 + $6 shipping')).toBe('$189 + $6 shipping');
  });
});
