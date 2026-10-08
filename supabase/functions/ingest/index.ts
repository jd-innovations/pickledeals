// ingest — runs automated offer sources (Phase 12, §9). pg_cron calls public.schedule_ingestion()
// every 5 minutes; when a source is due it POSTs here with the service key. This function claims due
// sources (claim_ingestion_runs), fetches them through an adapter, sends the records through the same
// matcher as the admin form (ingest_offers, automated) and records the outcome (finish_ingestion_run).
//
// Adapters (ingestion_sources.config.adapter):
//   amazon-creators — Creators API GetItems for every ASIN in product_identifiers (10 per request,
//                     ≤ 1 request/second, at most config.max_requests per run)
//   delimited-feed  — CSV/TSV/pipe product datafeed (AvantLink and similar), column names from config
//   shopify         — a Shopify store: the Storefront API with a private token (mode 'storefront': only
//                     products published to that headless storefront), or the store's public product
//                     JSON (mode 'public': the whole Online Store, no channel scoping; a stopgap)
// Secrets come from env only: AMAZON_CREATORS_CLIENT_ID / _SECRET, AMAZON_PARTNER_TAG, the feed URL
// in the env var named by config.url_env (FEED_URL_*), and a Shopify store's domain and token in the
// env vars named by config.domain_env / token_env (SHOPIFY_*). AMAZON_CREATORS_TOKEN_URL / _API_URL can
// point at a local mock (scripts/mock-integrations.mjs).
import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2';

import {
  AMAZON_RESOURCES,
  amazonRecords,
  batches,
  feedRecords,
  fromPublicJson,
  imageHasAlpha,
  fromStorefront,
  SHOPIFY_PRODUCTS_QUERY,
  shopifyRecords,
  type AmazonResponse,
  type FeedColumns,
  type GqlProduct,
  type JsonProduct,
  type OfferRecord,
  type ShopifyConfig,
  type ShopifyProduct,
} from '../_shared/integrations.ts';

type Source = { slug: string; name: string; kind: 'feed' | 'api'; retailer_slug: string | null; config: Record<string, unknown> };
type Fetched = {
  records: OfferRecord[];
  complete: boolean;
  notes: string[];
  /** External refs the source reports as not purchasable (sold out, pre-order): their offers are hidden. */
  unavailable?: string[];
  /** Shopify (Storefront API): what's needed to test the store's promo codes in a cart. */
  shop?: { domain: string; token: string; products: ShopifyProduct[] };
};

function serviceKey(): string {
  const keys = JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS') ?? '{}') as Record<string, string>;
  const key = keys.default ?? Object.values(keys)[0] ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!key) throw new Error('missing service key');
  return key;
}

function isServiceCall(req: Request): boolean {
  const token = req.headers.get('Authorization')?.replace(/^Bearer\s+/i, '') ?? '';
  if (token === serviceKey()) return true;
  try {
    const payload = JSON.parse(atob(token.split('.')[1]!.replace(/-/g, '+').replace(/_/g, '/')));
    return payload.role === 'service_role';
  } catch {
    return false;
  }
}

class ConfigError extends Error {}
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// --- Amazon Creators API ---------------------------------------------------------------------------

async function amazonToken(): Promise<string> {
  const clientId = Deno.env.get('AMAZON_CREATORS_CLIENT_ID');
  const clientSecret = Deno.env.get('AMAZON_CREATORS_CLIENT_SECRET');
  if (!clientId || !clientSecret) throw new ConfigError('Amazon Creators API credentials aren’t configured (AMAZON_CREATORS_CLIENT_ID / _SECRET).');
  const res = await fetch(Deno.env.get('AMAZON_CREATORS_TOKEN_URL') ?? 'https://api.amazon.com/auth/o2/token', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ grant_type: 'client_credentials', client_id: clientId, client_secret: clientSecret, scope: 'creatorsapi::default' }),
  });
  const body = (await res.json().catch(() => ({}))) as { access_token?: string; error_description?: string };
  if (!res.ok || !body.access_token) throw new Error(`Amazon token request failed (${res.status}): ${body.error_description ?? 'no token'}`);
  return body.access_token;
}

async function fetchAmazon(db: SupabaseClient, source: Source): Promise<Fetched> {
  const partnerTag = Deno.env.get('AMAZON_PARTNER_TAG');
  if (!partnerTag) throw new ConfigError('AMAZON_PARTNER_TAG isn’t configured.');
  const retailer = source.retailer_slug ?? 'amazon';
  const marketplace = String(source.config.marketplace ?? 'www.amazon.com');
  const maxRequests = Math.min(Number(source.config.max_requests ?? 60), 300);

  const { data: r } = await db.from('retailers').select('id').eq('slug', retailer).single();
  const { data: ids, error } = await db.from('product_identifiers').select('value').eq('kind', 'asin').eq('retailer_id', r?.id ?? '');
  if (error) throw new Error(error.message);
  const asins = [...new Set((ids ?? []).map((i) => i.value as string))].sort();
  if (!asins.length) return { records: [], complete: false, notes: ['No ASINs in the catalog yet. Add them on products (identifier kind ASIN).'] };

  const token = await amazonToken();
  const api = Deno.env.get('AMAZON_CREATORS_API_URL') ?? 'https://creatorsapi.amazon/catalog/v1';
  const groups = batches(asins).slice(0, maxRequests);
  const notes: string[] = [];
  if (groups.length * 10 < asins.length) notes.push(`Refreshed ${groups.length * 10} of ${asins.length} ASINs (max_requests ${maxRequests}).`);

  const records: OfferRecord[] = [];
  let notAccessible = 0;
  for (const [i, itemIds] of groups.entries()) {
    if (i > 0) await sleep(1100); // new accounts get 1 request per second
    const res = await fetch(`${api}/getItems`, {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json', 'x-marketplace': marketplace },
      body: JSON.stringify({ itemIds, itemIdType: 'ASIN', marketplace, partnerTag, resources: AMAZON_RESOURCES }),
    });
    if (res.status === 429) {
      notes.push(`Throttled after ${i} of ${groups.length} requests; the rest wait for the next run.`);
      break;
    }
    const body = (await res.json().catch(() => ({}))) as AmazonResponse;
    if (!res.ok) throw new Error(`Amazon GetItems failed (${res.status}): ${body.errors?.[0]?.message ?? 'no details'}`);
    records.push(...amazonRecords(body, retailer));
    notAccessible += (body.errors ?? []).filter((e) => e.code === 'ItemNotAccessible').length;
  }
  if (notAccessible) notes.push(`${notAccessible} ASIN(s) not accessible; their prices stop showing after 60 minutes.`);
  return { records, complete: false, notes };
}

// --- Product datafeeds ---------------------------------------------------------------------------------

async function fetchFeed(source: Source): Promise<Fetched> {
  const env = String(source.config.url_env ?? '');
  if (!/^FEED_URL_[A-Z0-9_]{1,60}$/.test(env)) throw new ConfigError('config.url_env must name a FEED_URL_* secret.');
  const url = Deno.env.get(env);
  if (!url) throw new ConfigError(`The feed URL secret ${env} isn’t configured.`);
  if (!source.retailer_slug) throw new ConfigError('config.retailer_slug is required.');

  const res = await fetch(url, { headers: { accept: 'text/csv, text/tab-separated-values, text/plain, */*' } });
  if (!res.ok) throw new Error(`Feed download failed (${res.status}).`);
  let text: string;
  if (/\.gz($|\?)/.test(url) || res.headers.get('content-type')?.includes('gzip')) {
    text = await new Response(res.body!.pipeThrough(new DecompressionStream('gzip'))).text();
  } else text = await res.text();

  const columns = (source.config.columns ?? {}) as FeedColumns;
  const { records, skipped, missingColumns } = feedRecords(text, columns, source.retailer_slug, Number(source.config.max_records ?? 20000));
  if (missingColumns.length) throw new ConfigError(`The feed has no column for: ${missingColumns.join(', ')}. Check the column names in the source config.`);
  const notes = skipped.length ? [`Skipped ${skipped.length} row(s): ${[...new Set(skipped.map((s) => s.reason))].slice(0, 4).join('; ')}.`] : [];
  return { records, complete: source.config.complete === true, notes };
}

// --- Shopify stores ------------------------------------------------------------------------------------

const SHOPIFY_API_VERSION = '2026-10';

function shopifyEnv(source: Source, key: 'domain_env' | 'token_env'): string | undefined {
  const name = String(source.config[key] ?? '');
  if (!/^SHOPIFY_[A-Z0-9_]{1,60}$/.test(name)) return undefined;
  return Deno.env.get(name)?.trim() || undefined;
}

async function fetchShopify(source: Source): Promise<Fetched> {
  if (!source.retailer_slug) throw new ConfigError('config.retailer_slug is required.');
  const storeUrl = String(source.config.store_url ?? '');
  if (!/^https:\/\/[a-z0-9.-]+$/i.test(storeUrl)) throw new ConfigError('config.store_url must be the store’s https origin, e.g. https://pickleballgripdoctor.com.');
  // Accept "store.myshopify.com" as well as a pasted "https://store.myshopify.com/".
  const domain = shopifyEnv(source, 'domain_env')
    ?.replace(/^https?:\/\//i, '')
    .replace(/\/+$/, '');
  if (!domain || !/^[a-z0-9.-]+$/i.test(domain)) throw new ConfigError(`The store domain secret ${String(source.config.domain_env)} isn’t configured.`);
  const mode = source.config.mode === 'public' ? 'public' : 'storefront';

  const products: ShopifyProduct[] = [];
  let complete = true;
  let storefrontToken: string | undefined;
  if (mode === 'storefront') {
    const token = shopifyEnv(source, 'token_env');
    storefrontToken = token;
    if (!token) throw new ConfigError(`The Storefront API token secret ${String(source.config.token_env)} isn’t configured.`);
    let cursor: string | null = null;
    for (let page = 0; ; page++) {
      if (page >= 200) {
        complete = false;
        break;
      }
      const res = await fetch(`https://${domain}/api/${SHOPIFY_API_VERSION}/graphql.json`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'Shopify-Storefront-Private-Token': token },
        body: JSON.stringify({ query: SHOPIFY_PRODUCTS_QUERY, variables: { cursor } }),
      });
      const body = (await res.json().catch(() => ({}))) as {
        data?: { products?: { pageInfo?: { hasNextPage?: boolean; endCursor?: string }; nodes?: GqlProduct[] } };
        errors?: { message?: string }[];
      };
      if (!res.ok || body.errors?.length) throw new Error(`Shopify Storefront API failed (${res.status}): ${body.errors?.[0]?.message ?? 'no details'}`);
      products.push(...fromStorefront(body.data?.products?.nodes ?? []));
      const info = body.data?.products?.pageInfo;
      if (!info?.hasNextPage || !info.endCursor) break;
      cursor = info.endCursor;
    }
  } else {
    for (let page = 1; ; page++) {
      if (page > 100) {
        complete = false;
        break;
      }
      if (page > 1) await sleep(500);
      const res = await fetch(`https://${domain}/products.json?limit=250&page=${page}`, { headers: { accept: 'application/json' } });
      if (!res.ok) throw new Error(`Shopify product JSON failed (${res.status}).`);
      const batch = ((await res.json().catch(() => ({}))) as { products?: JsonProduct[] }).products ?? [];
      products.push(...fromPublicJson(batch));
      if (batch.length < 250) break;
    }
  }

  const cfg: ShopifyConfig = {
    retailerSlug: source.retailer_slug,
    storeUrl,
    utmSource: typeof source.config.utm_source === 'string' ? source.config.utm_source : undefined,
    shipping: (source.config.shipping ?? {}) as ShopifyConfig['shipping'],
    collectiveTag: typeof source.config.collective_tag === 'string' ? source.config.collective_tag : undefined,
    maxRecords: Math.min(Number(source.config.max_records ?? 5000), 20000),
  };
  const { records, skipped } = shopifyRecords(products, cfg);
  const notes = [`${products.length} product(s) via ${mode === 'storefront' ? 'the Storefront API' : 'the public product JSON'}.`];
  if (skipped.length) notes.push(`Skipped ${skipped.length}: ${[...new Set(skipped.map((s) => s.reason))].slice(0, 4).join('; ')}.`);
  if (!complete) notes.push('Stopped at the page limit; offers not seen this run are kept.');
  const truncated = !complete || skipped.some((s) => s.reason === 'over max_records');
  const unavailable = skipped.filter((s) => s.reason === 'out of stock').map((s) => s.ref);
  return {
    records,
    complete: source.config.complete === true && !truncated,
    notes,
    unavailable,
    shop: storefrontToken ? { domain, token: storefrontToken, products } : undefined,
  };
}

// --- Store promo codes: re-verified at the store ----------------------------------------------------------

const CART_CODE_CHECK = `mutation ($input: CartInput!) {
  cartCreate(input: $input) { cart { discountCodes { code applicable } } userErrors { message } }
}`;

/**
 * For each active code of this store, put one in-stock item it should apply to in a Storefront API test
 * cart with the code, and mark the code verified only if Shopify says it's applicable. Nothing is ordered;
 * the cart is abandoned. Codes Shopify rejects aren't touched, so they drop out of the app after 14 days.
 */
async function verifyStoreCodes(db: SupabaseClient, source: Source, shop: NonNullable<Fetched['shop']>): Promise<string[]> {
  const { data: targets, error } = await db.rpc('promo_verification_targets', { source_slug: source.slug });
  if (error || !targets?.length) return [];
  const byId = new Map(shop.products.map((p) => [p.id, p]));
  const verified: string[] = [];
  const rejected: string[] = [];
  for (const t of targets as { promo_id: string; code: string; content_ref: string }[]) {
    const product = byId.get(t.content_ref.replace(/^shopify-product-/, ''));
    const variant = product?.variants.find((v) => v.available !== false && v.requiresShipping);
    if (!variant) continue;
    const res = await fetch(`https://${shop.domain}/api/${SHOPIFY_API_VERSION}/graphql.json`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'Shopify-Storefront-Private-Token': shop.token },
      body: JSON.stringify({
        query: CART_CODE_CHECK,
        variables: { input: { lines: [{ merchandiseId: `gid://shopify/ProductVariant/${variant.id}`, quantity: 1 }], discountCodes: [t.code] } },
      }),
    }).catch(() => null);
    const body = (await res?.json().catch(() => ({}))) as { data?: { cartCreate?: { cart?: { discountCodes?: { code: string; applicable: boolean }[] } } } };
    const applied = body?.data?.cartCreate?.cart?.discountCodes?.find((d) => d.code.toUpperCase() === t.code.toUpperCase());
    if (!res?.ok || !applied) continue; // couldn't check: leave the code as it is
    (applied.applicable ? verified : rejected).push(applied.applicable ? t.promo_id : t.code);
  }
  const notes: string[] = [];
  if (verified.length) {
    await db.rpc('mark_promos_verified', { promo_ids: verified });
    notes.push(`Verified ${verified.length} store code(s) at checkout.`);
  }
  if (rejected.length) notes.push(`The store rejected ${rejected.join(', ')}; not re-verified.`);
  return notes;
}

// --- Store content sync (descriptions, specs, images) ----------------------------------------------------

type StoreContent = Pick<OfferRecord, 'description' | 'specs' | 'images'>;
const IMAGE_TYPES: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const IMAGE_WIDTH = 1600;

async function sha256(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Products linked to this source (created from it, or adopted because they had no content) get the
 * store's description, specs (only while empty) and images. Images are copied into the catalog bucket,
 * never hotlinked; ones the store drops are removed. Curated images (no content_source_id) are untouched.
 */
async function syncStoreContent(db: SupabaseClient, source: Source, sourceId: string, records: OfferRecord[]): Promise<string[]> {
  const contents = new Map<string, StoreContent>();
  for (const r of records) if (r.content_ref && !contents.has(r.content_ref)) contents.set(r.content_ref, r);
  if (!contents.size) return [];

  const { data: linked, error } = await db.rpc('link_store_content', { source: sourceId });
  if (error) return [`Store content not synced: ${error.message}`];
  let synced = 0;
  const failures: string[] = [];
  for (const p of (linked ?? []) as { product_id: string; slug: string; content_ref: string; content_hash: string | null }[]) {
    const c = contents.get(p.content_ref);
    if (!c) continue; // not in this run (e.g. sold out): keep the last synced content
    const images = c.images ?? [];
    // "v2": cutout detection; bumping it re-syncs every linked product once.
    const hash = await sha256(JSON.stringify(['v2', c.description ?? [], c.specs ?? {}, images.map((i) => i.url)]));
    if (hash === p.content_hash) continue;
    try {
      const { data: existing } = await db
        .from('product_images')
        .select('id, source_url, storage_path')
        .eq('product_id', p.product_id)
        .eq('content_source_id', sourceId);
      const have = new Map((existing ?? []).map((i) => [i.source_url as string, i]));
      const wanted = new Set(images.map((i) => i.url));
      for (const [index, img] of images.entries()) {
        const sort = 100 + index; // after any curated images
        const kept = have.get(img.url);
        if (kept) {
          // Re-read our stored copy so earlier imports get the cutout decision too.
          const { data: file } = await db.storage.from('catalog').download(kept.storage_path as string);
          const update = file ? { sort, is_cutout: imageHasAlpha(new Uint8Array(await file.arrayBuffer())) } : { sort };
          await db.from('product_images').update(update).eq('id', kept.id);
          continue;
        }
        const res = await fetch(`${img.url}${img.url.includes('?') ? '&' : '?'}width=${IMAGE_WIDTH}`);
        const type = (res.headers.get('content-type') ?? '').split(';')[0]!.trim();
        const ext = IMAGE_TYPES[type];
        const body = res.ok && ext ? new Uint8Array(await res.arrayBuffer()) : null;
        if (!body || !ext || body.byteLength > MAX_IMAGE_BYTES) {
          failures.push(`image skipped for ${p.slug} (${res.status} ${type || 'unknown type'})`);
          continue;
        }
        const path = `products/${p.product_id}/store-${(await sha256(img.url)).slice(0, 16)}.${ext}`;
        const up = await db.storage.from('catalog').upload(path, body, { contentType: type, cacheControl: '31536000', upsert: true });
        if (up.error) throw new Error(up.error.message);
        const scale = img.width && img.width > IMAGE_WIDTH ? IMAGE_WIDTH / img.width : 1;
        const { error: insertError } = await db.from('product_images').insert({
          product_id: p.product_id,
          storage_path: path,
          sort,
          width: img.width ? Math.round(img.width * scale) : null,
          height: img.height ? Math.round(img.height * scale) : null,
          // Transparent product shots sit whole on the tinted tile; opaque photos fill it (D8).
          is_cutout: imageHasAlpha(body),
          source: 'retailer_feed',
          source_url: img.url,
          license_note: `Store content synced from ${source.name}; the store owner holds the rights.`,
          status: 'active',
          content_source_id: sourceId,
        });
        if (insertError) {
          await db.storage.from('catalog').remove([path]);
          throw new Error(insertError.message);
        }
      }
      const gone = (existing ?? []).filter((i) => !wanted.has(i.source_url as string));
      if (gone.length) {
        await db.from('product_images').delete().in('id', gone.map((i) => i.id));
        await db.storage.from('catalog').remove(gone.map((i) => i.storage_path as string));
      }
      const { error: applyError } = await db.rpc('apply_store_content', {
        product: p.product_id,
        description: (c.description ?? []) as never,
        specs: (c.specs ?? {}) as never,
        hash,
      });
      if (applyError) throw new Error(applyError.message);
      synced++;
    } catch (e) {
      failures.push(`${p.slug}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  const notes = synced ? [`Synced store content for ${synced} product(s).`] : [];
  if (failures.length) notes.push(`Content issues: ${failures.slice(0, 3).join('; ')}.`);
  return notes;
}

// --- Runner ----------------------------------------------------------------------------------------------

async function runSource(db: SupabaseClient, source: Source) {
  let runId: string | null = null;
  try {
    const adapter = source.config.adapter;
    const fetched =
      adapter === 'amazon-creators'
        ? await fetchAmazon(db, source)
        : adapter === 'delimited-feed'
          ? await fetchFeed(source)
          : adapter === 'shopify'
            ? await fetchShopify(source)
            : null;
    if (!fetched) throw new ConfigError(`Unknown adapter "${String(adapter)}".`);

    const { data: report, error } = await db.rpc('ingest_offers', { source: source.slug, records: fetched.records as never, dry_run: false, automated: true });
    if (error) throw new Error(error.message);
    const r = report as { run_id: string | null; matched: number; unmatched: number; error_count?: number; errors?: { message: string }[] };
    runId = r.run_id;
    const notes = [...fetched.notes];
    if (r.error_count) notes.push(`${r.error_count} row error(s), e.g. ${r.errors?.[0]?.message ?? ''}`);
    // A run where every row failed is a failure (and backs off); partial errors are reported.
    const ok = !(fetched.records.length > 0 && r.error_count === fetched.records.length);
    // Items the store says can't be bought right now are hidden even when the full-feed rule holds back
    // (that rule guards against truncated feeds; these were seen and are known to be unavailable).
    const { data: src } = await db.from('ingestion_sources').select('id').eq('slug', source.slug).single();
    const sourceId = (src?.id as string | undefined) ?? '';
    let soldOut = 0;
    if (ok && sourceId && fetched.unavailable?.length) {
      const { data: hidden } = await db
        .from('retailer_offers')
        .update({ status: 'inactive' })
        .eq('source_id', sourceId)
        .eq('status', 'active')
        .in('external_ref', fetched.unavailable)
        .select('id');
      soldOut = hidden?.length ?? 0;
      if (soldOut) notes.push(`Hid ${soldOut} offer(s) that are sold out or pre-order only.`);
    }
    if (ok && sourceId) notes.push(...(await syncStoreContent(db, source, sourceId, fetched.records)));
    if (ok && fetched.shop) notes.push(...(await verifyStoreCodes(db, source, fetched.shop).catch(() => [])));
    const { data: finish } = await db.rpc('finish_ingestion_run', { source_slug: source.slug, run: runId, ok, message: notes.join(' ') || undefined, complete: fetched.complete && ok });
    return { source: source.slug, ok, records: fetched.records.length, matched: r.matched, unmatched: r.unmatched, errors: r.error_count ?? 0, sold_out_hidden: soldOut, ...(finish as object) };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    await db.rpc('finish_ingestion_run', { source_slug: source.slug, run: runId, ok: false, message: message.slice(0, 500) });
    return { source: source.slug, ok: false, error: message };
  }
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response(null, { status: 405 });
  if (!isServiceCall(req)) return new Response(JSON.stringify({ error: 'forbidden' }), { status: 403 });
  const body = (await req.json().catch(() => ({}))) as { source?: string | null };

  const db = createClient(Deno.env.get('SUPABASE_URL')!, serviceKey(), { auth: { persistSession: false } });
  const { data, error } = await db.rpc('claim_ingestion_runs', { only_source: body.source ?? undefined });
  if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500 });

  const results = [];
  for (const source of (data ?? []) as Source[]) results.push(await runSource(db, source));
  return Response.json({ runs: results });
});
