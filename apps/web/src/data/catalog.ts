import type { DescriptionBlock } from '@pickledeals/shared';

import { db } from '@/lib/supabase';

/** Catalog reads. Mirrors apps/mobile/src/features/catalog/api.ts (public rows only, D6). */

export type CatalogImage = { path: string; isCutout: boolean };
export type Ref = { slug: string; name: string };

export type ProductSummary = {
  id: string;
  slug: string;
  name: string;
  msrpCents: number | null;
  brand: Ref;
  category: Ref;
  image: CatalogImage | null;
};

export type ProductDetail = ProductSummary & {
  modelYear: number | null;
  status: 'draft' | 'active' | 'discontinued';
  specs: Record<string, string>;
  description: DescriptionBlock[] | null;
  variants: { id: string; label: string; msrpCents: number | null; isDefault: boolean }[];
  images: CatalogImage[];
};

export type CategorySummary = Ref & { id: string; productCount: number; sort: number };
export type BrandSummary = Ref & { id: string; logoPath: string | null; productCount: number };

const PRODUCT_COLUMNS =
  'id, slug, name, msrp_cents, brand:brands!inner(slug, name), category:categories!inner(slug, name), images:product_images(storage_path, is_cutout, sort)';

type ProductRow = {
  id: string;
  slug: string;
  name: string;
  msrp_cents: number | null;
  brand: Ref;
  category: Ref;
  images: { storage_path: string; is_cutout: boolean; sort: number }[];
};

const sortedImages = (images: ProductRow['images']): CatalogImage[] =>
  [...images].sort((a, b) => a.sort - b.sort).map((i) => ({ path: i.storage_path, isCutout: i.is_cutout }));

const toSummary = (row: ProductRow): ProductSummary => ({
  id: row.id,
  slug: row.slug,
  name: row.name,
  msrpCents: row.msrp_cents,
  brand: row.brand,
  category: row.category,
  image: sortedImages(row.images)[0] ?? null,
});

export async function fetchCategories(): Promise<CategorySummary[]> {
  const { data, error } = await db().from('category_summaries').select('id, slug, name, sort, product_count').is('parent_id', null).order('sort');
  if (error) throw error;
  return data.map((c) => ({ id: c.id!, slug: c.slug!, name: c.name!, sort: c.sort ?? 0, productCount: c.product_count ?? 0 }));
}

export async function fetchBrands(): Promise<BrandSummary[]> {
  const { data, error } = await db()
    .from('brand_summaries')
    .select('id, slug, name, logo_path, product_count')
    .gt('product_count', 0)
    .order('product_count', { ascending: false })
    .order('name');
  if (error) throw error;
  return data.map((b) => ({ id: b.id!, slug: b.slug!, name: b.name!, logoPath: b.logo_path, productCount: b.product_count ?? 0 }));
}

export async function fetchCategory(slug: string): Promise<{ category: Ref; products: ProductSummary[] } | null> {
  const [category, products] = await Promise.all([
    db().from('categories').select('slug, name').eq('slug', slug).maybeSingle(),
    db().from('products').select(PRODUCT_COLUMNS).eq('status', 'active').eq('category.slug', slug).order('name').limit(300).returns<ProductRow[]>(),
  ]);
  if (category.error) throw category.error;
  if (products.error) throw products.error;
  if (!category.data) return null;
  return { category: category.data, products: products.data.map(toSummary) };
}

export async function fetchBrand(
  slug: string,
): Promise<{ brand: BrandSummary & { websiteUrl: string | null }; products: ProductSummary[] } | null> {
  const [brand, products] = await Promise.all([
    db().from('brands').select('id, slug, name, logo_path, website_url').eq('slug', slug).maybeSingle(),
    db().from('products').select(PRODUCT_COLUMNS).eq('status', 'active').eq('brand.slug', slug).order('name').limit(300).returns<ProductRow[]>(),
  ]);
  if (brand.error) throw brand.error;
  if (products.error) throw products.error;
  if (!brand.data) return null;
  const items = products.data.map(toSummary);
  return {
    brand: { id: brand.data.id, slug: brand.data.slug, name: brand.data.name, logoPath: brand.data.logo_path, websiteUrl: brand.data.website_url, productCount: items.length },
    products: items,
  };
}

export async function fetchProduct(slug: string): Promise<ProductDetail | null> {
  const { data, error } = await db()
    .from('products')
    .select(`${PRODUCT_COLUMNS}, model_year, status, specs, description, variants:product_variants(id, label, msrp_cents, is_default, sort)`)
    .eq('slug', slug)
    .maybeSingle<
      ProductRow & {
        model_year: number | null;
        status: ProductDetail['status'];
        specs: Record<string, string>;
        description: DescriptionBlock[] | null;
        variants: { id: string; label: string; msrp_cents: number | null; is_default: boolean; sort: number }[];
      }
    >();
  if (error) throw error;
  if (!data) return null;
  return {
    ...toSummary(data),
    modelYear: data.model_year,
    status: data.status,
    specs: data.specs ?? {},
    description: data.description,
    images: sortedImages(data.images),
    variants: [...data.variants].sort((a, b) => a.sort - b.sort).map((v) => ({ id: v.id, label: v.label, msrpCents: v.msrp_cents, isDefault: v.is_default })),
  };
}

export async function fetchProductSlug(productId: string): Promise<string | null> {
  const { data, error } = await db().from('products').select('slug').eq('id', productId).maybeSingle();
  if (error) throw error;
  return data?.slug ?? null;
}

export type SearchResults = {
  query: string;
  totalProducts: number;
  products: ProductSummary[];
  brands: (Ref & { logoPath: string | null; matchedProducts: number })[];
  categories: (Ref & { matchedProducts: number })[];
};

export async function searchCatalog(query: string, limit = 40): Promise<SearchResults> {
  const { data, error } = await db().rpc('search_catalog', { q: query, product_limit: limit });
  if (error) throw error;
  const raw = data as unknown as {
    query: string;
    total_products: number;
    products: { id: string; slug: string; name: string; msrp_cents: number | null; brand: Ref; category: Ref; image: { path: string; is_cutout: boolean } | null }[];
    brands: { slug: string; name: string; logo_path: string | null; matched_products: number }[];
    categories: { slug: string; name: string; matched_products: number }[];
  };
  return {
    query: raw.query,
    totalProducts: raw.total_products,
    products: raw.products.map((p) => ({
      id: p.id,
      slug: p.slug,
      name: p.name,
      msrpCents: p.msrp_cents,
      brand: p.brand,
      category: p.category,
      image: p.image ? { path: p.image.path, isCutout: p.image.is_cutout } : null,
    })),
    brands: raw.brands.map((b) => ({ slug: b.slug, name: b.name, logoPath: b.logo_path, matchedProducts: b.matched_products })),
    categories: raw.categories.map((c) => ({ slug: c.slug, name: c.name, matchedProducts: c.matched_products })),
  };
}

/** Best tracked new price per product (cheapest variant). Price stats exclude Amazon, so D1 holds. */
export async function fetchBestPrices(productIds: string[]): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  if (!productIds.length) return out;
  const { data, error } = await db()
    .from('variant_price_stats')
    .select('best_delivered_cents, variant:product_variants!inner(product_id)')
    .in('variant.product_id', productIds)
    .not('best_delivered_cents', 'is', null);
  if (error) throw error;
  for (const r of data as unknown as { best_delivered_cents: number; variant: { product_id: string } }[]) {
    const prev = out.get(r.variant.product_id);
    if (prev == null || r.best_delivered_cents < prev) out.set(r.variant.product_id, r.best_delivered_cents);
  }
  return out;
}

/** Every active product slug, for the sitemap. */
export async function fetchProductSlugs(): Promise<{ slug: string; updatedAt: string }[]> {
  const { data, error } = await db().from('products').select('slug, updated_at').eq('status', 'active').limit(5000);
  if (error) throw error;
  return data.map((p) => ({ slug: p.slug, updatedAt: p.updated_at }));
}
