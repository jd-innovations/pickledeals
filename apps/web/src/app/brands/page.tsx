import type { Metadata } from 'next';

import { BrandChip } from '@/components/Cards';
import { fetchBrands } from '@/data/catalog';

export const revalidate = 3600;

export const metadata: Metadata = {
  title: 'Pickleball brands',
  description: 'Deals and promo codes from JOOLA, Selkirk, CRBN, Engage, Franklin and more pickleball brands.',
  alternates: { canonical: '/brands' },
};

export default async function BrandsPage() {
  const brands = await fetchBrands();
  return (
    <main className="page tight wrap">
      <div className="page-title">
        <h1>Brands</h1>
        <p className="sub num">{brands.length} pickleball brands with products we track</p>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(104px, 1fr))', gap: '28px 16px' }}>
        {[...brands]
          .sort((a, b) => a.name.localeCompare(b.name))
          .map((b) => (
            <BrandChip key={b.slug} brand={b} count={`${b.productCount} ${b.productCount === 1 ? 'product' : 'products'}`} />
          ))}
      </div>
    </main>
  );
}
