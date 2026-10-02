// go — outbound redirect for "Get deal" (§10). GET /functions/v1/go?o={offer_id}&pl={placement}&p={promo_id}
//
// The client never builds retailer or affiliate URLs. This function looks up the active offer, adds
// the retailer's affiliate tag (secrets stay server-side), logs the click and 302s. Destinations are
// constrained to the retailer's domain, so it can't be used as an open redirect.
// Public by design (verify_jwt = false): the in-app browser can't send auth headers.
import { createClient } from 'npm:@supabase/supabase-js@2';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function serviceKey(): string {
  const keys = JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS') ?? '{}') as Record<string, string>;
  const key = keys.default ?? Object.values(keys)[0] ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!key) throw new Error('missing service key');
  return key;
}

const page = (status: number, title: string, body: string) =>
  new Response(
    `<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title>` +
      `<body style="font-family:-apple-system,system-ui,sans-serif;padding:48px 24px;max-width:420px;margin:auto">` +
      `<h1 style="font-size:22px">${title}</h1><p style="color:#555">${body}</p></body>`,
    { status, headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' } },
  );

/** Host must be the retailer's domain or a subdomain of it. */
const onDomain = (url: URL, domain: string) => url.protocol === 'https:' && (url.hostname === domain || url.hostname.endsWith(`.${domain}`));

Deno.serve(async (req) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') return new Response(null, { status: 405 });

  const params = new URL(req.url).searchParams;
  const offerId = params.get('o') ?? '';
  const promoId = params.get('p');
  const placement = (params.get('pl') ?? '').slice(0, 40) || null;
  if (!UUID.test(offerId) || (promoId && !UUID.test(promoId))) return page(400, 'Link not valid', 'This deal link is malformed.');

  const db = createClient(Deno.env.get('SUPABASE_URL')!, serviceKey(), { auth: { persistSession: false } });

  const { data: offer } = await db
    .from('retailer_offers')
    .select('id, url, status, retailer:retailers!inner(id, domain, is_active, affiliate:affiliate_programs(tag_template, is_active))')
    .eq('id', offerId)
    .maybeSingle();

  type Retailer = { id: string; domain: string; is_active: boolean; affiliate: { tag_template: string; is_active: boolean } | null };
  const retailer = offer?.retailer as unknown as Retailer | undefined;
  if (!offer || offer.status !== 'active' || !retailer?.is_active) {
    return page(404, 'This offer has ended', 'The retailer no longer lists it at this price. Open PickleDeals to see current offers.');
  }

  let target: URL;
  try {
    target = new URL(offer.url);
  } catch {
    return page(502, 'Link not available', 'We couldn’t open this retailer link.');
  }
  if (!onDomain(target, retailer.domain)) return page(502, 'Link not available', 'We couldn’t open this retailer link.');

  // Affiliate tag from the retailer's program (never stored on the client or in offer URLs).
  if (retailer.affiliate?.is_active) {
    for (const [k, v] of new URLSearchParams(retailer.affiliate.tag_template)) target.searchParams.set(k, v);
  }

  // Only log promo ids that belong to this retailer.
  let promo: string | null = null;
  if (promoId) {
    const { data } = await db.from('promo_codes').select('id').eq('id', promoId).eq('retailer_id', retailer.id).maybeSingle();
    promo = data?.id ?? null;
  }

  if (req.method === 'GET') {
    const { error } = await db.from('outbound_clicks').insert({ offer_id: offer.id, promo_id: promo, placement });
    if (error) console.error('go: click log failed', error.message);
  }

  return new Response(null, {
    status: 302,
    headers: { location: target.toString(), 'cache-control': 'no-store', 'referrer-policy': 'no-referrer' },
  });
});
