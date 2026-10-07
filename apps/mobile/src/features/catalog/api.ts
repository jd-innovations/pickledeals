import type { DescriptionBlock } from '@pickledeals/shared';
import { requireSupabase } from '@/lib/supabase';

/** Catalog reads (Phase 2). All public (D6): anon and signed-in users see the same visible rows. */

export type CatalogImage = { path: string; isCutout: boolean; blurhash: string | null };
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

export type SearchResults = {
  query: string;
  totalProducts: number;
  products: (ProductSummary & { score: number })[];
  brands: (Ref & { logoPath: string | null; matchedProducts: number })[];
  categories: (Ref & { matchedProducts: number })[];
};

export type CategorySummary = Ref & { id: string; productCount: number; sort: number };
export type BrandSummary = Ref & { id: string; logoPath: string | null; productCount: number };

export type ProductDetail = ProductSummary & {
  modelYear: number | null;
  status: 'draft' | 'active' | 'discontinued';
  specs: Record<string, string>;
  /** Store description (synced from a connected Shopify store), or null. */
  description: DescriptionBlock[] | null;
  variants: { id: string; label: string; msrpCents: number | null; isDefault: boolean; attributes: Record<string, string> }[];
  images: CatalogImage[];
};

export function imageUrl(image: CatalogImage): string {
  return requireSupabase().storage.from('catalog').getPublicUrl(image.path).data.publicUrl;
}

export function brandLogoUrl(path: string): string {
  return requireSupabase().storage.from('brand-logos').getPublicUrl(path).data.publicUrl;
}

// --- Search ---------------------------------------------------------------------------------------

type RawSearch = {
  query: string;
  total_products: number;
  products: {
    id: string;
    slug: string;
    name: string;
    msrp_cents: number | null;
    score: number;
    brand: Ref;
    category: Ref;
    image: { path: string; is_cutout: boolean; blurhash: string | null } | null;
  }[];
  brands: { slug: string; name: string; logo_path: string | null; matched_products: number }[];
  categories: { slug: string; name: string; matched_products: number }[];
};

export async function searchCatalog(query: string, limit = 20): Promise<SearchResults> {
  const { data, error } = await requireSupabase().rpc('search_catalog', { q: query, product_limit: limit });
  if (error) throw error;
  const raw = data as unknown as RawSearch;
  return {
    query: raw.query,
    totalProducts: raw.total_products,
    products: raw.products.map((p) => ({
      id: p.id,
      slug: p.slug,
      name: p.name,
      msrpCents: p.msrp_cents,
      score: p.score,
      brand: p.brand,
      category: p.category,
      image: p.image ? { path: p.image.path, isCutout: p.image.is_cutout, blurhash: p.image.blurhash } : null,
    })),
    brands: raw.brands.map((b) => ({ slug: b.slug, name: b.name, logoPath: b.logo_path, matchedProducts: b.matched_products })),
    categories: raw.categories.map((c) => ({ slug: c.slug, name: c.name, matchedProducts: c.matched_products })),
  };
}

// --- Browse ---------------------------------------------------------------------------------------

export async function fetchCategories(): Promise<CategorySummary[]> {
  const { data, error } = await requireSupabase()
    .from('category_summaries')
    .select('id, slug, name, sort, product_count')
    .is('parent_id', null)
    .order('sort');
  if (error) throw error;
  return data.map((c) => ({ id: c.id!, slug: c.slug!, name: c.name!, sort: c.sort ?? 0, productCount: c.product_count ?? 0 }));
}

export async function fetchBrands(): Promise<BrandSummary[]> {
  const { data, error } = await requireSupabase()
    .from('brand_summaries')
    .select('id, slug, name, logo_path, product_count')
    .gt('product_count', 0)
    .order('product_count', { ascending: false })
    .order('name');
  if (error) throw error;
  return data.map((b) => ({ id: b.id!, slug: b.slug!, name: b.name!, logoPath: b.logo_path, productCount: b.product_count ?? 0 }));
}

// --- Product lists --------------------------------------------------------------------------------

const PRODUCT_COLUMNS =
  'id, slug, name, msrp_cents, brand:brands!inner(slug, name), category:categories!inner(slug, name), images:product_images(storage_path, is_cutout, blurhash, sort)';

type ProductRow = {
  id: string;
  slug: string;
  name: string;
  msrp_cents: number | null;
  brand: Ref;
  category: Ref;
  images: { storage_path: string; is_cutout: boolean; blurhash: string | null; sort: number }[];
};

const firstImage = (images: ProductRow['images']): CatalogImage | null => {
  const img = [...images].sort((a, b) => a.sort - b.sort)[0];
  return img ? { path: img.storage_path, isCutout: img.is_cutout, blurhash: img.blurhash } : null;
};

const toSummary = (row: ProductRow): ProductSummary => ({
  id: row.id,
  slug: row.slug,
  name: row.name,
  msrpCents: row.msrp_cents,
  brand: row.brand,
  category: row.category,
  image: firstImage(row.images),
});

/**
 * Regular-priced products whose best price (after codes, no shipping) is at most `maxCents`, cheapest
 * first; one entry per product (its cheapest variant). For "More under $50" below the deals.
 */
export async function fetchProductsUnder(maxCents: number, limit = 100): Promise<(ProductSummary & { priceCents: number })[]> {
  const { data, error } = await requireSupabase()
    .from('variant_price_stats')
    .select(`best_delivered_cents, variant:product_variants!inner(product_id, product:products!inner(status, ${PRODUCT_COLUMNS}))`)
    .lte('best_delivered_cents', maxCents)
    .eq('variant.product.status', 'active')
    .order('best_delivered_cents')
    .limit(limit);
  if (error) throw error;
  const seen = new Set<string>();
  const out: (ProductSummary & { priceCents: number })[] = [];
  for (const r of data as unknown as { best_delivered_cents: number; variant: { product: ProductRow } }[]) {
    const p = r.variant.product;
    if (seen.has(p.id)) continue;
    seen.add(p.id);
    out.push({ ...toSummary(p), priceCents: r.best_delivered_cents });
  }
  return out;
}

export async function fetchCategory(slug: string): Promise<{ category: Ref; products: ProductSummary[] }> {
  const client = requireSupabase();
  const [category, products] = await Promise.all([
    client.from('categories').select('slug, name').eq('slug', slug).single(),
    client
      .from('products')
      .select(PRODUCT_COLUMNS)
      .eq('status', 'active')
      .eq('category.slug', slug)
      .order('name')
      .limit(300)
      .returns<ProductRow[]>(),
  ]);
  if (category.error) throw category.error;
  if (products.error) throw products.error;
  return { category: category.data, products: products.data.map(toSummary) };
}

export async function fetchBrand(slug: string): Promise<{ brand: BrandSummary & { websiteUrl: string | null }; products: ProductSummary[] }> {
  const client = requireSupabase();
  const [brand, products] = await Promise.all([
    client.from('brands').select('id, slug, name, logo_path, website_url').eq('slug', slug).single(),
    client
      .from('products')
      .select(PRODUCT_COLUMNS)
      .eq('status', 'active')
      .eq('brand.slug', slug)
      .order('name')
      .limit(300)
      .returns<ProductRow[]>(),
  ]);
  if (brand.error) throw brand.error;
  if (products.error) throw products.error;
  const items = products.data.map(toSummary);
  return {
    brand: { id: brand.data.id, slug: brand.data.slug, name: brand.data.name, logoPath: brand.data.logo_path, websiteUrl: brand.data.website_url, productCount: items.length },
    products: items,
  };
}

export async function fetchProduct(slug: string): Promise<ProductDetail> {
  const { data, error } = await requireSupabase()
    .from('products')
    .select(
      `${PRODUCT_COLUMNS}, model_year, status, specs, description, variants:product_variants(id, label, msrp_cents, is_default, attributes, sort)`,
    )
    .eq('slug', slug)
    .single<
      ProductRow & {
        model_year: number | null;
        status: ProductDetail['status'];
        specs: Record<string, string>;
        description: DescriptionBlock[] | null;
        variants: { id: string; label: string; msrp_cents: number | null; is_default: boolean; attributes: Record<string, string>; sort: number }[];
      }
    >();
  if (error) throw error;
  return {
    ...toSummary(data),
    modelYear: data.model_year,
    status: data.status,
    specs: data.specs,
    description: data.description,
    images: [...data.images].sort((a, b) => a.sort - b.sort).map((i) => ({ path: i.storage_path, isCutout: i.is_cutout, blurhash: i.blurhash })),
    variants: [...data.variants]
      .sort((a, b) => a.sort - b.sort)
      .map((v) => ({ id: v.id, label: v.label, msrpCents: v.msrp_cents, isDefault: v.is_default, attributes: v.attributes })),
  };
}

export async function fetchProductSlug(productId: string): Promise<string> {
  const { data, error } = await requireSupabase().from('products').select('slug').eq('id', productId).single();
  if (error) throw error;
  return data.slug;
}
