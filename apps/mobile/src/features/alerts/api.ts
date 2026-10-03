import type { CatalogImage, Ref } from '@/features/catalog/api';
import { toDeal, type Deal } from '@/features/deals/api';
import { requireSupabase } from '@/lib/supabase';

/** Phase 5: the signed-in user's saves, follows, alerts, saved searches and notifications (owner-only). */

export type SavedIds = { products: Set<string>; deals: Set<string>; brands: Set<string>; listings: Set<string> };

export async function fetchSavedIds(): Promise<SavedIds> {
  const client = requireSupabase();
  const [p, d, b, l] = await Promise.all([
    client.from('saved_products').select('product_id'),
    client.from('saved_deals').select('deal_id'),
    client.from('brand_follows').select('brand_id'),
    client.from('saved_listings').select('listing_id'),
  ]);
  for (const r of [p, d, b, l]) if (r.error) throw r.error;
  return {
    products: new Set(p.data!.map((x) => x.product_id)),
    deals: new Set(d.data!.map((x) => x.deal_id)),
    brands: new Set(b.data!.map((x) => x.brand_id)),
    listings: new Set(l.data!.map((x) => x.listing_id)),
  };
}

export type SaveKind = 'product' | 'deal' | 'brand' | 'listing';
const TABLE = { product: ['saved_products', 'product_id'], deal: ['saved_deals', 'deal_id'], brand: ['brand_follows', 'brand_id'], listing: ['saved_listings', 'listing_id'] } as const;

export async function setSaved(userId: string, kind: SaveKind, id: string, saved: boolean): Promise<void> {
  const [table, column] = TABLE[kind];
  // The four tables share a shape (user_id + one target id); the union defeats per-table typing.
  const t = requireSupabase().from(table as 'saved_products');
  const col = column as 'product_id';
  const { error } = saved
    ? await t.upsert({ user_id: userId, [col]: id } as { user_id: string; product_id: string }, { onConflict: `user_id,${column}`, ignoreDuplicates: true })
    : await t.delete().eq(col, id);
  if (error) throw error;
}

// --- Saved library ------------------------------------------------------------------------------

export type SavedProduct = { productId: string; slug: string; name: string; brand: Ref; category: Ref; image: CatalogImage | null; savedAt: string };

export async function fetchSavedProducts(): Promise<SavedProduct[]> {
  const { data, error } = await requireSupabase()
    .from('saved_products')
    .select('created_at, product:products!inner(id, slug, name, brand:brands(slug, name), category:categories(slug, name), images:product_images(storage_path, is_cutout, blurhash, sort))')
    .order('created_at', { ascending: false })
    .returns<
      {
        created_at: string;
        product: { id: string; slug: string; name: string; brand: Ref; category: Ref; images: { storage_path: string; is_cutout: boolean; blurhash: string | null; sort: number }[] };
      }[]
    >();
  if (error) throw error;
  return data.map((r) => {
    const img = [...r.product.images].sort((a, b) => a.sort - b.sort)[0];
    return {
      productId: r.product.id,
      slug: r.product.slug,
      name: r.product.name,
      brand: r.product.brand,
      category: r.product.category,
      image: img ? { path: img.storage_path, isCutout: img.is_cutout, blurhash: img.blurhash } : null,
      savedAt: r.created_at,
    };
  });
}

export async function fetchFollowedBrands(): Promise<(Ref & { id: string; logoPath: string | null })[]> {
  const { data, error } = await requireSupabase().from('brand_follows').select('brand:brands!inner(id, slug, name, logo_path)').order('created_at', { ascending: false });
  if (error) throw error;
  return data.map((r) => {
    const b = r.brand as unknown as { id: string; slug: string; name: string; logo_path: string | null };
    return { id: b.id, slug: b.slug, name: b.name, logoPath: b.logo_path };
  });
}

// --- Price alerts --------------------------------------------------------------------------------

export type PriceAlert = {
  id: string;
  product: { id: string; slug: string; name: string; brand: string; category: Ref; image: CatalogImage | null };
  variant: { id: string; label: string } | null;
  targetCents: number;
  includeUsed: boolean;
  status: 'active' | 'paused';
  lastNotifiedCents: number | null;
  createdAt: string;
};

export async function fetchAlerts(): Promise<PriceAlert[]> {
  const { data, error } = await requireSupabase()
    .from('price_alerts')
    .select(
      'id, target_cents, include_used, status, last_notified_cents, created_at, variant:product_variants(id, label), product:products!inner(id, slug, name, brand:brands(name), category:categories(slug, name), images:product_images(storage_path, is_cutout, blurhash, sort))',
    )
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data.map((r) => {
    const p = r.product as unknown as {
      id: string;
      slug: string;
      name: string;
      brand: { name: string };
      category: Ref;
      images: { storage_path: string; is_cutout: boolean; blurhash: string | null; sort: number }[];
    };
    const img = [...p.images].sort((a, b) => a.sort - b.sort)[0];
    return {
      id: r.id,
      product: { id: p.id, slug: p.slug, name: p.name, brand: p.brand.name, category: p.category, image: img ? { path: img.storage_path, isCutout: img.is_cutout, blurhash: img.blurhash } : null },
      variant: (r.variant as unknown as { id: string; label: string } | null) ?? null,
      targetCents: r.target_cents,
      includeUsed: r.include_used,
      status: r.status,
      lastNotifiedCents: r.last_notified_cents,
      createdAt: r.created_at,
    };
  });
}

export async function upsertAlert(userId: string, a: { id?: string; productId: string; variantId: string | null; targetCents: number; includeUsed: boolean }): Promise<void> {
  const client = requireSupabase();
  const { error } = a.id
    ? await client.from('price_alerts').update({ target_cents: a.targetCents, include_used: a.includeUsed, status: 'active' }).eq('id', a.id)
    : await client.from('price_alerts').insert({ user_id: userId, product_id: a.productId, variant_id: a.variantId, target_cents: a.targetCents, include_used: a.includeUsed });
  if (error) throw error;
}

export async function setAlertStatus(id: string, status: 'active' | 'paused') {
  const { error } = await requireSupabase().from('price_alerts').update({ status }).eq('id', id);
  if (error) throw error;
}

export async function deleteAlert(id: string) {
  const { error } = await requireSupabase().from('price_alerts').delete().eq('id', id);
  if (error) throw error;
}

// --- Saved searches ------------------------------------------------------------------------------

export type SavedSearch = { id: string; label: string; categorySlug: string | null; brandSlug: string | null; maxCents: number | null; notify: boolean; createdAt: string };

export async function fetchSavedSearches(): Promise<SavedSearch[]> {
  const { data, error } = await requireSupabase().from('saved_searches').select('id, label, category_slug, brand_slug, max_cents, notify, created_at').order('created_at', { ascending: false });
  if (error) throw error;
  return data.map((s) => ({ id: s.id, label: s.label, categorySlug: s.category_slug, brandSlug: s.brand_slug, maxCents: s.max_cents, notify: s.notify, createdAt: s.created_at }));
}

export async function createSavedSearch(userId: string, s: { label: string; categorySlug?: string; brandSlug?: string; maxCents?: number }) {
  const { error } = await requireSupabase()
    .from('saved_searches')
    .insert({ user_id: userId, label: s.label, category_slug: s.categorySlug ?? null, brand_slug: s.brandSlug ?? null, max_cents: s.maxCents ?? null });
  if (error) throw error;
}

export async function updateSavedSearch(id: string, patch: { notify?: boolean }) {
  const { error } = await requireSupabase().from('saved_searches').update(patch).eq('id', id);
  if (error) throw error;
}

export async function deleteSavedSearch(id: string) {
  const { error } = await requireSupabase().from('saved_searches').delete().eq('id', id);
  if (error) throw error;
}

// --- Notifications (Activity) --------------------------------------------------------------------

export type AppNotification = { id: string; type: string; title: string; body: string; route: string | null; createdAt: string; readAt: string | null };

export async function fetchNotifications(): Promise<AppNotification[]> {
  const { data, error } = await requireSupabase().from('notifications').select('id, type, title, body, route, created_at, read_at').order('created_at', { ascending: false }).limit(100);
  if (error) throw error;
  return data.map((n) => ({ id: n.id, type: n.type, title: n.title, body: n.body, route: n.route, createdAt: n.created_at, readAt: n.read_at }));
}

export async function markRead(ids?: string[]) {
  const { error } = await requireSupabase().rpc('mark_notifications_read', { ids });
  if (error) throw error;
}

export async function registerPushToken(token: string, platform: 'ios' | 'android', device?: string) {
  const { error } = await requireSupabase().rpc('register_push_token', { token, platform, device });
  if (error) throw error;
}

/** Current best delivered price per variant, for the alerts' "now vs target" bars. */
export async function fetchBestPrices(productIds: string[]): Promise<{ productId: string; variantId: string; cents: number }[]> {
  if (!productIds.length) return [];
  const { data, error } = await requireSupabase()
    .from('variant_price_stats')
    .select('variant_id, best_delivered_cents, variant:product_variants!inner(product_id)')
    .in('variant.product_id', productIds)
    .not('best_delivered_cents', 'is', null);
  if (error) throw error;
  return data.map((r) => ({ productId: (r.variant as unknown as { product_id: string }).product_id, variantId: r.variant_id, cents: r.best_delivered_cents! }));
}

/** Saved deals that are still live (ended deals drop out of the feed and are listed as ended). */
export async function fetchSavedDeals(): Promise<{ live: Deal[]; endedCount: number }> {
  const client = requireSupabase();
  const { data: saved, error } = await client.from('saved_deals').select('deal_id');
  if (error) throw error;
  const ids = saved.map((s) => s.deal_id);
  if (!ids.length) return { live: [], endedCount: 0 };
  const { data, error: feedError } = await client.from('deal_feed').select('*').in('deal_id', ids);
  if (feedError) throw feedError;
  const live = data.map((r) => toDeal(r as never));
  return { live, endedCount: ids.length - live.length };
}
