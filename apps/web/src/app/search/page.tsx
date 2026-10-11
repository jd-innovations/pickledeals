import type { Metadata } from 'next';
import Link from 'next/link';

import { BrandChip, DealCard, ProductCard } from '@/components/Cards';
import { fetchBestPrices, searchCatalog } from '@/data/catalog';
import { fetchDeals } from '@/data/deals';
import { categoryHref } from '@/lib/links';

type Props = { searchParams: Promise<{ q?: string | string[] }> };

export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const q = String((await searchParams).q ?? '').trim();
  return { title: q ? `“${q}” deals` : 'Search', robots: { index: false } };
}

/** Search: matching brands and categories, products with their best price, and live deals for those products. */
export default async function SearchPage({ searchParams }: Props) {
  const q = String((await searchParams).q ?? '')
    .trim()
    .slice(0, 80);
  if (!q) {
    return (
      <main className="page tight wrap">
        <div className="page-title">
          <h1>Search</h1>
          <p className="sub">Search paddles, shoes, balls and brands with the box above.</p>
        </div>
      </main>
    );
  }

  const results = await searchCatalog(q, 40);
  const ids = results.products.map((p) => p.id);
  const [prices, deals] = await Promise.all([fetchBestPrices(ids), fetchDeals({ feed: 'today', limit: 200 })]);
  const matching = deals.items.filter((d) => ids.includes(d.product.id));

  return (
    <main className="page tight wrap" style={{ gap: 36 }}>
      <div className="page-title">
        <h1>“{q}”</h1>
        <p className="sub num">
          {results.totalProducts} {results.totalProducts === 1 ? 'product' : 'products'}
          {matching.length ? ` · ${matching.length} live ${matching.length === 1 ? 'deal' : 'deals'}` : ''}
        </p>
      </div>

      {(results.brands.length > 0 || results.categories.length > 0) && (
        <div className="chips noscroll">
          {results.categories.map((c) => (
            <Link key={c.slug} href={categoryHref(c.slug)} className="chip">
              {c.name}
            </Link>
          ))}
        </div>
      )}

      {results.brands.length > 0 && (
        <section className="section">
          <div className="section-head">
            <h2>Brands</h2>
          </div>
          <div className="brands-row noscroll">
            {results.brands.map((b) => (
              <BrandChip key={b.slug} brand={b} count={`${b.matchedProducts} ${b.matchedProducts === 1 ? 'match' : 'matches'}`} />
            ))}
          </div>
        </section>
      )}

      {matching.length > 0 && (
        <section className="section">
          <div className="section-head">
            <h2>Live deals</h2>
          </div>
          <div className="grid">
            {matching.slice(0, 10).map((d) => (
              <DealCard key={d.id} deal={d} />
            ))}
          </div>
        </section>
      )}

      {results.products.length > 0 ? (
        <section className="section">
          <div className="section-head">
            <h2>Products</h2>
          </div>
          <div className="grid">
            {results.products.map((p) => (
              <ProductCard key={p.id} product={p} bestCents={prices.get(p.id) ?? null} />
            ))}
          </div>
        </section>
      ) : (
        <div className="empty">
          <h2>Nothing matches “{q}”</h2>
          <p>Check the spelling, or try a brand or category, like “JOOLA” or “paddles”.</p>
          <Link href="/categories" className="btn btn-primary btn-sm">
            Browse categories
          </Link>
        </div>
      )}
    </main>
  );
}
