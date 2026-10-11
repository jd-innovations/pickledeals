import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { ProductCard } from '@/components/Cards';
import { DealList, type SearchParams } from '@/components/DealList';
import { fetchBestPrices, fetchBrands, fetchCategories, fetchCategory } from '@/data/catalog';
import { categoryHref } from '@/lib/links';

export const revalidate = 300;

type Props = { params: Promise<{ slug: string }>; searchParams: Promise<SearchParams> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const data = await fetchCategory((await params).slug);
  if (!data) return {};
  const name = data.category.name;
  return {
    title: `Best pickleball ${name.toLowerCase()} deals`,
    description: `Pickleball ${name.toLowerCase()} on sale, with prices compared across stores and promo codes applied. ${data.products.length} products tracked.`,
    alternates: { canonical: categoryHref(data.category.slug) },
  };
}

/** Category page: live deals in the category, then every product in it ("best pickleball paddles" for search). */
export default async function CategoryPage({ params, searchParams }: Props) {
  const { slug } = await params;
  const [data, categories, brands, sp] = await Promise.all([fetchCategory(slug), fetchCategories(), fetchBrands(), searchParams]);
  if (!data) notFound();
  const prices = await fetchBestPrices(data.products.map((p) => p.id));
  const products = [...data.products].sort((a, b) => (prices.get(a.id) == null ? 1 : 0) - (prices.get(b.id) == null ? 1 : 0) || a.name.localeCompare(b.name));

  return (
    <main className="page tight wrap">
      <nav className="crumbs" aria-label="Breadcrumb">
        <Link href="/categories">Categories</Link>
        <span aria-hidden="true">›</span>
        <span aria-current="page">{data.category.name}</span>
      </nav>
      <div className="page-title">
        <h1>{data.category.name}</h1>
        <p className="sub num">
          Deals and prices on pickleball {data.category.name.toLowerCase()} · {data.products.length} {data.products.length === 1 ? 'product' : 'products'}
        </p>
      </div>
      <DealList base={{ feed: 'today', category: slug }} basePath={categoryHref(slug)} sp={sp} categories={categories} brands={brands} hide={['category']} emptyTitle={`No ${data.category.name.toLowerCase()} deals right now`} />
      {products.length > 0 && (
        <section className="section" style={{ marginTop: 32 }}>
          <div className="section-head">
            <h2>All {data.category.name.toLowerCase()}</h2>
            <span className="note">Best new price across the stores we check</span>
          </div>
          <div className="grid">
            {products.map((p) => (
              <ProductCard key={p.id} product={p} bestCents={prices.get(p.id) ?? null} />
            ))}
          </div>
        </section>
      )}
    </main>
  );
}
