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
};

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
