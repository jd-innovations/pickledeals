import { csvRecords } from './csv';

/**
 * Catalog import format (Phase 2). Three CSVs — brands, categories, products — become one
 * `import_catalog` payload. Products are one row per variant, grouped by `product_slug`.
 * Used by the seed builder and the admin CSV importer so both validate identically.
 */

export const PRODUCT_STATUSES = ['draft', 'active', 'discontinued'] as const;
export type ProductStatus = (typeof PRODUCT_STATUSES)[number];

export const IDENTIFIER_KINDS = ['gtin', 'upc', 'ean', 'asin', 'mpn', 'retailer_sku'] as const;
export type IdentifierKind = (typeof IDENTIFIER_KINDS)[number];

export const SLUG_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;

export function slugify(text: string): string {
  return text
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)
    .replace(/-+$/, '');
}

/** "279", "279.9", "279.95", "$1,299.00" → integer cents, exactly (no float arithmetic). */
/**
 * A store's product title → a catalog-style name to start from (staff edit it): drops "NEW." /
 * "NEW GRAPHIC." prefixes, the brand, marketing after "|", the variant after " – " and the generic
 * "pickleball paddle" words. "Engage X2 Elongated Pickleball Paddle" → "X2 Elongated".
 */
export function suggestProductName(title: string, brandName?: string | null): { name: string; variant: string | null } {
  let t = title.replace(/^\s*(new(\s+graphic)?\s*[.!:]\s*)+/i, '');
  const dash = t.split(/\s+[–—]\s+/);
  const variant = dash.length > 1 ? dash.pop()!.trim() : null;
  t = dash.join(' – ').split('|')[0]!;
  if (brandName) t = t.replace(new RegExp(`^\\s*${brandName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i'), '');
  t = t
    .replace(/\bpickleball\s+paddle\b/gi, '')
    .replace(/[\s.,-]+$/, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
  return { name: t || title.trim(), variant };
}

export function dollarsToCents(input: string): number | null {
  const m = input.replace(/[$,\s]/g, '').match(/^(\d+)(?:\.(\d{1,2}))?$/);
  if (!m) return null;
  return Number(m[1]) * 100 + Number((m[2] ?? '').padEnd(2, '0'));
}

export type CatalogBrand = { slug: string; name: string; website_url?: string; is_active?: boolean };
export type CatalogCategory = { slug: string; name: string; parent_slug?: string; sort: number; variant_axes: string[] };
export type CatalogVariant = {
  label: string;
  msrp_cents?: number;
  is_default?: boolean;
  attributes: Record<string, string>;
  identifiers: { kind: IdentifierKind; value: string }[];
};
export type CatalogProduct = {
  slug: string;
  name: string;
  brand_slug: string;
  category_slug: string;
  model_year?: number;
  msrp_cents?: number;
  status: ProductStatus;
  specs: Record<string, string>;
  aliases: string[];
  variants: CatalogVariant[];
};
export type CatalogPayload = { brands: CatalogBrand[]; categories: CatalogCategory[]; products: CatalogProduct[] };
export type CatalogIssue = { file: 'brands' | 'categories' | 'products'; line: number; message: string };

/** "key=value;key=value" → object. */
const parsePairs = (s: string) =>
  Object.fromEntries(
    s
      .split(';')
      .map((p) => p.split('='))
      .filter(([k, v]) => k?.trim() && v?.trim())
      .map(([k, v]) => [k!.trim(), v!.trim()]),
  );
const parseList = (s: string) => s.split('|').map((x) => x.trim()).filter(Boolean);

export function buildCatalogPayload(csv: { brands?: string; categories?: string; products?: string }): {
  payload: CatalogPayload;
  issues: CatalogIssue[];
} {
  const issues: CatalogIssue[] = [];
  const payload: CatalogPayload = { brands: [], categories: [], products: [] };

  for (const { line, values: r } of csvRecords(csv.brands ?? '')) {
    const issue = (message: string) => issues.push({ file: 'brands', line, message });
    if (!SLUG_PATTERN.test(r.slug ?? '')) issue(`invalid slug "${r.slug ?? ''}"`);
    else if (!r.name) issue('name is required');
    else if (r.website_url && !r.website_url.startsWith('https://')) issue('website_url must start with https://');
    else payload.brands.push({ slug: r.slug!, name: r.name, website_url: r.website_url || undefined });
  }

  for (const { line, values: r } of csvRecords(csv.categories ?? '')) {
    const issue = (message: string) => issues.push({ file: 'categories', line, message });
    if (!SLUG_PATTERN.test(r.slug ?? '')) issue(`invalid slug "${r.slug ?? ''}"`);
    else if (!r.name) issue('name is required');
    else
      payload.categories.push({
        slug: r.slug!,
        name: r.name,
        parent_slug: r.parent_slug || undefined,
        sort: Number(r.sort || 0),
        variant_axes: parseList(r.variant_axes ?? ''),
      });
  }

  const products = new Map<string, CatalogProduct>();
  for (const { line, values: r } of csvRecords(csv.products ?? '')) {
    const issue = (message: string) => issues.push({ file: 'products', line, message });
    const slug = r.product_slug ?? '';
    if (!SLUG_PATTERN.test(slug)) {
      issue(`invalid product_slug "${slug}"`);
      continue;
    }
    const msrp = r.msrp_usd ? dollarsToCents(r.msrp_usd) : undefined;
    const variantMsrp = r.variant_msrp_usd ? dollarsToCents(r.variant_msrp_usd) : undefined;
    if (msrp === null || variantMsrp === null) {
      issue('MSRP must be a dollar amount like 279.95');
      continue;
    }
    const status = (r.status || 'active') as ProductStatus;
    if (!PRODUCT_STATUSES.includes(status)) {
      issue(`status must be one of ${PRODUCT_STATUSES.join(', ')}`);
      continue;
    }
    const identifiers: CatalogVariant['identifiers'] = [];
    for (const kind of IDENTIFIER_KINDS) if (r[kind]) identifiers.push({ kind, value: r[kind]! });

    let product = products.get(slug);
    if (!product) {
      if (!r.name || !r.brand_slug || !r.category_slug) {
        issue('the first row of a product needs name, brand_slug and category_slug');
        continue;
      }
      const year = r.model_year ? Number(r.model_year) : undefined;
      product = {
        slug,
        name: r.name,
        brand_slug: r.brand_slug,
        category_slug: r.category_slug,
        model_year: year,
        msrp_cents: msrp,
        status,
        specs: parsePairs(r.specs ?? ''),
        aliases: parseList(r.aliases ?? ''),
        variants: [],
      };
      products.set(slug, product);
    }
    const label = r.variant || 'Standard';
    if (product.variants.some((v) => v.label === label)) {
      issue(`duplicate variant "${label}" for ${slug}`);
      continue;
    }
    product.variants.push({
      label,
      msrp_cents: variantMsrp,
      is_default: r.default ? ['1', 'true', 'yes', 'y'].includes(r.default.toLowerCase()) : undefined,
      attributes: parsePairs(r.attributes ?? ''),
      identifiers,
    });
  }
  payload.products = [...products.values()];

  // Cross-file references (only against what this import defines; the DB checks existing rows).
  const brandSlugs = new Set(payload.brands.map((b) => b.slug));
  const categorySlugs = new Set(payload.categories.map((c) => c.slug));
  if (csv.brands !== undefined && csv.categories !== undefined) {
    for (const p of payload.products) {
      if (!brandSlugs.has(p.brand_slug)) issues.push({ file: 'products', line: 0, message: `${p.slug}: unknown brand "${p.brand_slug}"` });
      if (!categorySlugs.has(p.category_slug)) issues.push({ file: 'products', line: 0, message: `${p.slug}: unknown category "${p.category_slug}"` });
    }
  }
  return { payload, issues };
}
