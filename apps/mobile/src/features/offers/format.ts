import { formatChatSeparator, formatPrice } from '@pickledeals/shared';

import type { RankedOffer, VariantStats } from './api';

/** Copy for offers, shared by Product, All offers and Deal detail so they always agree. */

export function shippingLabel(o: RankedOffer): string {
  if (o.shippingCents == null) return '';
  return o.shippingCents === 0 ? 'free shipping' : `${formatPrice(o.shippingCents)} shipping`;
}

/** "$189 + $6 shipping", "$229 − $34 code + free shipping". */
export function offerBreakdown(o: RankedOffer): string {
  if (o.priceCents == null) return 'Price shown at retailer';
  const parts = [formatPrice(o.priceCents)];
  if (o.promo) parts.push(`− ${formatPrice(o.promo.discountCents)} code`);
  parts.push(`+ ${shippingLabel(o)}`);
  return parts.join(' ');
}

export function stockLabel(o: RankedOffer): string {
  return o.inStock ? 'In stock' : 'Out of stock';
}

/** "+$16" against the best delivered price, or "Best". */
export function deltaLabel(o: RankedOffer, bestCents: number | null): string | undefined {
  if (o.deliveredCents == null || bestCents == null) return undefined;
  const d = o.deliveredCents - bestCents;
  return d <= 0 ? 'Best' : `+${formatPrice(d)}`;
}

/** Deal-quality detail line: "Typical $219 · 90-day low $159". */
export function qualityDetail(s: VariantStats): string | undefined {
  const parts = [s.typicalCents != null ? `Typical ${formatPrice(s.typicalCents)}` : null, s.low90dCents != null ? `90-day low ${formatPrice(s.low90dCents)}` : null];
  const text = parts.filter(Boolean).join(' · ');
  return text || undefined;
}

/** Live API prices (Amazon). The database hides them after 60 minutes; screens still show the time. */
export const isApiPrice = (o: RankedOffer) => o.priceSource === 'api' && o.priceDisplay === 'show';

/** "Price as of 3:05 PM" (or "Yesterday 9:12 PM" for an old cached screen). */
export const priceAsOf = (o: RankedOffer) => `Price as of ${formatChatSeparator(o.checkedAt).replace(/^Today /, '')}`;

/** Amazon Associates' required disclaimer, whenever an API price is on screen. */
export function apiPriceDisclaimer(offers: RankedOffer[]): string | null {
  const o = offers.find(isApiPrice);
  if (!o) return null;
  const site = o.retailer.slug === 'amazon' ? 'Amazon.com' : o.retailer.name;
  return `Product prices and availability are accurate as of the date/time indicated and are subject to change. Any price and availability information displayed on ${site} at the time of purchase will apply to the purchase of this product.`;
}

export const AFFILIATE_DISCLOSURE = 'Affiliate links — PickleDeals may earn a commission. Offers are ranked by what you pay, never by commission.';
