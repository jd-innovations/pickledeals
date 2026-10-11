// email-unsubscribe: turns off missed-message emails from a link, without signing in.
//   POST ?t=<token>  RFC 8058 one-click (mail clients send `List-Unsubscribe=One-Click`) and the
//                    site's /unsubscribe page; always 200 { ok: true } so tokens can't be probed.
//   GET  ?t=<token>  some clients open the header link: redirect to the site's confirmation page.
// The token is profiles_private.email_token; it can only switch emails off.
import { createClient } from 'npm:@supabase/supabase-js@2';

const SITE_URL = (Deno.env.get('SITE_URL') ?? 'https://pickledeals.app').replace(/\/$/, '');
const TOKEN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function serviceKey(): string {
  const keys = JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS') ?? '{}') as Record<string, string>;
  const key = keys.default ?? Object.values(keys)[0] ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!key) throw new Error('missing service key');
  return key;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  const token = new URL(req.url).searchParams.get('t') ?? '';

  if (req.method === 'GET') {
    return new Response(null, { status: 302, headers: { location: `${SITE_URL}/unsubscribe?t=${encodeURIComponent(token)}` } });
  }
  if (req.method !== 'POST') return new Response(null, { status: 405, headers: cors });

  if (TOKEN.test(token)) {
    const db = createClient(Deno.env.get('SUPABASE_URL')!, serviceKey(), { auth: { persistSession: false } });
    const { error } = await db.rpc('unsubscribe_email', { token });
    if (error) return Response.json({ ok: false }, { status: 500, headers: cors });
  }
  return Response.json({ ok: true }, { headers: cors });
});
