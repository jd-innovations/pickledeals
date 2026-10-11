import { formatPrice, LISTING_CONDITIONS, percentOff, type DealQuality, type ListingCondition } from '@pickledeals/shared';

import type { Deal } from '@/data/deals';
import type { LivePromo, RankedOffer, VariantStats } from '@/data/offers';

/** Copy shared by the website's deal, product and listing views. Mirrors apps/mobile/src/features/offers/format.ts. */

export const AFFILIATE_DISCLOSURE =
  'Affiliate links — PickleDeals may earn a commission. Offers are ranked by price after codes, never by commission. Prices exclude tax and shipping, which the store settles at checkout.';

export const UNTRACKED_NOTE = 'Price history doesn’t include Amazon.';

export const QUALITY_LABEL: Record<DealQuality, string> = {
  above_typical: 'Above typical price',
  typical: 'Typical price',
  good: 'Good deal',
  excellent: 'Excellent deal',
  all_time_low: 'All-time low',
};

export const conditionLabel = (c: ListingCondition) => LISTING_CONDITIONS.find((x) => x.value === c)?.label ?? c;

/** "free shipping", the store's policy ("free shipping over $39"), or "shipping at checkout". */
export function shippingLabel(o: RankedOffer): string {
  if (o.shippingCents == null) return '';
  if (o.shippingCents === 0) return 'free shipping';
  const policy = o.shippingPolicy?.trim();
  return policy ? policy.charAt(0).toLowerCase() + policy.slice(1) : 'shipping at checkout';
}

/** "$229, or $179 with code DINK15 · free shipping". */
export function offerDetail(o: RankedOffer): string {
  if (o.priceDisplay !== 'show' || o.priceCents == null) return 'Price shown at the store';
  const price = o.promo && o.deliveredCents != null ? `${formatPrice(o.priceCents)}, or ${formatPrice(o.deliveredCents)} with code ${o.promo.code}` : formatPrice(o.priceCents);
  return [price, o.inStock ? null : 'out of stock', shippingLabel(o), o.shipsFrom ? `ships from ${o.shipsFrom}` : null].filter(Boolean).join(' · ');
}

/** Main button copy; the code itself lives in the promo row, never in the button. */
export const dealButtonLabel = (o: Pick<RankedOffer, 'promo' | 'codeAutoApplied' | 'retailer'>) =>
  o.promo && !o.codeAutoApplied ? 'Copy code & get deal' : o.retailer.name.length <= 16 ? `Get deal at ${o.retailer.name}` : 'Get deal';

export const promoDetail = (o: RankedOffer, promo: LivePromo | undefined) =>
  [o.codeAutoApplied ? 'Applied at checkout' : 'Copied when you click Get deal', promo?.terms].filter(Boolean).join(' · ');

/** "+$16" against the best price, or "Best price". */
export function deltaLabel(o: RankedOffer, bestCents: number | null): string {
  if (o.deliveredCents == null || bestCents == null || o.priceDisplay !== 'show') return '';
  const d = o.deliveredCents - bestCents;
  return d <= 0 ? 'Best price' : `+${formatPrice(d)}`;
}

/** "Typical $219 · 90-day low $159". */
export function qualityDetail(s: VariantStats): string {
  return [s.typicalCents != null ? `Typical ${formatPrice(s.typicalCents)}` : null, s.low90dCents != null ? `90-day low ${formatPrice(s.low90dCents)}` : null]
    .filter(Boolean)
    .join(' · ');
}

/** Store-owner disclosure for connected retailers ("…: PickleDeals’ owner also owns this store."). */
export function ownershipDisclosure(offers: (RankedOffer | null | undefined)[]): string | null {
  const seen = new Map<string, string>();
  for (const o of offers) if (o?.ownershipNote) seen.set(o.retailer.name, o.ownershipNote);
  return seen.size ? [...seen].map(([name, note]) => `${name}: ${note}.`).join(' ') : null;
}

/** A deal's reference price for the strike-through and the discount pill. */
export const dealReference = (d: Deal) => d.wasCents ?? d.msrpCents;

export function dealPercent(d: Deal): number | null {
  const ref = dealReference(d);
  return d.priceDisplay === 'show' && d.priceCents != null && ref ? percentOff(d.priceCents, ref) : null;
}

/** "JOOLA.com · with code", "Ends in 5h", "CourtSide Pro Shop · dropped $40". */
export function dealMeta(d: Deal, endsIn: (at: string) => string): string {
  if (d.endsAt && Date.parse(d.endsAt) - Date.now() < 48 * 3600_000) return endsIn(d.endsAt);
  if (d.promo) return `${d.retailer.name} · with code`;
  if (d.drop7dCents >= 100) return `${d.retailer.name} · dropped ${formatPrice(d.drop7dCents)}`;
  return d.retailer.name;
}

export function promoValue(p: LivePromo): string {
  if (p.discountType === 'percent') return `${p.discountValue}% off`;
  if (p.discountType === 'amount') return `${formatPrice(p.discountValue)} off`;
  return 'Free shipping';
}

/** Two- to five-letter monogram for a store or brand without a logo. */
export function monogram(name: string): string {
  const base = name.replace(/\.(com|net|org)$/i, '');
  const words = base.split(/[\s-]+/).filter(Boolean);
  if (words.length > 1) return words.slice(0, 3).map((w) => w[0]!.toUpperCase()).join('');
  return (base.length <= 5 ? base : base.slice(0, 4)).toUpperCase();
}
