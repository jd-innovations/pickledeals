import type { Metadata } from 'next';
import { headers } from 'next/headers';
import Link from 'next/link';

import { MarketExplorer } from '@/components/client/MarketExplorer';
import { fetchCategories } from '@/data/catalog';
import { fetchMarket } from '@/data/market';

export const metadata: Metadata = {
  title: 'Pre-owned pickleball paddles and gear',
  description: 'Used paddles, shoes and gear from players near you. Message sellers and make offers in the PickleDeals app.',
  alternates: { canonical: '/marketplace' },
};

type Props = { searchParams: Promise<{ category?: string; product?: string; near?: string; focus?: string }> };

/**
 * Pre-owned marketplace. Listings near the visitor's approximate IP region (Vercel's geo headers; no
 * location permission, nothing stored), else nationwide. D2: area labels and ~1 km points only.
 */
export default async function MarketplacePage({ searchParams }: Props) {
  const [sp, h, categories] = await Promise.all([searchParams, headers(), fetchCategories()]);
  const lat = Number(h.get('x-vercel-ip-latitude'));
  const lng = Number(h.get('x-vercel-ip-longitude'));
  const city = h.get('x-vercel-ip-city');
  const region = h.get('x-vercel-ip-country-region');
  const ipOrigin = Number.isFinite(lat) && Number.isFinite(lng) && (lat !== 0 || lng !== 0) ? { lat, lng } : null;
  // "See nearby listings on the map" from a listing: centre on its public area cell and select it.
  const m = /^(-?\d{1,2}(?:\.\d+)?),(-?\d{1,3}(?:\.\d+)?)$/.exec(sp.near ?? '');
  const nearOrigin = m && Math.abs(Number(m[1])) <= 90 && Math.abs(Number(m[2])) <= 180 ? { lat: Number(m[1]), lng: Number(m[2]) } : null;
  const focus = nearOrigin && sp.focus && /^[0-9a-f-]{36}$/i.test(sp.focus) ? sp.focus : undefined;
  const category = categories.some((c) => c.slug === sp.category) ? sp.category : undefined;
  const productId = sp.product && /^[0-9a-f-]{36}$/i.test(sp.product) ? sp.product : undefined;

  let res = await fetchMarket({ origin: nearOrigin ?? ipOrigin, radiusM: 60_000, category, productId, statuses: ['active'], limit: 48 });
  let near = !!ipOrigin && !nearOrigin;
  if (ipOrigin && !nearOrigin && !res.items.length) {
    res = await fetchMarket({ origin: null, radiusM: null, category, productId, statuses: ['active'], sort: 'newest', limit: 48 });
    near = false;
  }
  const focusArea = focus ? (res.items.find((i) => i.id === focus)?.areaLabel ?? null) : null;
  const where = focusArea ?? (near && city ? `${decodeURIComponent(city)}${region ? `, ${region}` : ''}` : null);
  const catName = categories.find((c) => c.slug === category)?.name;

  return (
    <main className="page tight wrap">
      <div className="page-title">
        <h1>
          {catName ? `Pre-owned ${catName.toLowerCase()}` : 'Pre-owned'}
          {where ? ` near ${where}` : ''}
        </h1>
        <p className="sub num">
          {res.total} {res.total === 1 ? 'listing' : 'listings'}
          {where ? (focusArea ? ' in that area' : ' in your area') : ' from players across the US'} · areas are approximate (about 1 km)
        </p>
      </div>
      <nav className="chips noscroll" aria-label="Categories">
        <Link href="/marketplace" className={`chip${!category ? ' on' : ''}`}>
          All
        </Link>
        {categories.slice(0, 8).map((c) => (
          <Link key={c.slug} href={`/marketplace?category=${c.slug}`} className={`chip${category === c.slug ? ' on' : ''}`}>
            {c.name}
          </Link>
        ))}
      </nav>
      <MarketExplorer initial={res.items} origin={nearOrigin ?? (near ? ipOrigin : null)} category={category} focus={focus} />
    </main>
  );
}
