import { geohashCenter, type Bounds, type ListingCondition } from '@pickledeals/shared';

import { requireSupabase } from '@/lib/supabase';

/**
 * Marketplace reads/writes (Phase 6). D2: the client never receives an exact coordinate — feeds carry
 * an area label and a server-computed approximate distance; the map and the listing's area use the
 * public geohash-6 cell centre only.
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
  productId: string | null;
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
  product_id: string | null;
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
  productId: r.product_id,
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
  origin?: { lat: number; lng: number } | null;
  useHome?: boolean;
  radiusM?: number | null;
  includeShipping?: boolean;
  category?: string;
  productId?: string;
  sellerId?: string;
  conditions?: ListingCondition[];
  brands?: string[];
  minCents?: number;
  maxCents?: number;
  pickupOnly?: boolean;
  statuses?: ListingStatus[];
  ids?: string[];
  text?: string;
  sort?: MarketSort;
  limit?: number;
};

export async function fetchMarket(q: MarketQuery): Promise<{ total: number; hasOrigin: boolean; items: ListingCardItem[] }> {
  const { data, error } = await requireSupabase().rpc('market_feed', {
    lat: q.origin?.lat,
    lng: q.origin?.lng,
    radius_m: q.radiusM === null ? undefined : (q.radiusM ?? 40000),
    include_shipping: q.includeShipping ?? true,
    category_slug: q.category,
    product: q.productId,
    seller: q.sellerId,
    conditions: q.conditions,
    brand_slugs: q.brands,
    min_cents: q.minCents,
    max_cents: q.maxCents,
    pickup_only: q.pickupOnly ?? false,
    statuses: q.statuses,
    sort: q.sort ?? 'nearest',
    max_rows: q.limit ?? 40,
    use_home: q.useHome ?? false,
    ids: q.ids,
    q: q.text?.trim() || undefined,
  });
  if (error) throw error;
  const raw = data as unknown as { total: number; has_origin: boolean; items: FeedRow[] };
  return { total: raw.total, hasOrigin: raw.has_origin, items: raw.items.map(toItem) };
}

/**
 * A listing on the map (Phase 7). `point` is the listing's public geohash-6 cell centre — the only
 * coordinate the server ever returns (D2); many listings in one cell share it.
 */
export type MapListing = Pick<
  ListingCardItem,
  'id' | 'status' | 'condition' | 'priceCents' | 'pickup' | 'ships' | 'title' | 'productSlug' | 'variantLabel' | 'hasVariants' | 'brandName' | 'categorySlug' | 'areaLabel' | 'distanceM' | 'bestNewCents' | 'imagePath'
> & { sellerName: string; imageCount: number; point: { lat: number; lng: number } };

type MapRow = Pick<FeedRow, 'id' | 'status' | 'condition' | 'price_cents' | 'pickup' | 'ships' | 'title' | 'product_slug' | 'variant_label' | 'has_variants' | 'brand_name' | 'category_slug' | 'area_label' | 'distance_m' | 'best_new_cents' | 'image_path'> & {
  seller_name: string;
  image_count: number;
  lat: number;
  lng: number;
};

export type BoundsQuery = Pick<MarketQuery, 'origin' | 'useHome' | 'category' | 'conditions' | 'brands' | 'minCents' | 'maxCents' | 'pickupOnly' | 'text'> & { bounds: Bounds };

export async function fetchMarketInBounds(q: BoundsQuery): Promise<{ total: number; truncated: boolean; items: MapListing[] }> {
  const { data, error } = await requireSupabase().rpc('market_in_bounds', {
    min_lng: q.bounds.minLng,
    min_lat: q.bounds.minLat,
    max_lng: q.bounds.maxLng,
    max_lat: q.bounds.maxLat,
    lat: q.origin?.lat,
    lng: q.origin?.lng,
    use_home: q.useHome ?? false,
    category_slug: q.category,
    conditions: q.conditions,
    brand_slugs: q.brands,
    min_cents: q.minCents,
    max_cents: q.maxCents,
    pickup_only: q.pickupOnly ?? false,
    q: q.text?.trim() || undefined,
  });
  if (error) throw error;
  const raw = data as unknown as { total: number; truncated: boolean; items: MapRow[] };
  return {
    total: raw.total,
    truncated: raw.truncated,
    items: raw.items.map((r) => ({
      id: r.id,
      status: r.status,
      condition: r.condition,
      priceCents: r.price_cents,
      pickup: r.pickup,
      ships: r.ships,
      title: r.title,
      productSlug: r.product_slug,
      variantLabel: r.variant_label,
      hasVariants: r.has_variants,
      brandName: r.brand_name,
      categorySlug: r.category_slug,
      areaLabel: r.area_label,
      distanceM: r.distance_m,
      bestNewCents: r.best_new_cents,
      imagePath: r.image_path,
      sellerName: r.seller_name,
      imageCount: r.image_count,
      point: { lat: r.lat, lng: r.lng },
    })),
  };
}

/** Public cell centres (D2) of a few listings, from their public geohash. */
export async function fetchListingCells(ids: string[]): Promise<Map<string, { lat: number; lng: number }>> {
  if (!ids.length) return new Map();
  const { data, error } = await requireSupabase().from('listing_locations').select('listing_id, geohash6').in('listing_id', ids);
  if (error) throw error;
  return new Map(data.map((r) => [r.listing_id, geohashCenter(r.geohash6)]));
}

export function listingImageUrl(path: string): string {
  return requireSupabase().storage.from('listing-images').getPublicUrl(path).data.publicUrl;
}

/** The caller's saved listings, including ones that have since gone pending or sold. */
export async function fetchSavedListings(): Promise<ListingCardItem[]> {
  const { data, error } = await requireSupabase().from('saved_listings').select('listing_id').order('created_at', { ascending: false });
  if (error) throw error;
  if (!data.length) return [];
  const order = data.map((r) => r.listing_id);
  const res = await fetchMarket({ ids: order, statuses: ['active', 'pending', 'sold'], radiusM: null, sort: 'newest', limit: 100 });
  return res.items.sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id));
}

// --- Listing detail ----------------------------------------------------------------------------

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
  customBrand: string | null;
  product: { id: string; slug: string; name: string; brand: string; categorySlug: string; specs: Record<string, string> } | null;
  variant: { id: string; label: string } | null;
  category: { slug: string; name: string };
  areaLabel: string | null;
  /** Public cell centre (D2) for the approximate-area map. */
  areaCenter: { lat: number; lng: number } | null;
  images: { path: string; width: number | null; height: number | null }[];
  seller: { id: string; name: string; memberSince: string; areaLabel: string | null };
  bestNewCents: number | null;
  bestNewRetailer: string | null;
  msrpCents: number | null;
  usedRange: { p25: number; p75: number } | null;
};

export async function fetchListing(id: string): Promise<ListingDetail> {
  const client = requireSupabase();
  const { data: l, error } = await client
    .from('listings')
    .select(
      'id, seller_id, status, condition, price_cents, accepts_offers, description, pickup, ships, published_at, custom_title, custom_brand_text, variant_id, ' +
        'product:products(id, slug, name, specs, msrp_cents, brand:brands(name), category:categories(slug)), variant:product_variants(id, label, msrp_cents), category:categories(slug, name), ' +
        'images:listing_images(storage_path, width, height, sort), location:listing_locations(area_label, geohash6)',
    )
    .eq('id', id)
    .single();
  if (error) throw error;
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
    product: { id: string; slug: string; name: string; specs: Record<string, string>; msrp_cents: number | null; brand: { name: string }; category: { slug: string } } | null;
    variant: { id: string; label: string; msrp_cents: number | null } | null;
    category: { slug: string; name: string };
    images: { storage_path: string; width: number | null; height: number | null; sort: number }[];
    location: { area_label: string; geohash6: string } | null;
  };

  const [seller, best, market] = await Promise.all([
    client.from('profiles').select('id, display_name, member_since, area_label').eq('id', row.seller_id).single(),
    row.variant_id
      ? client.from('variant_offer_ranking').select('delivered_cents, retailer_name').eq('variant_id', row.variant_id).eq('rank', 1).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    row.variant_id ? client.from('variant_market_stats').select('used_p25_cents, used_p75_cents').eq('variant_id', row.variant_id).maybeSingle() : Promise.resolve({ data: null, error: null }),
  ]);
  if (seller.error) throw seller.error;

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
    customBrand: row.custom_brand_text,
    product: row.product
      ? { id: row.product.id, slug: row.product.slug, name: row.product.name, brand: row.product.brand.name, categorySlug: row.product.category.slug, specs: row.product.specs ?? {} }
      : null,
    variant: row.variant ? { id: row.variant.id, label: row.variant.label } : null,
    category: row.category,
    areaLabel: row.location?.area_label ?? null,
    areaCenter: row.location ? geohashCenter(row.location.geohash6) : null,
    images: [...row.images].sort((a, b) => a.sort - b.sort).map((i) => ({ path: i.storage_path, width: i.width, height: i.height })),
    seller: { id: seller.data.id, name: seller.data.display_name, memberSince: seller.data.member_since, areaLabel: seller.data.area_label },
    bestNewCents: (best.data as { delivered_cents: number | null } | null)?.delivered_cents ?? null,
    bestNewRetailer: (best.data as { retailer_name: string } | null)?.retailer_name ?? null,
    msrpCents: row.variant?.msrp_cents ?? row.product?.msrp_cents ?? null,
    usedRange:
      market.data && (market.data as { used_p25_cents: number | null }).used_p25_cents
        ? { p25: (market.data as { used_p25_cents: number }).used_p25_cents, p75: (market.data as { used_p75_cents: number }).used_p75_cents }
        : null,
  };
}

// --- Seller ------------------------------------------------------------------------------------

export async function fetchSeller(id: string) {
  const client = requireSupabase();
  const [profile, active, sold] = await Promise.all([
    client.from('profiles').select('id, display_name, member_since, area_label').eq('id', id).single(),
    fetchMarket({ sellerId: id, statuses: ['active', 'pending'], radiusM: null, sort: 'newest', limit: 60 }),
    fetchMarket({ sellerId: id, statuses: ['sold'], radiusM: null, sort: 'newest', limit: 60 }),
  ]);
  if (profile.error) throw profile.error;
  return { id, name: profile.data.display_name, memberSince: profile.data.member_since, areaLabel: profile.data.area_label, active: active.items, sold: sold.items };
}

// --- My listings + mutations -------------------------------------------------------------------

export type MyListing = ListingCardItem & { saves: number; hideBelowCents: number | null; acceptsOffers: boolean; description: string };

export async function fetchMyListings(userId: string): Promise<MyListing[]> {
  const client = requireSupabase();
  const [all, counts, priv] = await Promise.all([
    fetchMarket({ sellerId: userId, statuses: ['active', 'pending', 'sold'], radiusM: null, sort: 'newest', limit: 100 }),
    client.rpc('my_listing_save_counts'),
    client.from('listing_private').select('listing_id, hide_offers_below_cents'),
  ]);
  const extra = await client.from('listings').select('id, accepts_offers, description').eq('seller_id', userId);
  const saves = new Map((counts.data ?? []).map((c) => [c.listing_id, c.saves]));
  const floors = new Map((priv.data ?? []).map((p) => [p.listing_id, p.hide_offers_below_cents]));
  const meta = new Map((extra.data ?? []).map((e) => [e.id, e]));
  return all.items.map((i) => ({
    ...i,
    saves: saves.get(i.id) ?? 0,
    hideBelowCents: floors.get(i.id) ?? null,
    acceptsOffers: meta.get(i.id)?.accepts_offers ?? true,
    description: meta.get(i.id)?.description ?? '',
  }));
}

export async function setListingStatus(id: string, status: 'active' | 'pending' | 'sold' | 'removed', soldPriceCents?: number) {
  const { error } = await requireSupabase().rpc('set_listing_status', { listing: id, status, sold_price: soldPriceCents });
  if (error) throw error;
}

export async function updateListing(
  id: string,
  changes: { price_cents?: number; description?: string; accepts_offers?: boolean; hide_offers_below_cents?: number | null; pickup?: boolean; ships?: boolean },
) {
  const { error } = await requireSupabase().rpc('update_listing', { listing: id, changes: changes as never });
  if (error) throw error;
}

/** Sell-flow price guide: best verified new price and what pre-owned goes for (variant-level). */
export type PriceGuide = { bestNewCents: number | null; usedP25: number | null; usedP75: number | null; activeListings: number };

export async function fetchPriceGuide(variantId: string): Promise<PriceGuide> {
  const client = requireSupabase();
  const [stats, market] = await Promise.all([
    client.from('variant_price_stats').select('best_delivered_cents').eq('variant_id', variantId).maybeSingle(),
    client.from('variant_market_stats').select('used_p25_cents, used_p75_cents, active_listings').eq('variant_id', variantId).maybeSingle(),
  ]);
  if (stats.error) throw stats.error;
  if (market.error) throw market.error;
  return {
    bestNewCents: stats.data?.best_delivered_cents ?? null,
    usedP25: market.data?.used_p25_cents ?? null,
    usedP75: market.data?.used_p75_cents ?? null,
    activeListings: market.data?.active_listings ?? 0,
  };
}

export type PublishPayload = {
  id: string;
  product_id?: string;
  variant_id?: string;
  category_id?: string;
  custom_title?: string;
  custom_brand_text?: string;
  brand_slug?: string;
  condition: ListingCondition;
  price_cents: number;
  accepts_offers: boolean;
  hide_offers_below_cents?: number;
  description: string;
  pickup: boolean;
  ships: boolean;
  images: { path: string; width: number; height: number }[];
  location: { lat: number; lng: number; area_label: string; postal_code?: string };
};

export async function publishListing(p: PublishPayload): Promise<string> {
  const { data, error } = await requireSupabase().rpc('publish_listing', { listing: p as never });
  if (error) throw error;
  return data as string;
}

export async function setHomeArea(lat: number, lng: number, label: string, radiusM?: number) {
  const { error } = await requireSupabase().rpc('set_home_area', { lat, lng, label, radius_m: radiusM });
  if (error) throw error;
}

export async function fetchHomeArea(): Promise<{ label: string | null; radiusM: number } | null> {
  const { data, error } = await requireSupabase().from('profiles_private').select('home_label, search_radius_m').maybeSingle();
  if (error) throw error;
  return data ? { label: data.home_label, radiusM: data.search_radius_m } : null;
}
