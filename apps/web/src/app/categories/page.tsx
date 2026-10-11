import type { Metadata } from 'next';
import Link from 'next/link';

import { ProductArt } from '@/components/ProductArt';
import { fetchCategories } from '@/data/catalog';
import { categoryArt } from '@/lib/art';
import { categoryHref } from '@/lib/links';

export const revalidate = 3600;

export const metadata: Metadata = {
  title: 'Shop pickleball gear by category',
  description: 'Paddles, shoes, balls, bags and accessories, with prices compared across pickleball stores.',
  alternates: { canonical: '/categories' },
};

export default async function CategoriesPage() {
  const categories = await fetchCategories();
  return (
    <main className="page tight wrap">
      <div className="page-title">
        <h1>Categories</h1>
        <p className="sub">Pickleball gear with prices compared across the stores we check.</p>
      </div>
      <div className="grid">
        {categories.map((c) => (
          <Link key={c.slug} href={categoryHref(c.slug)} className="card">
            <span className="tile">
              <ProductArt {...categoryArt(c.slug)} />
            </span>
            <span className="name" style={{ minHeight: 0, fontWeight: 700, fontSize: 17 }}>
              {c.name}
            </span>
            <span className="meta num">
              {c.productCount} {c.productCount === 1 ? 'product' : 'products'}
            </span>
          </Link>
        ))}
      </div>
    </main>
  );
}
