import { NextResponse, type NextRequest } from 'next/server';

import { fetchMarket } from '@/data/market';

/**
 * Pre-owned listings near the visitor, from the request's approximate IP region (Vercel's geo
 * headers). Nothing is stored and no browser permission is asked; without a region the list is
 * nationwide, newest first. Kept out of the cached home page so that page stays static.
 */
export async function GET(req: NextRequest) {
  const lat = Number(req.headers.get('x-vercel-ip-latitude'));
  const lng = Number(req.headers.get('x-vercel-ip-longitude'));
  const city = req.headers.get('x-vercel-ip-city');
  const region = req.headers.get('x-vercel-ip-country-region');
  const origin = Number.isFinite(lat) && Number.isFinite(lng) && (lat !== 0 || lng !== 0) ? { lat, lng } : null;
  const category = req.nextUrl.searchParams.get('category') ?? undefined;

  try {
    let res = await fetchMarket({ origin, radiusM: 40_000, category, statuses: ['active'], limit: 10 });
    let near = !!origin;
    if (!res.items.length && origin) {
      res = await fetchMarket({ origin: null, radiusM: null, category, statuses: ['active'], sort: 'newest', limit: 10 });
      near = false;
    }
    const area = near && city ? `${decodeURIComponent(city)}${region ? `, ${region}` : ''}` : null;
    return NextResponse.json({ area, items: res.items }, { headers: { 'cache-control': 'private, max-age=300' } });
  } catch {
    return NextResponse.json({ area: null, items: [] }, { status: 503 });
  }
}
