import type { DealQuality } from '@pickledeals/shared';

import { db } from '@/lib/supabase';

/**
 * Retail reads. Mirrors apps/mobile/src/features/offers/api.ts: only the ranking view, live codes,
 * stats and history — never raw offers (D1: stored API prices of check-price offers stay server-side).
 */

export type RankedOffer = {
  offerId: string;
  variantId: string;
  retailer: { slug: string; name: string };
  /** D1: 'check_price' offers carry no price and render a CTA. */
  priceDisplay: 'show' | 'check_price';
  priceCents: number | null;
  shippingCents: number | null;
  deliveredCents: number | null;
  promo: { id: string; code: string; discountCents: number } | null;
  rank: number | null;
  inStock: boolean;
  sizes: string[];
  checkedAt: string;
  priceSource: 'manual' | 'feed' | 'api';
  trackingExcluded: boolean;
  shipsFrom: string | null;
  ownershipNote: string | null;
  codeAutoApplied: boolean;
  shippingPolicy: string | null;
};

export type VariantStats = {
  variantId: string;
  bestOfferId: string | null;
  bestDeliveredCents: number | null;
  offerCount: number;
  typicalCents: number | null;
  low30dCents: number | null;
  low90dCents: number | null;
  lowAllTimeCents: number | null;
  historyDays: number;
  quality: DealQuality | null;
};

export type LivePromo = {
  id: string;
  retailerSlug: string;
  retailerName: string;
  code: string;
  title: string;
  discountType: 'percent' | 'amount' | 'free_ship';
  discountValue: number;
  minPurchaseCents: number;
  endsAt: string | null;
  verifiedAt: string;
  isExclusive: boolean;
  terms: string | null;
};

export type PromoRow = {
  id: string;
  retailer_slug: string;
  retailer_name: string;
  code: string;
  title: string;
  discount_type: LivePromo['discountType'];
  discount_value: number;
  min_purchase_cents: number | null;
  ends_at: string | null;
  verified_at: string;
  is_exclusive: boolean | null;
  terms: string | null;
};

export const toPromo = (p: PromoRow): LivePromo => ({
  id: p.id,
  retailerSlug: p.retailer_slug,
  retailerName: p.retailer_name,
  code: p.code,
  title: p.title,
  discountType: p.discount_type,
  discountValue: p.discount_value,
  minPurchaseCents: p.min_purchase_cents ?? 0,
  endsAt: p.ends_at,
  verifiedAt: p.verified_at,
  isExclusive: p.is_exclusive ?? false,
  terms: p.terms,
});

type RankingRow = {
  offer_id: string;
  variant_id: string;
  retailer_slug: string;
  retailer_name: string;
  price_display: RankedOffer['priceDisplay'];
  price_cents: number | null;
  shipping_cents: number | null;
  delivered_cents: number | null;
  promo_id: string | null;
  promo_code: string | null;
  promo_discount_cents: number | null;
  rank: number | null;
  in_stock: boolean;
  available_sizes: string[] | null;
  last_checked_at: string;
  price_source: RankedOffer['priceSource'];
  tracking_excluded: boolean;
  ships_from: string | null;
  ownership_note: string | null;
  code_auto_applied: boolean | null;
  shipping_policy: string | null;
};

const RANKING_COLUMNS =
  'offer_id, variant_id, retailer_slug, retailer_name, price_display, price_cents, shipping_cents, delivered_cents, promo_id, promo_code, promo_discount_cents, rank, in_stock, available_sizes, last_checked_at, price_source, tracking_excluded, ships_from, ownership_note, code_auto_applied, shipping_policy';

const toOffer = (r: RankingRow): RankedOffer => ({
  offerId: r.offer_id,
  variantId: r.variant_id,
  retailer: { slug: r.retailer_slug, name: r.retailer_name },
  priceDisplay: r.price_display,
  priceCents: r.price_cents,
  shippingCents: r.shipping_cents,
  deliveredCents: r.delivered_cents,
  promo: r.promo_id && r.promo_code ? { id: r.promo_id, code: r.promo_code, discountCents: r.promo_discount_cents ?? 0 } : null,
  rank: r.rank,
  inStock: r.in_stock,
  sizes: r.available_sizes ?? [],
  checkedAt: r.last_checked_at,
  priceSource: r.price_source,
  trackingExcluded: r.tracking_excluded,
  shipsFrom: r.ships_from,
  ownershipNote: r.ownership_note,
  codeAutoApplied: r.code_auto_applied ?? false,
  shippingPolicy: r.shipping_policy,
});

/** Priced offers in rank order, then check-price offers (D1: listed, never ranked). */
export const sortOffers = (offers: RankedOffer[]) =>
  [...offers].sort((a, b) => (a.rank ?? Number.MAX_SAFE_INTEGER) - (b.rank ?? Number.MAX_SAFE_INTEGER) || a.retailer.name.localeCompare(b.retailer.name));

export async function fetchProductOffers(productId: string): Promise<{ offers: RankedOffer[]; stats: VariantStats[] }> {
  const { data: offers, error } = await db().from('variant_offer_ranking').select(RANKING_COLUMNS).eq('product_id', productId).returns<RankingRow[]>();
  if (error) throw error;
  const variantIds = [...new Set(offers.map((o) => o.variant_id))];
  const { data: stats, error: statsError } = variantIds.length
    ? await db().from('variant_price_stats').select('*').in('variant_id', variantIds)
    : { data: [], error: null };
  if (statsError) throw statsError;
  return {
    offers: sortOffers(offers.map(toOffer)),
    stats: (stats ?? []).map((s) => ({
      variantId: s.variant_id,
      bestOfferId: s.best_offer_id,
      bestDeliveredCents: s.best_delivered_cents,
      offerCount: s.offer_count,
      typicalCents: s.typical_cents,
      low30dCents: s.low_30d_cents,
      low90dCents: s.low_90d_cents,
      lowAllTimeCents: s.low_all_time_cents,
      historyDays: s.history_days,
      quality: s.deal_quality as DealQuality | null,
    })),
  };
}

export async function fetchOffer(offerId: string): Promise<(RankedOffer & { productId: string }) | null> {
  const { data, error } = await db().from('variant_offer_ranking').select(`${RANKING_COLUMNS}, product_id`).eq('offer_id', offerId).maybeSingle<RankingRow & { product_id: string }>();
  if (error) throw error;
  return data ? { ...toOffer(data), productId: data.product_id } : null;
}

export async function fetchLivePromos(retailerSlugs?: string[]): Promise<LivePromo[]> {
  let q = db().from('live_promo_codes').select('*');
  if (retailerSlugs) {
    if (!retailerSlugs.length) return [];
    q = q.in('retailer_slug', retailerSlugs);
  }
  const { data, error } = await q;
  if (error) throw error;
  return (data as unknown as PromoRow[]).map(toPromo);
}

export type HistoryPoint = { day: string; cents: number };

export async function fetchPriceHistory(variantId: string, days: number): Promise<HistoryPoint[]> {
  const { data, error } = await db().rpc('price_history', { variant: variantId, days });
  if (error) throw error;
  return (data ?? []).map((r) => ({ day: r.day, cents: r.low_cents }));
}
