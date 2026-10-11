// partner-apply: the website's "Partner with PickleDeals" form (Shopify stores only).
//   POST JSON { company, name, email, store, interests[], message?, website? }
//   200 { ok: true, shopName }         saved and emailed to the team
//   422 { error: 'not_shopify' }       the store doesn't answer like a Shopify store; nothing saved
//   400 { error: 'invalid', field, message }
//   429 { error: 'too_many' }          more than 3 applications from this visitor in an hour
// Spam checks are invisible: `website` is a hidden trap field (filled → pretend success, save
// nothing) and a salted IP hash limits the rate. Public (verify_jwt = false); called from the browser.
import { createClient } from 'npm:@supabase/supabase-js@2';

import { escapeHtml } from '../_shared/email.ts';
import { checkApplication, normalizeStoreHost, PARTNER_INTEREST_LABELS, shopifyFromHeaders, shopifyFromMeta, type ShopifyCheck } from '../_shared/partners.ts';

const RESEND_URL = Deno.env.get('RESEND_URL') ?? 'https://api.resend.com/emails';
const EMAIL_FROM = Deno.env.get('EMAIL_FROM') ?? 'PickleDeals <notifications@pickledeals.app>';
const PER_HOUR = 3;

function serviceKey(): string {
  const keys = JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS') ?? '{}') as Record<string, string>;
  const key = keys.default ?? Object.values(keys)[0] ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!key) throw new Error('missing service key');
  return key;
}

function allowedOrigin(origin: string | null): string | null {
  if (!origin) return null;
  try {
    const u = new URL(origin);
    if (u.hostname === 'pickledeals.app' || u.hostname === 'www.pickledeals.app' || u.hostname.endsWith('.vercel.app')) return origin;
    if (u.hostname === 'localhost') return origin;
  } catch {
    /* not a URL */
  }
  return null;
}

const json = (status: number, body: unknown, origin: string | null) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json',
      ...(origin ? { 'access-control-allow-origin': origin, vary: 'Origin' } : {}),
    },
  });

async function sha256(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** GET with a short timeout, following at most 3 redirects and only to other public hosts. */
async function fetchPublic(url: string, accept: string): Promise<Response | null> {
  let current = url;
  for (let hop = 0; hop < 4; hop++) {
    const host = normalizeStoreHost(current);
    if (!host) return null;
    const res = await fetch(current, { redirect: 'manual', headers: { accept, 'user-agent': 'PickleDeals partner check (+https://pickledeals.app/partners)' }, signal: AbortSignal.timeout(6000) }).catch(() => null);
    if (!res) return null;
    const next = res.status >= 300 && res.status < 400 ? res.headers.get('location') : null;
    if (!next) return res;
    await res.body?.cancel();
    current = new URL(next, current).toString();
  }
  return null;
}

async function checkShopify(host: string): Promise<ShopifyCheck> {
  const meta = await fetchPublic(`https://${host}/meta.json`, 'application/json');
  if (meta?.ok) {
    const found = shopifyFromMeta(await meta.json().catch(() => null));
    if (found.shopify) return found;
  } else {
    await meta?.body?.cancel();
  }
  const home = await fetchPublic(`https://${host}/`, 'text/html');
  if (!home) return { shopify: false };
  await home.body?.cancel();
  return shopifyFromHeaders(home.headers);
}

Deno.serve(async (req) => {
  const origin = allowedOrigin(req.headers.get('origin'));
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: origin ? { 'access-control-allow-origin': origin, 'access-control-allow-methods': 'POST, OPTIONS', 'access-control-allow-headers': 'content-type', vary: 'Origin' } : {},
    });
  }
  if (req.method !== 'POST') return json(405, { error: 'method' }, origin);

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json(400, { error: 'invalid', field: 'form', message: 'Something went wrong sending the form. Try again.' }, origin);
  }
  // Hidden trap field: people never see it, bots fill it in.
  if (typeof body.website === 'string' && body.website.trim()) return json(200, { ok: true, shopName: null }, origin);

  const check = checkApplication(body);
  if (!check.ok) return json(400, { error: 'invalid', field: check.field, message: check.message }, origin);
  const app = check.value;

  const db = createClient(Deno.env.get('SUPABASE_URL')!, serviceKey(), { auth: { persistSession: false } });
  const ip = (req.headers.get('x-forwarded-for') ?? '').split(',')[0]!.trim() || 'unknown';
  const clientHash = await sha256(`${ip}|partner-apply|${serviceKey().slice(-12)}`);
  const { count } = await db
    .from('partner_inquiries')
    .select('id', { count: 'exact', head: true })
    .eq('client_hash', clientHash)
    .gt('created_at', new Date(Date.now() - 3600_000).toISOString());
  if ((count ?? 0) >= PER_HOUR) return json(429, { error: 'too_many', message: 'You’ve sent a few applications already. Try again in an hour, or email support@pickledeals.app.' }, origin);

  const shop = await checkShopify(app.storeHost);
  if (!shop.shopify) return json(422, { error: 'not_shopify', host: app.storeHost }, origin);

  const { data: row, error } = await db
    .from('partner_inquiries')
    .insert({
      company: app.company,
      contact_name: app.name,
      email: app.email,
      store_host: app.storeHost,
      myshopify_domain: shop.myshopifyDomain,
      shop_name: shop.shopName,
      interests: app.interests,
      message: app.message,
      client_hash: clientHash,
    })
    .select('id')
    .single();
  if (error) return json(500, { error: 'save', message: 'We couldn’t save your application. Try again in a minute.' }, origin);

  // Tell the team. A failed email doesn't fail the application: it's saved and shows in admin.
  const apiKey = Deno.env.get('RESEND_API_KEY');
  const inbox = Deno.env.get('PARTNER_INBOX');
  if (apiKey && inbox) {
    const lines: [string, string][] = [
      ['Brand or store', app.company],
      ['Contact', `${app.name} <${app.email}>`],
      ['Store', `https://${app.storeHost}${shop.myshopifyDomain ? ` (${shop.myshopifyDomain})` : ''}`],
      ['Interested in', app.interests.map((i) => PARTNER_INTEREST_LABELS[i]).join(', ')],
      ['Message', app.message ?? '—'],
    ];
    const html = `<div style="font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;font-size:15px;line-height:1.5;color:#0a0a0a">
<h2 style="margin:0 0 12px">New partner application</h2>
<table cellpadding="6" style="border-collapse:collapse">${lines.map(([k, v]) => `<tr><td style="color:#555;vertical-align:top">${escapeHtml(k)}</td><td style="white-space:pre-line">${escapeHtml(v)}</td></tr>`).join('')}</table>
<p style="color:#555">Reply to this email to answer ${escapeHtml(app.name)}. It’s also in the admin app under Partner applications.</p></div>`;
    await fetch(RESEND_URL, {
      method: 'POST',
      headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json', 'idempotency-key': `partner-${row.id}` },
      body: JSON.stringify({
        from: EMAIL_FROM,
        to: [inbox],
        reply_to: app.email,
        subject: `Partner application: ${app.company}`.slice(0, 150),
        html,
        text: lines.map(([k, v]) => `${k}: ${v}`).join('\n'),
      }),
    }).catch(() => null);
  }

  return json(200, { ok: true, shopName: shop.shopName }, origin);
});
