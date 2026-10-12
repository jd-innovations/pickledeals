import { geohashCenter, type ListingCondition } from '@pickledeals/shared';

import { db } from '@/lib/supabase';

/**
 * Marketplace reads. Mirrors apps/mobile/src/features/market/api.ts. D2: the site never receives an
 * exact coordinate — feeds carry an area label and an approximate distance; maps use the public
 * geohash-6 cell centre only.
 */

export type ListingStatus = 'draft' | 'active' | 'pending' | 'sold' | 'removed';

export type ListingCardItem = {
  id: string;
  sellerId: string;
  status: ListingStatus;
  condition: ListingCondition;
  priceCents: number;
  pickup: boolean;
  ships: boolean;
  publishedAt: string;
  title: string;
  productSlug: string | null;
  variantLabel: string | null;
  hasVariants: boolean;
  brandName: string | null;
  categorySlug: string;
  categoryName: string;
  areaLabel: string;
  distanceM: number | null;
  bestNewCents: number | null;
  imagePath: string | null;
};

type FeedRow = {
  id: string;
  seller_id: string;
  status: ListingStatus;
  condition: ListingCondition;
  price_cents: number;
  pickup: boolean;
  ships: boolean;
  published_at: string;
  title: string;
  product_slug: string | null;
  variant_label: string | null;
  has_variants: boolean;
  brand_name: string | null;
  category_slug: string;
  category_name: string;
  area_label: string;
  distance_m: number | null;
  best_new_cents: number | null;
  image_path: string | null;
};

const toItem = (r: FeedRow): ListingCardItem => ({
  id: r.id,
  sellerId: r.seller_id,
  status: r.status,
  condition: r.condition,
  priceCents: r.price_cents,
  pickup: r.pickup,
  ships: r.ships,
  publishedAt: r.published_at,
  title: r.title,
  productSlug: r.product_slug,
  variantLabel: r.variant_label,
  hasVariants: r.has_variants,
  brandName: r.brand_name,
  categorySlug: r.category_slug,
  categoryName: r.category_name,
  areaLabel: r.area_label,
  distanceM: r.distance_m,
  bestNewCents: r.best_new_cents,
  imagePath: r.image_path,
});

export type MarketSort = 'nearest' | 'newest' | 'price_asc' | 'price_desc';

export type MarketQuery = {
  /** Approximate visitor location (from the request's IP region), or none for nationwide. */
  origin?: { lat: number; lng: number } | null;
  radiusM?: number | null;
  category?: string;
  productId?: string;
  sellerId?: string;
  conditions?: ListingCondition[];
  minCents?: number;
  maxCents?: number;
  pickupOnly?: boolean;
  statuses?: ListingStatus[];
  text?: string;
  sort?: MarketSort;
  limit?: number;
};

export async function fetchMarket(q: MarketQuery): Promise<{ total: number; hasOrigin: boolean; items: ListingCardItem[] }> {
  const { data, error } = await db().rpc('market_feed', {
    lat: q.origin?.lat,
    lng: q.origin?.lng,
    radius_m: q.origin && q.radiusM !== null ? (q.radiusM ?? 40000) : undefined,
    include_shipping: true,
    category_slug: q.category,
    product: q.productId,
    seller: q.sellerId,
    conditions: q.conditions,
    min_cents: q.minCents,
    max_cents: q.maxCents,
    pickup_only: q.pickupOnly ?? false,
    statuses: q.statuses,
    sort: q.sort ?? (q.origin ? 'nearest' : 'newest'),
    max_rows: q.limit ?? 48,
    use_home: false,
    q: q.text?.trim() || undefined,
  });
  if (error) throw error;
  const raw = data as unknown as { total: number; has_origin: boolean; items: FeedRow[] };
  return { total: raw.total, hasOrigin: raw.has_origin, items: raw.items.map(toItem) };
}

/** A listing on the map: `point` is its public geohash-6 cell centre (D2). */
export type MapListing = Pick<ListingCardItem, 'id' | 'priceCents' | 'title' | 'brandName' | 'condition' | 'areaLabel' | 'imagePath' | 'categorySlug'> & {
  point: { lat: number; lng: number };
};

export type Bounds = { minLat: number; minLng: number; maxLat: number; maxLng: number };

export async function fetchMarketInBounds(bounds: Bounds, category?: string): Promise<{ total: number; truncated: boolean; items: MapListing[] }> {
  const { data, error } = await db().rpc('market_in_bounds', {
    min_lng: bounds.minLng,
    min_lat: bounds.minLat,
    max_lng: bounds.maxLng,
    max_lat: bounds.maxLat,
    use_home: false,
    category_slug: category,
    pickup_only: false,
  });
  if (error) throw error;
  const raw = data as unknown as {
    total: number;
    truncated: boolean;
    items: (Pick<FeedRow, 'id' | 'price_cents' | 'title' | 'brand_name' | 'condition' | 'area_label' | 'image_path' | 'category_slug'> & { lat: number; lng: number })[];
  };
  return {
    total: raw.total,
    truncated: raw.truncated,
    items: raw.items.map((r) => ({
      id: r.id,
      priceCents: r.price_cents,
      title: r.title,
      brandName: r.brand_name,
      condition: r.condition,
      areaLabel: r.area_label,
      imagePath: r.image_path,
      categorySlug: r.category_slug,
      point: { lat: r.lat, lng: r.lng },
    })),
  };
}

export type ListingDetail = {
  id: string;
  sellerId: string;
  status: ListingStatus;
  condition: ListingCondition;
  priceCents: number;
  acceptsOffers: boolean;
  description: string;
  pickup: boolean;
  ships: boolean;
  publishedAt: string | null;
  title: string;
  brand: string | null;
  product: { slug: string; name: string; specs: Record<string, string> } | null;
  variantLabel: string | null;
  category: { slug: string; name: string };
  areaLabel: string | null;
  /** Public cell centre (D2) for the approximate-area map. */
  areaCenter: { lat: number; lng: number } | null;
  images: string[];
  seller: { id: string; name: string; memberSince: string; areaLabel: string | null; avatarPath: string | null };
  bestNewCents: number | null;
};

export async function fetchListing(id: string): Promise<ListingDetail | null> {
  const { data: l, error } = await db()
    .from('listings')
    .select(
      'id, seller_id, status, condition, price_cents, accepts_offers, description, pickup, ships, published_at, custom_title, custom_brand_text, variant_id, ' +
        'product:products(slug, name, specs, brand:brands(name)), variant:product_variants(label), category:categories(slug, name), ' +
        'images:listing_images(storage_path, sort), location:listing_locations(area_label, geohash6)',
    )
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  if (!l) return null;
  const row = l as unknown as {
    id: string;
    seller_id: string;
    status: ListingStatus;
    condition: ListingCondition;
    price_cents: number;
    accepts_offers: boolean;
    description: string;
    pickup: boolean;
    ships: boolean;
    published_at: string | null;
    custom_title: string | null;
    custom_brand_text: string | null;
    variant_id: string | null;
    product: { slug: string; name: string; specs: Record<string, string> | null; brand: { name: string } } | null;
    variant: { label: string } | null;
    category: { slug: string; name: string };
    images: { storage_path: string; sort: number }[];
    location: { area_label: string; geohash6: string } | null;
  };
  if (!['active', 'pending', 'sold'].includes(row.status)) return null;

  const [seller, best] = await Promise.all([
    db().from('profiles').select('id, display_name, member_since, area_label, avatar_path').eq('id', row.seller_id).maybeSingle(),
    row.variant_id ? db().from('variant_offer_ranking').select('delivered_cents').eq('variant_id', row.variant_id).eq('rank', 1).maybeSingle() : Promise.resolve({ data: null, error: null }),
  ]);
  if (seller.error) throw seller.error;
  if (!seller.data) return null;

  return {
    id: row.id,
    sellerId: row.seller_id,
    status: row.status,
    condition: row.condition,
    priceCents: row.price_cents,
    acceptsOffers: row.accepts_offers,
    description: row.description,
    pickup: row.pickup,
    ships: row.ships,
    publishedAt: row.published_at,
    title: row.product ? row.product.name : (row.custom_title ?? ''),
    brand: row.product?.brand.name ?? row.custom_brand_text,
    product: row.product ? { slug: row.product.slug, name: row.product.name, specs: row.product.specs ?? {} } : null,
    variantLabel: row.variant?.label ?? null,
    category: row.category,
    areaLabel: row.location?.area_label ?? null,
    areaCenter: row.location ? geohashCenter(row.location.geohash6) : null,
    images: [...row.images].sort((a, b) => a.sort - b.sort).map((i) => i.storage_path),
    seller: { id: seller.data.id, name: seller.data.display_name, memberSince: seller.data.member_since, areaLabel: seller.data.area_label, avatarPath: seller.data.avatar_path },
    bestNewCents: (best.data as { delivered_cents: number | null } | null)?.delivered_cents ?? null,
  };
}

export async function fetchSeller(id: string) {
  const [profile, active] = await Promise.all([
    db().from('profiles').select('id, display_name, member_since, area_label, avatar_path').eq('id', id).maybeSingle(),
    fetchMarket({ sellerId: id, statuses: ['active', 'pending'], radiusM: null, sort: 'newest', limit: 60 }),
  ]);
  if (profile.error) throw profile.error;
  if (!profile.data) return null;
  return { id, name: profile.data.display_name, memberSince: profile.data.member_since, areaLabel: profile.data.area_label, avatarPath: profile.data.avatar_path, listings: active.items };
}
