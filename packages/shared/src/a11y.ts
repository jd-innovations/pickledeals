import { formatPrice, percentOff } from './format';
import type { DealBadge } from './domain';

/**
 * VoiceOver labels (Phase 13). A card is one accessible element, so its label has to carry what a
 * sighted shopper reads off it: name, price, what it was, the saving and the badge. Labels never
 * contain a number for check-price offers (D1).
 */

/** Joins the parts that exist with VoiceOver's natural pause. */
export function spoken(...parts: (string | null | undefined | false)[]): string {
  return parts
    .filter((p): p is string => !!p && p.trim() !== '')
    .map((p) => p.trim())
    .join(', ');
}

/** Visual shorthand → words: "~3 mi" → "about 3 miles", "< 1 mi" → "under a mile", "·" → a pause, "↓" → "down", "+$4" → "$4 more". */
export function speakable(text: string): string {
  return text
    .replace(/<\s*1\s*mi\b/g, 'under a mile')
    .replace(/~\s*1\s*mi\b/g, 'about 1 mile')
    .replace(/~\s*([\d.]+)\s*mi\b/g, 'about $1 miles')
    .replace(/\s*·\s*/g, ', ')
    .replace(/(^|\s)\+(\$[\d,.]+)/g, '$1$2 more')
    .replace(/↓\s*/g, 'down ')
    .replace(/↑\s*/g, 'up ');
}

/** "PRICE DROP" → "Price drop": all-caps labels are a visual style, not something to shout or spell. */
export function spokenBadge(badge: DealBadge | null | undefined): string | null {
  return badge ? badge.charAt(0) + badge.slice(1).toLowerCase() : null;
}

/** "$195, was $234.99, 17% off", or "Check price" when the number can't be shown (D1). */
export function spokenPrice(priceCents: number | null | undefined, wasCents?: number | null, checkPriceLabel = 'Check price'): string {
  if (priceCents == null) return checkPriceLabel;
  const pct = wasCents ? percentOff(priceCents, wasCents) : null;
  return pct == null ? formatPrice(priceCents) : spoken(formatPrice(priceCents), `was ${formatPrice(wasCents!)}`, `${pct}% off`);
}
