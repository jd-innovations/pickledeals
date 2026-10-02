import { dollarsToCents, SLUG_PATTERN } from './catalog';
import { csvRecords } from './csv';

/**
 * Offer import format (Phase 3), shared by the admin offer importer and the dev seed. Each row
 * becomes one `ingest_offers` record. Match keys, in order: product_slug (+ variant_label) or an
 * identifier (gtin/upc/ean/mpn, or asin/retailer_sku at that retailer). Rows with neither go to the
 * review queue.
 */
export type OfferRecord = {
  retailer_slug: string;
  url: string;
  price_cents?: number;
  shipping_cents?: number;
  in_stock: boolean;
  available_sizes: string[];
  external_ref?: string;
  product_slug?: string;
  variant_label?: string;
  variant_id?: string;
  title?: string;
  brand?: string;
  gtin?: string;
  upc?: string;
  ean?: string;
  asin?: string;
  mpn?: string;
  retailer_sku?: string;
};

export type OfferIssue = { line: number; message: string };

const IDENTIFIERS = ['gtin', 'upc', 'ean', 'asin', 'mpn', 'retailer_sku'] as const;
const truthy = (v: string) => ['1', 'true', 'yes', 'y'].includes(v.toLowerCase());

export function buildOfferRecords(csv: string): { records: OfferRecord[]; issues: OfferIssue[] } {
  const records: OfferRecord[] = [];
  const issues: OfferIssue[] = [];
  for (const { line, values: r } of csvRecords(csv)) {
    const issue = (message: string) => issues.push({ line, message });
    if (!SLUG_PATTERN.test(r.retailer_slug ?? '')) {
      issue(`invalid retailer_slug "${r.retailer_slug ?? ''}"`);
      continue;
    }
    if (!/^https:\/\//.test(r.url ?? '')) {
      issue('url must start with https://');
      continue;
    }
    const price = r.price_usd ? dollarsToCents(r.price_usd) : undefined;
    const shipping = r.shipping_usd ? dollarsToCents(r.shipping_usd) : undefined;
    if (price === null || shipping === null) {
      issue('prices must be dollar amounts like 179.99');
      continue;
    }
    const hasIdentifier = IDENTIFIERS.some((k) => r[k]);
    if (!r.product_slug && !hasIdentifier && !r.title) {
      issue('give product_slug, an identifier, or at least a title for the review queue');
      continue;
    }
    const record: OfferRecord = {
      retailer_slug: r.retailer_slug!,
      url: r.url!,
      price_cents: price,
      shipping_cents: shipping,
      in_stock: r.in_stock ? truthy(r.in_stock) : true,
      available_sizes: (r.available_sizes ?? '').split('|').map((s) => s.trim()).filter(Boolean),
      external_ref: r.external_ref || undefined,
      product_slug: r.product_slug || undefined,
      variant_label: r.variant_label || undefined,
      title: r.title || undefined,
      brand: r.brand || undefined,
    };
    for (const k of IDENTIFIERS) if (r[k]) record[k] = r[k];
    records.push(record);
  }
  return { records, issues };
}
