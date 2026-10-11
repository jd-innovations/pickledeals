import { createPrivateKey, sign } from 'node:crypto';

import { NextResponse, type NextRequest } from 'next/server';

/**
 * MapKit JS token (Apple Maps on the website): MAPKIT_TOKEN (a token made in Apple Developer), or a
 * short-lived one we sign from MAPKIT_TEAM_ID, MAPKIT_KEY_ID and
 * MAPKIT_PRIVATE_KEY (the .p8 from Apple Developer › Keys, MapKit JS enabled) in the environment.
 * The token only works on our own origins. Without the key the map simply doesn't show.
 */
const b64url = (b: Buffer | string) => Buffer.from(b).toString('base64url');

const ALLOWED = new Set(['https://pickledeals.app', 'https://www.pickledeals.app', 'http://localhost:3100']);

export async function GET(req: NextRequest) {
  const team = process.env.MAPKIT_TEAM_ID;
  const kid = process.env.MAPKIT_KEY_ID;
  const pem = process.env.MAPKIT_PRIVATE_KEY?.replace(/\\n/g, '\n');
  // A ready-made token from Apple Developer (Maps IDs › MapKit JS token), restricted by Apple to the
  // domains chosen when it was created. Used as-is; takes priority over signing our own.
  // Each token names one origin, so MAPKIT_TOKEN may hold several, comma-separated: serve the one for
  // this host (pickledeals.app, www.pickledeals.app, the Vercel preview), else the first.
  const requestHost = (req.headers.get('host') ?? '').toLowerCase();
  const tokens = (process.env.MAPKIT_TOKEN ?? '').split(',').map((t) => t.trim()).filter(Boolean);
  const originOf = (t: string) => {
    try {
      return String((JSON.parse(Buffer.from(t.split('.')[1] ?? '', 'base64url').toString()) as { origin?: string }).origin ?? '')
        .toLowerCase()
        .replace(/^https?:\/\//, '');
    } catch {
      return '';
    }
  };
  const issued = tokens.find((t) => originOf(t) === requestHost) ?? tokens[0];
  // ?check=1: does the site have a map at all? (Answered quietly, so pages don't log an error.)
  if (req.nextUrl.searchParams.has('check')) return NextResponse.json({ enabled: !!issued || !!(team && kid && pem) });
  if (issued) return new NextResponse(issued, { headers: { 'content-type': 'text/plain', 'cache-control': 'private, max-age=600' } });
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
