import { createPrivateKey, sign } from 'node:crypto';

import { NextResponse, type NextRequest } from 'next/server';

/**
 * Short-lived MapKit JS token (Apple Maps on the website). Needs MAPKIT_TEAM_ID, MAPKIT_KEY_ID and
 * MAPKIT_PRIVATE_KEY (the .p8 from Apple Developer › Keys, MapKit JS enabled) in the environment.
 * The token only works on our own origins. Without the key the map simply doesn't show.
 */
const b64url = (b: Buffer | string) => Buffer.from(b).toString('base64url');

const ALLOWED = new Set(['https://pickledeals.app', 'https://www.pickledeals.app', 'http://localhost:3100']);

export async function GET(req: NextRequest) {
  const team = process.env.MAPKIT_TEAM_ID;
  const kid = process.env.MAPKIT_KEY_ID;
  const pem = process.env.MAPKIT_PRIVATE_KEY?.replace(/\\n/g, '\n');
  // ?check=1: does the site have a map at all? (Answered quietly, so pages don't log an error.)
  if (req.nextUrl.searchParams.has('check')) return NextResponse.json({ enabled: !!(team && kid && pem) });
  if (!team || !kid || !pem) return new NextResponse('MapKit is not configured', { status: 503 });

  const host = req.headers.get('host') ?? '';
  const proto = req.headers.get('x-forwarded-proto') ?? (host.startsWith('localhost') ? 'http' : 'https');
  const origin = `${proto}://${host}`;
  // Vercel preview deployments get their own origin; production and local dev are listed above.
  const allowed = ALLOWED.has(origin) || origin.endsWith('.vercel.app');
  if (!allowed) return new NextResponse('Unknown origin', { status: 403 });

  const now = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: 'ES256', kid, typ: 'JWT' }));
  const payload = b64url(JSON.stringify({ iss: team, iat: now, exp: now + 30 * 60, origin }));
  const signature = sign('sha256', Buffer.from(`${header}.${payload}`), { key: createPrivateKey(pem), dsaEncoding: 'ieee-p1363' });
  return new NextResponse(`${header}.${payload}.${b64url(signature)}`, { headers: { 'content-type': 'text/plain', 'cache-control': 'private, max-age=600' } });
}
