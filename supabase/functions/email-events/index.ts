// email-events: Resend webhook. Hard bounces and spam complaints add the address to
// email_suppressions, which stops every PickleDeals notification email to it (sign-in codes are
// sent by Supabase Auth and aren't affected). Signed with the webhook's secret (RESEND_WEBHOOK_SECRET).
import { createClient } from 'npm:@supabase/supabase-js@2';

import { suppressionFor, verifyWebhook } from '../_shared/email.ts';

function serviceKey(): string {
  const keys = JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS') ?? '{}') as Record<string, string>;
  const key = keys.default ?? Object.values(keys)[0] ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!key) throw new Error('missing service key');
  return key;
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response(null, { status: 405 });
  const secret = Deno.env.get('RESEND_WEBHOOK_SECRET');
  if (!secret) return Response.json({ error: 'not configured' }, { status: 503 });

  const body = await req.text();
  const valid = await verifyWebhook(
    secret,
    { id: req.headers.get('svix-id'), timestamp: req.headers.get('svix-timestamp'), signature: req.headers.get('svix-signature') },
    body,
  );
  if (!valid) return Response.json({ error: 'invalid signature' }, { status: 401 });

  let event: Parameters<typeof suppressionFor>[0];
  try {
    event = JSON.parse(body);
  } catch {
    return Response.json({ error: 'bad json' }, { status: 400 });
  }
  const s = suppressionFor(event);
  if (!s) return Response.json({ ignored: event.type ?? null });

  const db = createClient(Deno.env.get('SUPABASE_URL')!, serviceKey(), { auth: { persistSession: false } });
  for (const address of s.emails) {
    const { error } = await db.rpc('suppress_email', { address, why: s.reason });
    if (error) return Response.json({ error: error.message }, { status: 500 });  // Resend retries
  }
  return Response.json({ suppressed: s.emails.length, reason: s.reason });
});
