import { describe, expect, it } from 'vitest';

import { requiresPublicName } from './domain';
import { normalizeDisplayName, publicNameFromParts, validateDisplayName } from './identity';
import { utf8Decode, utf8Encode } from './utf8';

describe('validateDisplayName', () => {
  it('accepts a normal name', () => expect(validateDisplayName('Dana H.')).toBeNull());
  it('rejects blanks', () => expect(validateDisplayName('   ')).toBe('too_short'));
  it('rejects long names', () => expect(validateDisplayName('x'.repeat(41))).toBe('too_long'));
  it('rejects control characters', () => expect(validateDisplayName('Dana\u0007')).toBe('invalid_characters'));
  it('rejects generated-looking names', () => expect(validateDisplayName('player 1234')).toBe('reserved'));
  it('collapses whitespace', () => expect(normalizeDisplayName('  Dana   H. ')).toBe('Dana H.'));
});

describe('publicNameFromParts', () => {
  it('uses given name and family initial', () => expect(publicNameFromParts('Dana', 'herrera')).toBe('Dana H.'));
  it('uses the given name alone', () => expect(publicNameFromParts('Dana', null)).toBe('Dana'));
  it('needs a given name', () => expect(publicNameFromParts(null, 'Herrera')).toBeNull());
  it('handles non-Latin names', () => expect(publicNameFromParts('Zoë', 'Ølsen')).toBe('Zoë Ø.'));
});

describe('requiresPublicName', () => {
  it('gates marketplace identity intents', () => expect(requiresPublicName('make_offer')).toBe(true));
  it('does not gate saving', () => expect(requiresPublicName('save_product')).toBe(false));
});

describe('utf8', () => {
  it('round-trips ASCII, accents and emoji', () => {
    const s = '{"name":"Zoë 🏓 日本"}';
    expect(utf8Decode(utf8Encode(s))).toBe(s);
  });
  it('matches TextEncoder', () =>
    expect(Array.from(utf8Encode('é🏓'))).toEqual(Array.from(new TextEncoder().encode('é🏓'))));
});
