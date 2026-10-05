// Pure adapter logic for automated offer sources (Phase 12). No Deno or network APIs here, so the
// same code runs in the ingest/go edge functions and in vitest (packages/shared/src/integrations.test.ts).

/** One offer row for public.ingest_offers (the same shape as the admin form and CSV import). */
export type OfferRecord = {
  retailer_slug: string;
  url: string;
  external_ref: string;
  price_cents?: number | null;
  shipping_cents?: number;
  in_stock?: boolean;
  title?: string;
  brand?: string;
  gtin?: string;
  upc?: string;
  ean?: string;
  mpn?: string;
  asin?: string;
  retailer_sku?: string;
  available_sizes?: string[];
  /** Vendor that ships the item for the retailer (Shopify Collective); shown as "Ships from …". */
  ships_from?: string;
  // Store content (Shopify): kept on the import record so a product created from it starts complete.
  /** The store's product this offer belongs to ('shopify-product-123'); content sync key. */
  content_ref?: string;
  product_type?: string;
  description?: DescriptionBlock[];
  specs?: Record<string, string>;
  images?: StoreImage[];
};

/** A store product image, in the store's order (first = main image). */
export type StoreImage = { url: string; width?: number | null; height?: number | null; alt?: string | null };

// --- money ---------------------------------------------------------------------------------------

/** "$1,234.50", "1234.5", 1234.5 → 123450. Zero, negative or unparseable → null. */
export function toCents(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) && value > 0 ? Math.round(value * 100) : null;
  if (typeof value !== 'string') return null;
  const cleaned = value.replace(/[$,\s]|USD/gi, '');
  if (!/^\d+(\.\d+)?$/.test(cleaned)) return null;
  const cents = Math.round(Number(cleaned) * 100);
  return cents > 0 ? cents : null;
}

// --- delimited feeds -----------------------------------------------------------------------------

/** Tab, pipe or comma — whichever splits the header line into the most columns. */
export function detectDelimiter(text: string): string {
  const header = text.replace(/^﻿/, '').split(/\r?\n/, 1)[0] ?? '';
  return ['\t', '|', ','].map((d) => ({ d, n: header.split(d).length })).sort((a, b) => b.n - a.n)[0]!.d;
}

/** RFC 4180-style parsing for any single-character delimiter (quoted fields, "" escapes, CRLF). */
export function parseDelimited(text: string, delimiter = detectDelimiter(text)): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  const src = text.replace(/^﻿/, '');
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i++;
        } else quoted = false;
      } else field += ch;
    } else if (ch === '"' && field === '') quoted = true;
    else if (ch === delimiter) {
      row.push(field);
      field = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && src[i + 1] === '\n') i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else field += ch;
  }
  if (field !== '' || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((c) => c.trim() !== ''));
}

export const FEED_FIELDS = ['external_ref', 'title', 'brand', 'upc', 'gtin', 'mpn', 'price', 'sale_price', 'url', 'buy_link', 'in_stock', 'shipping'] as const;
export type FeedField = (typeof FEED_FIELDS)[number];
/** Candidate header names per field, matched case-insensitively; the first present column wins. */
export type FeedColumns = Partial<Record<FeedField, string[]>>;

const truthy = (v: string) => !/^(0|n|no|false|out of stock|out-of-stock|oos|discontinued|unavailable)$/i.test(v.trim());

/**
 * Affiliate click URLs (AvantLink, Impact, CJ, …) carry the product page in a query parameter.
 * Returns that inner URL, or the input when it isn't a wrapper.
 */
export function unwrapTrackingUrl(raw: string): string {
  try {
    const u = new URL(raw);
    for (const key of ['url', 'u', 'dest', 'destination', 'murl']) {
      const inner = u.searchParams.get(key);
      if (inner && /^https?:\/\//i.test(inner)) return inner;
    }
  } catch {
    // not a URL; the database rejects it with a row error
  }
  return raw;
}

/** Feed rows → offer records. Rows without a SKU, link or usable price are reported, not sent. */
export function feedRecords(
  text: string,
  columns: FeedColumns,
  retailerSlug: string,
  maxRecords = 20000,
): { records: OfferRecord[]; skipped: { line: number; reason: string }[]; missingColumns: FeedField[] } {
  const [header, ...rows] = parseDelimited(text);
  if (!header) return { records: [], skipped: [], missingColumns: ['external_ref', 'url', 'price'] };
  const keys = header.map((h) => h.trim().toLowerCase());
  const index = {} as Record<FeedField, number>;
  for (const f of FEED_FIELDS) index[f] = (columns[f] ?? []).map((c) => keys.indexOf(c.trim().toLowerCase())).find((i) => i >= 0) ?? -1;
  const missingColumns = (['external_ref', 'price'] as const).filter((f) => index[f] < 0) as FeedField[];
  if (index.url < 0 && index.buy_link < 0) missingColumns.push('url');
  if (missingColumns.length) return { records: [], skipped: [], missingColumns };

  const records: OfferRecord[] = [];
  const skipped: { line: number; reason: string }[] = [];
  const seen = new Set<string>();
  rows.forEach((r, i) => {
    const line = i + 2;
    const get = (f: FeedField) => (index[f] >= 0 ? (r[index[f]] ?? '').trim() : '');
    if (records.length >= maxRecords) return skipped.push({ line, reason: 'over max_records' });
    const ref = get('external_ref');
    if (!ref) return skipped.push({ line, reason: 'no SKU' });
    if (seen.has(ref)) return skipped.push({ line, reason: `duplicate SKU ${ref}` });
    const url = get('url') || unwrapTrackingUrl(get('buy_link'));
    if (!/^https:\/\//i.test(url)) return skipped.push({ line, reason: 'no https product URL' });
    const sale = toCents(get('sale_price'));
    const list = toCents(get('price'));
    const price = sale && (!list || sale < list) ? sale : list;
    if (!price) return skipped.push({ line, reason: 'no price' });
    seen.add(ref);
    const record: OfferRecord = { retailer_slug: retailerSlug, url, external_ref: ref, price_cents: price, retailer_sku: ref };
    const shipping = get('shipping');
    if (shipping) record.shipping_cents = toCents(shipping) ?? 0;
    const stock = get('in_stock');
    if (stock) record.in_stock = truthy(stock);
    const title = get('title');
    if (title) record.title = title.slice(0, 200);
    const brand = get('brand');
    if (brand) record.brand = brand.slice(0, 80);
    for (const k of ['upc', 'gtin', 'mpn'] as const) {
      const v = get(k).replace(/\s/g, '');
      if (v) record[k] = v;
    }
    records.push(record);
  });
  return { records, skipped, missingColumns: [] };
}

// --- Amazon Creators API -------------------------------------------------------------------------

export const AMAZON_RESOURCES = [
  'itemInfo.title',
  'itemInfo.externalIds',
  'offersV2.listings.price',
  'offersV2.listings.availability',
  'offersV2.listings.condition',
  'offersV2.listings.isBuyBoxWinner',
  'offersV2.listings.merchantInfo',
];

type Money = { amount?: number; currency?: string };
type Listing = {
  price?: { money?: Money };
  availability?: { type?: string };
  condition?: { value?: string };
  isBuyBoxWinner?: boolean;
  violatesMAP?: boolean;
};
type AmazonItem = { asin?: string; itemInfo?: Record<string, unknown>; offersV2?: { listings?: Listing[] } };
export type AmazonResponse = { itemResults?: { items?: AmazonItem[] }; errors?: { code?: string; message?: string }[] };

/** Case-insensitive property lookup (the API's casing of acronyms like "eaNs"/"upCs" varies by SDK). */
function prop(obj: unknown, name: string): unknown {
  if (!obj || typeof obj !== 'object') return undefined;
  const key = Object.keys(obj).find((k) => k.toLowerCase() === name.toLowerCase());
  return key ? (obj as Record<string, unknown>)[key] : undefined;
}
function firstDisplayValue(obj: unknown): string | undefined {
  const values = prop(obj, 'displayValues');
  return Array.isArray(values) && typeof values[0] === 'string' ? values[0] : undefined;
}

/**
 * GetItems items → offer records. Uses the new-condition buy-box listing. No price (no listing, out of
 * stock without a price, or a MAP-restricted price) yields price_cents null, which shows "Check price".
 * The URL is the plain product page; the go function adds the partner tag.
 */
export function amazonRecords(response: AmazonResponse, retailerSlug = 'amazon'): OfferRecord[] {
  return (response.itemResults?.items ?? [])
    .filter((item): item is AmazonItem & { asin: string } => typeof item.asin === 'string' && /^[A-Z0-9]{10}$/.test(item.asin))
    .map((item) => {
      const listings = item.offersV2?.listings ?? [];
      const isNew = (l: Listing) => !l.condition?.value || l.condition.value === 'New';
      const listing = listings.find((l) => l.isBuyBoxWinner && isNew(l)) ?? listings.find(isNew);
      const money = listing?.price?.money;
      const usd = !money?.currency || money.currency === 'USD';
      const price = listing && usd && !listing.violatesMAP ? toCents(money?.amount ?? null) : null;
      const availability = listing?.availability?.type;
      const ids = prop(item.itemInfo, 'externalIds');
      const record: OfferRecord = {
        retailer_slug: retailerSlug,
        url: `https://www.amazon.com/dp/${item.asin}`,
        external_ref: item.asin,
        asin: item.asin,
        price_cents: price,
        in_stock: listing ? availability === undefined || availability === 'IN_STOCK' : false,
      };
      const title = firstDisplayValue(prop(item.itemInfo, 'title'));
      if (title) record.title = title.slice(0, 200);
      const upc = firstDisplayValue(prop(ids, 'upcs'));
      const ean = firstDisplayValue(prop(ids, 'eans'));
      if (upc) record.upc = upc;
      if (ean) record.ean = ean;
      return record;
    });
}

/** ASINs in request batches (GetItems takes up to 10). */
export function batches<T>(items: T[], size = 10): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

// --- Shopify stores ----------------------------------------------------------------------------------

/** One Shopify product, normalized from either the Storefront API or the store's public product JSON. */
export type ShopifyProduct = {
  id: string;
  handle: string;
  title: string;
  vendor: string;
  productType: string;
  tags: string[];
  descriptionHtml: string;
  images: StoreImage[];
  variants: ShopifyVariant[];
};
export type ShopifyVariant = {
  id: string;
  title: string;
  priceCents: number | null;
  sku: string | null;
  barcode: string | null;
  /** null when the source doesn't say (the public JSON on some stores). */
  available: boolean | null;
  requiresShipping: boolean;
  options: { name: string; value: string }[];
};

export type ShopifyConfig = {
  retailerSlug: string;
  /** The store's public origin (e.g. https://pickleballgripdoctor.com); offer links are built on it. */
  storeUrl: string;
  utmSource?: string;
  shipping?: { flat_cents?: number | null; free_over_cents?: number | null };
  collectiveTag?: string;
  maxRecords?: number;
};

/** "gid://shopify/ProductVariant/123" or 123 → "123". */
export function shopifyId(id: unknown): string {
  return String(id ?? '').split('/').pop() ?? '';
}

/** Storefront API GraphQL: the products published to the token's storefront (one page). */
export const SHOPIFY_PRODUCTS_QUERY = `query Products($cursor: String) {
  products(first: 100, after: $cursor) {
    pageInfo { hasNextPage endCursor }
    nodes {
      id handle title vendor productType tags descriptionHtml
      images(first: 20) { nodes { url width height altText } }
      variants(first: 100) {
        nodes {
          id title sku barcode availableForSale currentlyNotInStock requiresShipping
          price { amount currencyCode }
          selectedOptions { name value }
        }
      }
    }
  }
}`;

type GqlVariant = {
  id?: string;
  title?: string;
  sku?: string | null;
  barcode?: string | null;
  availableForSale?: boolean;
  /** Purchasable but not in stock: pre-order / backorder ("continue selling when out of stock"). */
  currentlyNotInStock?: boolean;
  requiresShipping?: boolean;
  price?: { amount?: string; currencyCode?: string };
  selectedOptions?: { name: string; value: string }[];
};
export type GqlProduct = {
  id?: string;
  handle?: string;
  title?: string;
  vendor?: string;
  productType?: string;
  tags?: string[];
  descriptionHtml?: string;
  images?: { nodes?: { url?: string; width?: number | null; height?: number | null; altText?: string | null }[] };
  variants?: { nodes?: GqlVariant[] };
};

export function fromStorefront(nodes: GqlProduct[]): ShopifyProduct[] {
  return nodes.map((p) => ({
    id: shopifyId(p.id),
    handle: p.handle ?? '',
    title: p.title ?? '',
    vendor: p.vendor ?? '',
    productType: p.productType ?? '',
    tags: p.tags ?? [],
    descriptionHtml: p.descriptionHtml ?? '',
    images: (p.images?.nodes ?? []).filter((i) => i.url).map((i) => ({ url: i.url!, width: i.width ?? null, height: i.height ?? null, alt: i.altText ?? null })),
    variants: (p.variants?.nodes ?? []).map((v) => ({
      id: shopifyId(v.id),
      title: v.title ?? '',
      // USD only (V1 pricing scope); other currencies yield no price and are skipped.
      priceCents: !v.price?.currencyCode || v.price.currencyCode === 'USD' ? toCents(v.price?.amount ?? null) : null,
      sku: v.sku || null,
      barcode: v.barcode || null,
      // Pre-orders and backorders have nothing on hand, so they count as out of stock (not listed).
      available: typeof v.availableForSale === 'boolean' ? v.availableForSale && v.currentlyNotInStock !== true : null,
      requiresShipping: v.requiresShipping !== false,
      options: v.selectedOptions ?? [],
    })),
  }));
}

type JsonVariant = {
  id?: number;
  title?: string;
  price?: string;
  sku?: string | null;
  barcode?: string | null;
  available?: boolean;
  requires_shipping?: boolean;
  option1?: string | null;
  option2?: string | null;
  option3?: string | null;
};
export type JsonProduct = {
  id?: number;
  handle?: string;
  title?: string;
  vendor?: string;
  product_type?: string;
  tags?: string[] | string;
  options?: { name: string }[];
  body_html?: string | null;
  images?: { src?: string; width?: number | null; height?: number | null; alt?: string | null }[];
  variants?: JsonVariant[];
};

/** The store's public `/products.json` (Online Store channel). Stopgap only: no channel scoping. */
export function fromPublicJson(products: JsonProduct[]): ShopifyProduct[] {
  return products.map((p) => {
    const names = (p.options ?? []).map((o) => o.name);
    return {
      id: shopifyId(p.id),
      handle: p.handle ?? '',
      title: p.title ?? '',
      vendor: p.vendor ?? '',
      productType: p.product_type ?? '',
      descriptionHtml: p.body_html ?? '',
      images: (p.images ?? []).filter((i) => i.src).map((i) => ({ url: i.src!, width: i.width ?? null, height: i.height ?? null, alt: i.alt ?? null })),
      tags: Array.isArray(p.tags)
        ? p.tags
        : String(p.tags ?? '')
            .split(',')
            .map((t) => t.trim())
            .filter(Boolean),
      variants: (p.variants ?? []).map((v) => ({
        id: shopifyId(v.id),
        title: v.title ?? '',
        priceCents: toCents(v.price ?? null),
        sku: v.sku || null,
        barcode: v.barcode || null,
        available: typeof v.available === 'boolean' ? v.available : null,
        requiresShipping: v.requires_shipping !== false,
        options: [v.option1, v.option2, v.option3]
          .map((value, i) => ({ name: names[i] ?? `Option ${i + 1}`, value: value ?? '' }))
          .filter((o) => o.value !== ''),
      })),
    };
  });
}

const SIZE_OPTION = /\bsize\b/i;
/** Options that don't change what the product is: one offer covers every colour or graphic. */
const COSMETIC_OPTION = /\b(colou?rs?|graphics?|designs?|patterns?|styles?|finish|prints?)\b/i;
const DEFAULT_TITLE = 'Default Title';

/** Barcode → the identifier kind the catalog uses (UPC-A 12, EAN-13 13, other GTIN lengths 8 and 14). */
function barcodeIdentifier(raw: string | null): Partial<Pick<OfferRecord, 'upc' | 'ean' | 'gtin'>> {
  const digits = (raw ?? '').replace(/\s/g, '');
  if (!/^\d{8}$|^\d{12,14}$/.test(digits)) return {};
  return digits.length === 12 ? { upc: digits } : digits.length === 13 ? { ean: digits } : { gtin: digits };
}

const slugPart = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');

/**
 * Shopify products → offer records.
 * - One record per combination of the options that define the product (thickness, shape, weight, …).
 *   Size options ("Size", "Shoe Size") collapse into available_sizes, the way the catalog models sizes,
 *   and cosmetic options (colour, graphic, design) collapse too: the app lists one offer per store.
 * - The price is the variant price. compare_at_price is never used: a store's own "was" price isn't a
 *   reference PickleDeals can vouch for (deals come from tracked price history and catalog MSRP).
 * - Items with nothing in stock are skipped: only items a shopper can buy are listed.
 * - Items tagged with the Collective tag carry ships_from = vendor (the supplier ships them).
 * - Links are built on the store's public origin, so they pass the retailer-domain check.
 * - Each record carries the store product's content (description blocks, specs read from it, images)
 *   and a content_ref, so catalog products can be created complete and kept in sync.
 */
export function shopifyRecords(
  products: ShopifyProduct[],
  cfg: ShopifyConfig,
): { records: OfferRecord[]; skipped: { ref: string; reason: string }[] } {
  const records: OfferRecord[] = [];
  const skipped: { ref: string; reason: string }[] = [];
  const max = cfg.maxRecords ?? 5000;
  const collective = (cfg.collectiveTag ?? 'Shopify Collective').toLowerCase();
  const origin = cfg.storeUrl.replace(/\/+$/, '');
  const shippingFor = (price: number) => {
    const s = cfg.shipping ?? {};
    if (s.free_over_cents != null && price >= s.free_over_cents) return 0;
    return Math.max(0, s.flat_cents ?? 0);
  };
  const link = (handle: string, variantId?: string) => {
    const u = new URL(`${origin}/products/${encodeURIComponent(handle)}`);
    if (variantId) u.searchParams.set('variant', variantId);
    if (cfg.utmSource) {
      u.searchParams.set('utm_source', cfg.utmSource);
      u.searchParams.set('utm_medium', 'referral');
    }
    return u.toString();
  };

  for (const p of products) {
    const productRef = `product-${p.id}`;
    if (!p.handle || !p.id) {
      skipped.push({ ref: productRef, reason: 'no handle' });
      continue;
    }
    if (/gift\s*card/i.test(p.productType) || /gift-card/.test(p.handle)) {
      skipped.push({ ref: productRef, reason: 'gift card' });
      continue;
    }
    const shippable = p.variants.filter((v) => v.requiresShipping);
    if (!shippable.length) {
      skipped.push({ ref: productRef, reason: 'nothing to ship' });
      continue;
    }
    const vendor = p.vendor.trim();
    const shipsFrom = vendor && p.tags.some((t) => t.trim().toLowerCase() === collective) ? vendor.slice(0, 80) : undefined;
    // Store content, shared by every offer of this product.
    const description = descriptionBlocks(p.descriptionHtml);
    const specs = specsFromDescription(description);
    const images = p.images.slice(0, 12);
    const names = shippable[0]!.options.map((o) => o.name);
    const sizeOption = names.find((n) => SIZE_OPTION.test(n));
    const collapsing = new Set(names.filter((n) => n === sizeOption || COSMETIC_OPTION.test(n)));
    const collapsed = collapsing.size > 0;

    // One group per combination of the defining options (every variant on its own when none collapse).
    const groups = new Map<string, ShopifyVariant[]>();
    for (const v of shippable) {
      const key = collapsed
        ? v.options
            .filter((o) => !collapsing.has(o.name))
            .map((o) => o.value)
            .join(' / ')
        : v.id;
      groups.set(key, [...(groups.get(key) ?? []), v]);
    }
    const multi = groups.size > 1;

    for (const [key, variants] of groups) {
      if (records.length >= max) {
        skipped.push({ ref: productRef, reason: 'over max_records' });
        break;
      }
      const v0 = variants[0]!;
      const ref = collapsed ? (key ? `${productRef}-${slugPart(key)}` : productRef) : `variant-${v0.id}`;
      const priced = variants.filter((v) => v.priceCents != null);
      if (!priced.length) {
        skipped.push({ ref, reason: 'no price' });
        continue;
      }
      const stockKnown = priced.some((v) => v.available != null);
      // Nothing to sell: not imported. With a full-catalog source, an offer that sells out is hidden on
      // the next run (it disappears from the feed) and comes back when restocked.
      if (stockKnown && !priced.some((v) => v.available === true)) {
        skipped.push({ ref, reason: 'out of stock' });
        continue;
      }
      const inStock = priced.filter((v) => v.available !== false);
      const price = Math.min(...(inStock.length ? inStock : priced).map((v) => v.priceCents!));
      const label = collapsed ? key : v0.title !== DEFAULT_TITLE ? v0.title : '';

      const record: OfferRecord = {
        retailer_slug: cfg.retailerSlug,
        url: link(p.handle, !collapsed && multi ? v0.id : undefined),
        external_ref: ref,
        price_cents: price,
        shipping_cents: shippingFor(price),
        title: (label && multi ? `${p.title} – ${label}` : p.title).slice(0, 200),
        retailer_sku: !collapsed && v0.sku && /^[A-Za-z0-9._/-]{3,64}$/.test(v0.sku) ? v0.sku : ref.slice(0, 64),
      };
      if (stockKnown) record.in_stock = priced.some((v) => v.available === true);
      if (vendor) record.brand = vendor.slice(0, 80);
      if (sizeOption) {
        const sizes = variants
          .filter((v) => v.available !== false)
          .map((v) => v.options.find((o) => o.name === sizeOption)?.value ?? '')
          .filter(Boolean);
        record.available_sizes = [...new Set(sizes)];
      }
      // Any one variant's barcode identifies the product (colour and size UPCs all belong to it).
      Object.assign(record, barcodeIdentifier(variants.find((v) => v.barcode)?.barcode ?? null));
      if (shipsFrom) record.ships_from = shipsFrom;
      record.content_ref = `shopify-product-${p.id}`;
      if (p.productType.trim()) record.product_type = p.productType.trim().slice(0, 80);
      if (description.length) record.description = description;
      if (Object.keys(specs).length) record.specs = specs;
      if (images.length) record.images = images;
      records.push(record);
    }
  }
  return { records, skipped };
}

// --- Store content (descriptions, specs) ------------------------------------------------------------

/** A description as structured blocks: the app renders them in its own type styles (no store HTML/CSS). */
export type DescriptionRun = { text: string; bold?: boolean };
export type DescriptionBlock =
  | { kind: 'heading'; text: string }
  | { kind: 'paragraph'; runs: DescriptionRun[] }
  | { kind: 'list'; items: DescriptionRun[][] };

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', ndash: '–', mdash: '—', rsquo: '’', lsquo: '‘', rdquo: '”', ldquo: '“', hellip: '…', trade: '™', reg: '®', copy: '©', deg: '°' };

function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
    if (e[0] === '#') {
      const n = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(n) && n > 0 && n < 0x110000 ? String.fromCodePoint(n) : '';
    }
    return ENTITIES[e.toLowerCase()] ?? m;
  });
}

const textOf = (runs: DescriptionRun[]) => runs.map((r) => r.text).join('');

function tidyRuns(runs: DescriptionRun[]): DescriptionRun[] {
  const out: DescriptionRun[] = [];
  for (const r of runs) {
    const text = r.text.replace(/\s+/g, ' ');
    if (!text) continue;
    const last = out[out.length - 1];
    if (last && !!last.bold === !!r.bold) last.text += text;
    else out.push(r.bold ? { text, bold: true } : { text });
  }
  if (out.length) {
    out[0]!.text = out[0]!.text.trimStart();
    out[out.length - 1]!.text = out[out.length - 1]!.text.trimEnd();
  }
  return out.filter((r) => r.text !== '');
}

/**
 * Store description HTML → blocks. Keeps paragraphs, headings, bullet lists and bold; drops every
 * style, colour, font, link target, image, script and embedded widget. A short paragraph that is
 * entirely bold becomes a heading. Capped so a runaway description can't bloat the catalog.
 */
export function descriptionBlocks(html: string | null | undefined, maxChars = 8000): DescriptionBlock[] {
  if (!html) return [];
  const src = html.replace(/<(script|style|iframe|svg|noscript)[\s\S]*?<\/\1\s*>/gi, '').replace(/<!--[\s\S]*?-->/g, '');
  const blocks: DescriptionBlock[] = [];
  let runs: DescriptionRun[] = [];
  let heading = false;
  let bold = 0;
  let list: DescriptionRun[][] | null = null;
  let item: DescriptionRun[] | null = null;
  let used = 0;

  const flush = () => {
    const tidy = tidyRuns(runs);
    runs = [];
    if (!tidy.length) return (heading = false);
    const text = textOf(tidy);
    if (used + text.length > maxChars) return (heading = false);
    used += text.length;
    if (heading || (tidy.every((r) => r.bold) && text.length <= 80)) blocks.push({ kind: 'heading', text });
    else blocks.push({ kind: 'paragraph', runs: tidy });
    heading = false;
  };
  const endItem = () => {
    if (!list || !item) return;
    const tidy = tidyRuns(item);
    const text = textOf(tidy);
    if (tidy.length && used + text.length <= maxChars) {
      used += text.length;
      list.push(tidy);
    }
    item = null;
  };
  const endList = () => {
    endItem();
    if (list?.length) blocks.push({ kind: 'list', items: list });
    list = null;
  };
  const push = (text: string) => {
    if (!text) return;
    const run: DescriptionRun = bold > 0 ? { text, bold: true } : { text };
    if (item) item.push(run);
    else if (!list) runs.push(run);
  };

  for (const m of src.matchAll(/<\/?([a-z0-9]+)[^>]*>|[^<]+|</gi)) {
    const token = m[0];
    if (token[0] !== '<' || token === '<') {
      push(decodeEntities(token));
      continue;
    }
    const close = token[1] === '/';
    const tag = m[1]!.toLowerCase();
    if (tag === 'strong' || tag === 'b') bold = Math.max(0, bold + (close ? -1 : 1));
    else if (tag === 'ul' || tag === 'ol') {
      if (close) endList();
      else {
        flush();
        endList();
        list = [];
      }
    } else if (tag === 'li') {
      if (close) endItem();
      else if (list) {
        endItem();
        item = [];
      }
    } else if (/^h[1-6]$/.test(tag)) {
      if (!item) {
        flush();
        heading = !close;
      }
    } else if (tag === 'p' || tag === 'div' || tag === 'br' || tag === 'hr' || tag === 'tr' || tag === 'section') {
      if (item) {
        if (tag === 'br') item.push({ text: ' ' });
      } else if (!list) flush();
    }
  }
  endList();
  flush();
  return blocks.slice(0, 80);
}

/**
 * "Label: value" bullet points → specs ({ core_thickness: '16mm', average_weight: '8.0 oz' }), as staff
 * would type them. Only list items, short labels and short values; at most 16.
 */
export function specsFromDescription(blocks: DescriptionBlock[]): Record<string, string> {
  const specs: Record<string, string> = {};
  for (const b of blocks) {
    if (b.kind !== 'list') continue;
    for (const runs of b.items) {
      const m = textOf(runs).match(/^\s*([A-Za-z][A-Za-z0-9 &/().'-]{1,30}?)\s*:\s*(.{1,80}?)\s*$/);
      if (!m) continue;
      const key = m[1]!
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/(^_|_$)/g, '');
      if (key && !(key in specs) && Object.keys(specs).length < 16) specs[key] = m[2]!.replace(/\s*\.$/, '');
    }
  }
  return specs;
}

// --- Discount links (go function) ---------------------------------------------------------------------

/**
 * Shopify discount link: the code is applied at checkout and the shopper lands on the product page.
 * The template is a path on the retailer's own origin ('/discount/{code}?redirect={path}'); {path} is
 * the product page's path and query, so the result can never leave the product's host.
 */
export function discountLinkUrl(productUrl: URL, code: string, template: string | null): URL {
  const clean = code.trim();
  if (!template || !/^[A-Za-z0-9_-]{1,64}$/.test(clean) || !template.startsWith('/')) return productUrl;
  const path = `${productUrl.pathname}${productUrl.search}`;
  const filled = template.replace('{code}', encodeURIComponent(clean)).replace('{path}', encodeURIComponent(path));
  const url = new URL(filled, productUrl.origin);
  return url.origin === productUrl.origin ? url : productUrl;
}

// --- Affiliate links (go function) ---------------------------------------------------------------

export type AffiliateProgram = { tag_template: string | null; link_template: string | null; is_active: boolean };

/**
 * Product URL → outbound URL: the program's query tag is added, then (for networks that wrap links)
 * the result is encoded into the program's click URL. Wrapper hosts must be on the allowlist, so a bad
 * template can never turn go into an open redirect.
 */
export function affiliateUrl(productUrl: URL, program: AffiliateProgram | null, allowedHosts: string[]): URL {
  const target = new URL(productUrl.toString());
  if (!program?.is_active) return target;
  if (program.tag_template) {
    for (const [k, v] of new URLSearchParams(program.tag_template)) target.searchParams.set(k, v);
  }
  if (!program.link_template) return target;
  const wrapped = new URL(program.link_template.replace('{url}', encodeURIComponent(target.toString())));
  const host = wrapped.hostname.toLowerCase();
  const allowed = wrapped.protocol === 'https:' && allowedHosts.some((h) => host === h || host.endsWith(`.${h}`));
  return allowed ? wrapped : target;
}
