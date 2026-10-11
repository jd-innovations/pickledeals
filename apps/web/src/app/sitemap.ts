import type { MetadataRoute } from 'next';

import { fetchBrands, fetchCategories, fetchProductSlugs } from '@/data/catalog';
import { brandHref, categoryHref, FEED_PATHS, productHref } from '@/lib/links';
import { SITE_URL } from '@/lib/urls';

export const revalidate = 3600;

/** Lasting pages only: products, brands, categories and deal lists. Single deals come and go. */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [products, brands, categories] = await Promise.all([fetchProductSlugs(), fetchBrands(), fetchCategories()]);
  const url = (path: string) => `${SITE_URL}${path}`;
  return [
    { url: url('/'), changeFrequency: 'hourly', priority: 1 },
    ...Object.values(FEED_PATHS).map((p) => ({ url: url(p), changeFrequency: 'hourly' as const, priority: 0.8 })),
    { url: url('/promo-codes'), changeFrequency: 'daily', priority: 0.8 },
    { url: url('/categories'), changeFrequency: 'weekly', priority: 0.6 },
    { url: url('/brands'), changeFrequency: 'weekly', priority: 0.6 },
    { url: url('/marketplace'), changeFrequency: 'hourly', priority: 0.7 },
    ...categories.map((c) => ({ url: url(categoryHref(c.slug)), changeFrequency: 'daily' as const, priority: 0.7 })),
    ...brands.map((b) => ({ url: url(brandHref(b.slug)), changeFrequency: 'daily' as const, priority: 0.6 })),
    ...products.map((p) => ({ url: url(productHref(p.slug)), lastModified: p.updatedAt, changeFrequency: 'daily' as const, priority: 0.7 })),
    ...['/app', '/partners', '/support', '/privacy', '/terms', '/affiliate-disclosure'].map((p) => ({ url: url(p), changeFrequency: 'monthly' as const, priority: 0.3 })),
  ];
}
