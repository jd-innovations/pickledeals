import { NextResponse, type NextRequest } from 'next/server';

import { fetchMarketInBounds } from '@/data/market';

/** Listings inside the map's visible area, for "Search this area". Points are public ~1 km cell centres (D2). */
export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams;
  const n = (k: string) => Number(q.get(k));
  const bounds = { minLat: n('minLat'), minLng: n('minLng'), maxLat: n('maxLat'), maxLng: n('maxLng') };
  if (Object.values(bounds).some((v) => !Number.isFinite(v)) || bounds.minLat >= bounds.maxLat) {
    return NextResponse.json({ error: 'bad bounds' }, { status: 400 });
  }
  try {
    const res = await fetchMarketInBounds(bounds, q.get('category') || undefined);
    return NextResponse.json(res, { headers: { 'cache-control': 'public, s-maxage=60' } });
  } catch {
    return NextResponse.json({ total: 0, truncated: false, items: [] }, { status: 503 });
  }
}
