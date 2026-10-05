import type { DealQuality } from '@pickledeals/shared';

import { requireSupabase } from '@/lib/supabase';

/**
 * Retail reads (Phase 3). Clients only ever see the ranking view, live codes, stats and history —
 * never raw offers (D1: stored API prices of check-price offers stay server-side).
 */

export type RankedOffer = {
  offerId: string;
  variantId: string;
  retailer: { slug: string; name: string; kind: 'marketplace' | 'retailer' | 'manufacturer' };
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
  /** 'api' = live Amazon Creators API price: shown with an "as of" time and Amazon's disclaimer. */
  priceSource: 'manual' | 'feed' | 'api';
  /** Retailer kept out of price history, deal quality and alerts (always Amazon). */
  trackingExcluded: boolean;
  /** Supplier that ships the item for the retailer (Shopify Collective). */
  shipsFrom: string | null;
  /** Disclosure for a retailer connected to PickleDeals (e.g. the same owner). */
  ownershipNote: string | null;
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

type RankingRow = {
  offer_id: string;
  variant_id: string;
  retailer_slug: string;
  retailer_name: string;
  retailer_kind: RankedOffer['retailer']['kind'];
  price_display: RankedOffer['priceDisplay'];
  price_cents: number | null;
  shipping_cents: number | null;
  delivered_cents: number | null;
  promo_id: string | null;
  promo_code: string | null;
  promo_discount_cents: number | null;
  rank: number | null;
  in_stock: boolean;
  available_sizes: string[];
  last_checked_at: string;
  price_source: RankedOffer['priceSource'];
  tracking_excluded: boolean;
  ships_from: string | null;
  ownership_note: string | null;
};

const RANKING_COLUMNS =
  'offer_id, variant_id, retailer_slug, retailer_name, retailer_kind, price_display, price_cents, shipping_cents, delivered_cents, promo_id, promo_code, promo_discount_cents, rank, in_stock, available_sizes, last_checked_at, price_source, tracking_excluded, ships_from, ownership_note';

const toOffer = (r: RankingRow): RankedOffer => ({
  offerId: r.offer_id,
  variantId: r.variant_id,
  retailer: { slug: r.retailer_slug, name: r.retailer_name, kind: r.retailer_kind },
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
});

/** Priced offers in rank order, then check-price offers (D1: listed, never ranked). */
export const sortOffers = (offers: RankedOffer[]) =>
  [...offers].sort((a, b) => (a.rank ?? Number.MAX_SAFE_INTEGER) - (b.rank ?? Number.MAX_SAFE_INTEGER) || a.retailer.name.localeCompare(b.retailer.name));

export async function fetchProductOffers(productId: string): Promise<{ offers: RankedOffer[]; stats: VariantStats[] }> {
  const client = requireSupabase();
  const { data: offers, error } = await client.from('variant_offer_ranking').select(RANKING_COLUMNS).eq('product_id', productId).returns<RankingRow[]>();
  if (error) throw error;
  const variantIds = [...new Set(offers.map((o) => o.variant_id))];
  const { data: stats, error: statsError } = variantIds.length
    ? await client.from('variant_price_stats').select('*').in('variant_id', variantIds)
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
      quality: s.deal_quality,
    })),
  };
}

export async function fetchOffer(offerId: string): Promise<RankedOffer & { productId: string }> {
  const { data, error } = await requireSupabase()
    .from('variant_offer_ranking')
    .select(`${RANKING_COLUMNS}, product_id`)
    .eq('offer_id', offerId)
    .single<RankingRow & { product_id: string }>();
  if (error) throw error;
  return { ...toOffer(data), productId: data.product_id };
}

export async function fetchLivePromos(retailerSlugs: string[]): Promise<LivePromo[]> {
  if (!retailerSlugs.length) return [];
  const { data, error } = await requireSupabase().from('live_promo_codes').select('*').in('retailer_slug', retailerSlugs);
  if (error) throw error;
  return data.map((p) => ({
    id: p.id!,
    retailerSlug: p.retailer_slug!,
    retailerName: p.retailer_name!,
    code: p.code!,
    title: p.title!,
    discountType: p.discount_type!,
    discountValue: p.discount_value!,
    minPurchaseCents: p.min_purchase_cents ?? 0,
    endsAt: p.ends_at,
    verifiedAt: p.verified_at!,
    isExclusive: p.is_exclusive ?? false,
    terms: p.terms,
  }));
}

export type HistoryPoint = { day: string; cents: number };

export async function fetchPriceHistory(variantId: string, days: number, retailerSlug?: string): Promise<HistoryPoint[]> {
  const { data, error } = await requireSupabase().rpc('price_history', { variant: variantId, days, retailer_slug: retailerSlug });
  if (error) throw error;
  return (data ?? []).map((r) => ({ day: r.day, cents: r.low_cents }));
}

export type PriceChange = { at: string; retailer: string; previousCents: number; cents: number };

export async function fetchRecentChanges(variantId: string): Promise<PriceChange[]> {
  const { data, error } = await requireSupabase().rpc('recent_price_changes', { variant: variantId, max_rows: 6 });
  if (error) throw error;
  return (data ?? []).map((r) => ({ at: r.observed_at, retailer: r.retailer_name, previousCents: r.previous_cents, cents: r.price_cents }));
}

/**
 * "Get deal" goes through the go redirect (server adds the affiliate tag and logs the click).
 * The client never builds retailer or affiliate URLs (§10).
 */
export function goUrl(offerId: string, placement: string, promoId?: string): string {
  const base = process.env.EXPO_PUBLIC_SUPABASE_URL;
  const q = new URLSearchParams({ o: offerId, pl: placement });
  if (promoId) q.set('p', promoId);
  return `${base}/functions/v1/go?${q.toString()}`;
}
