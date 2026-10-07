import type { DealBadge, DealQuality } from '@pickledeals/shared';

import type { CatalogImage, Ref } from '@/features/catalog/api';
import type { LivePromo } from '@/features/offers/api';
import { requireSupabase } from '@/lib/supabase';

/** Deals discovery (Phase 4). Reads the public deal feed RPCs only. */

export type Deal = {
  id: string;
  kind: 'price_drop' | 'sale' | 'promo' | 'editorial';
  origin: 'auto' | 'curated';
  headline: string;
  isStaffPick: boolean;
  startsAt: string;
  endsAt: string | null;
  product: { id: string; slug: string; name: string };
  variant: { id: string; label: string; hasSiblings: boolean };
  brand: Ref;
  category: Ref;
  offerId: string;
  retailer: Ref;
  /** D1: 'check_price' deals carry no number. */
  priceDisplay: 'show' | 'check_price';
  priceCents: number | null;
  wasCents: number | null;
  msrpCents: number | null;
  discountPct: number | null;
  drop7dCents: number;
  inStock: boolean;
  promo: { id: string; code: string } | null;
  quality: DealQuality | null;
  offerCount: number;
  badges: DealBadge[];
  image: CatalogImage | null;
};

type Row = {
  deal_id: string;
  kind: Deal['kind'];
  origin: Deal['origin'];
  headline: string;
  is_staff_pick: boolean;
  starts_at: string;
  ends_at: string | null;
  product_id: string;
  product_slug: string;
  product_name: string;
  variant_id: string;
  variant_label: string;
  has_variants: boolean;
  brand_slug: string;
  brand_name: string;
  category_slug: string;
  category_name: string;
  offer_id: string;
  retailer_slug: string;
  retailer_name: string;
  price_display: Deal['priceDisplay'];
  price_cents: number | null;
  was_cents: number | null;
  msrp_cents: number | null;
  discount_pct: number | null;
  drop_7d_cents: number;
  in_stock: boolean;
  promo_id: string | null;
  promo_code: string | null;
  deal_quality: DealQuality | null;
  offer_count: number | null;
  badges: DealBadge[];
  image: { path: string; is_cutout: boolean; blurhash: string | null } | null;
};

export const toDeal = (r: Row): Deal => ({
  id: r.deal_id,
  kind: r.kind,
  origin: r.origin,
  headline: r.headline,
  isStaffPick: r.is_staff_pick,
  startsAt: r.starts_at,
  endsAt: r.ends_at,
  product: { id: r.product_id, slug: r.product_slug, name: r.product_name },
  variant: { id: r.variant_id, label: r.variant_label, hasSiblings: r.has_variants },
  brand: { slug: r.brand_slug, name: r.brand_name },
  category: { slug: r.category_slug, name: r.category_name },
  offerId: r.offer_id,
  retailer: { slug: r.retailer_slug, name: r.retailer_name },
  priceDisplay: r.price_display,
  priceCents: r.price_cents,
  wasCents: r.was_cents,
  msrpCents: r.msrp_cents,
  discountPct: r.discount_pct,
  drop7dCents: r.drop_7d_cents,
  inStock: r.in_stock,
  promo: r.promo_id && r.promo_code ? { id: r.promo_id, code: r.promo_code } : null,
  quality: r.deal_quality,
  offerCount: r.offer_count ?? 0,
  badges: r.badges ?? [],
  image: r.image ? { path: r.image.path, isCutout: r.image.is_cutout, blurhash: r.image.blurhash } : null,
});

export const FEEDS = ['today', 'price_drops', 'ending_soon', 'promo_codes', 'under_50', 'under_100', 'new', 'staff_picks'] as const;
export type Feed = (typeof FEEDS)[number];
export const SORTS = ['best', 'discount', 'drop', 'price_asc', 'price_desc', 'ending', 'newest'] as const;
export type Sort = (typeof SORTS)[number];

export type FeedQuery = {
  feed?: Feed;
  category?: string;
  brand?: string;
  collection?: string;
  minCents?: number;
  maxCents?: number;
  brands?: string[];
  kinds?: Deal['kind'][];
  inStockOnly?: boolean;
  sort?: Sort;
  limit?: number;
};

export async function fetchDeals(q: FeedQuery, skip = 0): Promise<{ total: number; items: Deal[] }> {
  const { data, error } = await requireSupabase().rpc('deals_feed', {
    feed: q.feed ?? 'today',
    category_slug: q.category,
    brand_slug: q.brand,
    collection_slug: q.collection,
    min_cents: q.minCents,
    max_cents: q.maxCents,
    brand_slugs: q.brands,
    kinds: q.kinds,
    in_stock_only: q.inStockOnly ?? false,
    sort: q.sort,
    max_rows: q.limit ?? 60,
    skip,
  });
  if (error) throw error;
  const raw = data as unknown as { total: number; items: Row[] };
  return { total: raw.total, items: raw.items.map(toDeal) };
}

export type HomeCollection = { slug: string; title: string; subtitle: string | null; eyebrow: string | null; dealCount: number; fromCents: number | null };

export type DealsHome = {
  liveCount: number;
  checkedAt: string | null;
  hero: Deal | null;
  priceDrops: Deal[];
  trending: { category: Ref; items: Deal[] } | null;
  collections: HomeCollection[];
  sponsored: { label: string; campaign: string; deal: Deal }[];
  promos: LivePromo[];
  under100: Deal[];
};

type PromoRow = {
  id: string;
  retailer_slug: string;
  retailer_name: string;
  code: string;
  title: string;
  discount_type: LivePromo['discountType'];
  discount_value: number;
  min_purchase_cents: number;
  ends_at: string | null;
  verified_at: string;
  is_exclusive: boolean;
  terms: string | null;
};

export async function fetchHome(): Promise<DealsHome> {
  const { data, error } = await requireSupabase().rpc('deals_home');
  if (error) throw error;
  const h = data as unknown as {
    live_count: number;
    checked_at: string | null;
    hero: Row | null;
    price_drops: Row[] | null;
    trending: { category_slug: string; category_name: string; items: Row[] } | null;
    collections: { slug: string; title: string; subtitle: string | null; eyebrow: string | null; deal_count: number; from_cents: number | null }[];
    sponsored: { label: string; campaign: string; deal: Row }[];
    promos: PromoRow[];
    under_100: Row[] | null;
  };
  return {
    liveCount: h.live_count,
    checkedAt: h.checked_at,
    hero: h.hero ? toDeal(h.hero) : null,
    priceDrops: (h.price_drops ?? []).map(toDeal),
    trending: h.trending ? { category: { slug: h.trending.category_slug, name: h.trending.category_name }, items: h.trending.items.map(toDeal) } : null,
    collections: h.collections.map((c) => ({ slug: c.slug, title: c.title, subtitle: c.subtitle, eyebrow: c.eyebrow, dealCount: c.deal_count, fromCents: c.from_cents })),
    sponsored: h.sponsored.map((s) => ({ label: s.label, campaign: s.campaign, deal: toDeal(s.deal) })),
    promos: h.promos.map((p) => ({
      id: p.id,
      retailerSlug: p.retailer_slug,
      retailerName: p.retailer_name,
      code: p.code,
      title: p.title,
      discountType: p.discount_type,
      discountValue: p.discount_value,
      minPurchaseCents: p.min_purchase_cents,
      endsAt: p.ends_at,
      verifiedAt: p.verified_at,
      isExclusive: p.is_exclusive,
      terms: p.terms,
    })),
    under100: (h.under_100 ?? []).map(toDeal),
  };
}

export async function fetchCollection(slug: string) {
  const { data, error } = await requireSupabase().from('collections').select('slug, title, subtitle, eyebrow').eq('slug', slug).single();
  if (error) throw error;
  return data;
}
