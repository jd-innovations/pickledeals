/** Display-name rules. Mirrors the `profiles` check constraints (2–40 chars, trimmed, printable). */
export const DISPLAY_NAME_MIN = 2;
export const DISPLAY_NAME_MAX = 40;

export type DisplayNameError = 'too_short' | 'too_long' | 'invalid_characters' | 'reserved';

/** Collapses whitespace so the stored value always satisfies the DB constraint. */
export const normalizeDisplayName = (raw: string) => raw.replace(/\s+/g, ' ').trim();

export function validateDisplayName(raw: string): DisplayNameError | null {
  const name = normalizeDisplayName(raw);
  if (name.length < DISPLAY_NAME_MIN) return 'too_short';
  if (name.length > DISPLAY_NAME_MAX) return 'too_long';
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f\u007f]/.test(name)) return 'invalid_characters';
  // Generated names look like "Player 1234"; choosing one would hide that the name is unset.
  if (/^player\s*\d+$/i.test(name)) return 'reserved';
  return null;
}

/**
 * Public name from Sign in with Apple: given name plus family initial ("Dana H."), matching the
 * design's seller identity and keeping full surnames off public profiles.
 */
export function publicNameFromParts(given?: string | null, family?: string | null): string | null {
  const g = normalizeDisplayName(given ?? '');
  if (!g) return null;
  const f = normalizeDisplayName(family ?? '');
  const initial = Array.from(f)[0]?.toUpperCase();
  const name = initial ? `${g} ${initial}.` : g;
  return validateDisplayName(name) ? null : name;
}
