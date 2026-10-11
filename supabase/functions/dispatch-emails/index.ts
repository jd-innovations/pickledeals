// dispatch-emails: sends missed-message and account-notice emails through Resend.
// Called every 5 minutes by pg_cron (public.trigger_email_dispatch) with the service key. Which
// notifications are due (unread for an hour, one per thread per day, quiet hours, suppressions) is
// decided in SQL by claim_pending_emails. Without RESEND_API_KEY it does nothing and claims nothing.
// Each send uses the notification id as Resend's idempotency key, so a retried claim never sends twice.
import { createClient } from 'npm:@supabase/supabase-js@2';

import { renderEmail, type EmailKind } from '../_shared/email.ts';

const RESEND_URL = Deno.env.get('RESEND_URL') ?? 'https://api.resend.com/emails';
const EMAIL_FROM = Deno.env.get('EMAIL_FROM') ?? 'PickleDeals <notifications@pickledeals.app>';
const SITE_URL = (Deno.env.get('SITE_URL') ?? 'https://pickledeals.app').replace(/\/$/, '');
const FUNCTIONS_URL = (Deno.env.get('PUBLIC_FUNCTIONS_URL') ?? `${Deno.env.get('SUPABASE_URL')}/functions/v1`).replace(/\/$/, '');

function serviceKey(): string {
  const keys = JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS') ?? '{}') as Record<string, string>;
  const key = keys.default ?? Object.values(keys)[0] ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!key) throw new Error('missing service key');
  return key;
}

/** The gateway verifies the JWT signature (verify_jwt); here we require the service role. */
function isServiceCall(req: Request): boolean {
  const token = req.headers.get('Authorization')?.replace(/^Bearer\s+/i, '') ?? '';
  if (token === serviceKey()) return true;
  try {
    const payload = JSON.parse(atob(token.split('.')[1]!.replace(/-/g, '+').replace(/_/g, '/')));
    return payload.role === 'service_role';
  } catch {
    return false;
  }
}

type Claimed = {
  id: string;
  user_id: string;
  email: string;
  kind: EmailKind;
  title: string;
  body: string;
  route: string | null;
  listing_title: string | null;
  unread: number;
  token: string;
};

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response(null, { status: 405 });
  if (!isServiceCall(req)) return Response.json({ error: 'forbidden' }, { status: 403 });

  const apiKey = Deno.env.get('RESEND_API_KEY');
  if (!apiKey) return Response.json({ sent: 0, disabled: 'RESEND_API_KEY not set' });

  const db = createClient(Deno.env.get('SUPABASE_URL')!, serviceKey(), { auth: { persistSession: false } });
  const { data, error } = await db.rpc('claim_pending_emails', { max_rows: 50 });
  if (error) return Response.json({ error: error.message }, { status: 500 });
  const claimed = (data ?? []) as Claimed[];

  let sent = 0;
  let failed = 0;
  for (const n of claimed) {
    const optional = n.kind !== 'system';
    const oneClick = `${FUNCTIONS_URL}/email-unsubscribe?t=${n.token}`;
    const email = renderEmail({
      kind: n.kind,
      title: n.title,
      body: n.body,
      route: n.route,
      listingTitle: n.listing_title,
      unread: n.unread,
      unsubscribeUrl: optional ? `${SITE_URL}/unsubscribe?t=${n.token}` : null,
      siteUrl: SITE_URL,
    });
    let ok = false;
    let retry = false;
    let problem: string | null = null;
    try {
      const res = await fetch(RESEND_URL, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${apiKey}`,
          'content-type': 'application/json',
          'idempotency-key': `notification-${n.id}`,
        },
        body: JSON.stringify({
          from: EMAIL_FROM,
          to: [n.email],
          subject: email.subject,
          html: email.html,
          text: email.text,
          // RFC 8058 one-click unsubscribe (Gmail/Yahoo); account notices aren't optional.
          ...(optional ? { headers: { 'List-Unsubscribe': `<${oneClick}>`, 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' } } : {}),
        }),
      });
      ok = res.ok;
      retry = res.status === 429 || res.status >= 500;
      if (!ok) problem = `Resend ${res.status}: ${(await res.text()).slice(0, 160)}`;
    } catch (e) {
      retry = true;
      problem = e instanceof Error ? e.message : String(e);
    }
    if (retry) {
      // Left as 'sending': the claim is retried after 10 minutes, and the idempotency key stops a double send.
      failed++;
      await new Promise((r) => setTimeout(r, 1000));
      continue;
    }
    const now = new Date().toISOString();
    await db
      .from('notifications')
      .update(ok ? { email_status: 'sent', email_at: now, email_error: null } : { email_status: 'failed', email_at: now, email_error: problem?.slice(0, 200) ?? null })
      .eq('id', n.id);
    if (ok) sent++;
    else failed++;
    await new Promise((r) => setTimeout(r, 250));
  }

  return Response.json({ claimed: claimed.length, sent, failed });
});
