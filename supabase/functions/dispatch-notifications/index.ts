// dispatch-notifications (§11): sends pending notifications to the Expo Push API.
// Called every minute by pg_cron (public.trigger_dispatch) with the service key. Users without an
// active device are marked 'skipped' (the Activity feed still shows them). Tokens Expo reports as
// DeviceNotRegistered are revoked. Phase 10 adds preferences, quiet hours and receipts.
import { createClient } from 'npm:@supabase/supabase-js@2';

const EXPO_PUSH_URL = Deno.env.get('EXPO_PUSH_URL') ?? 'https://exp.host/--/api/v2/push/send';
const BATCH = 100;

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

type Pending = { id: string; user_id: string; title: string; body: string; route: string | null };
type Ticket = { status: 'ok' | 'error'; id?: string; message?: string; details?: { error?: string } };

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response(null, { status: 405 });
  if (!isServiceCall(req)) return new Response(JSON.stringify({ error: 'forbidden' }), { status: 403 });

  const db = createClient(Deno.env.get('SUPABASE_URL')!, serviceKey(), { auth: { persistSession: false } });

  const { data, error } = await db.rpc('claim_pending_notifications', { max_rows: 500 });
  const pending = (data ?? []) as Pending[];
  if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  if (!pending.length) return Response.json({ sent: 0, skipped: 0, failed: 0 });

  const userIds = [...new Set(pending.map((n) => n.user_id))];
  const { data: tokens } = await db.from('push_tokens').select('user_id, expo_token').in('user_id', userIds).is('revoked_at', null);
  const byUser = new Map<string, string[]>();
  for (const t of tokens ?? []) byUser.set(t.user_id, [...(byUser.get(t.user_id) ?? []), t.expo_token]);

  // One message per (notification, device).
  const messages = pending.flatMap((n) =>
    (byUser.get(n.user_id) ?? []).map((to) => ({ notificationId: n.id, to, title: n.title, body: n.body, sound: 'default', data: { route: n.route, notificationId: n.id } })),
  );

  const results = new Map<string, { ok: boolean; error?: string }>();
  const revoke: string[] = [];
  const headers: Record<string, string> = { 'content-type': 'application/json', accept: 'application/json' };
  const accessToken = Deno.env.get('EXPO_ACCESS_TOKEN');
  if (accessToken) headers.authorization = `Bearer ${accessToken}`;

  for (let i = 0; i < messages.length; i += BATCH) {
    const batch = messages.slice(i, i + BATCH);
    let tickets: Ticket[] = [];
    try {
      const res = await fetch(EXPO_PUSH_URL, {
        method: 'POST',
        headers,
        body: JSON.stringify(batch.map(({ notificationId: _id, ...m }) => m)),
      });
      tickets = ((await res.json()) as { data?: Ticket[] }).data ?? [];
      if (!res.ok && !tickets.length) throw new Error(`Expo push ${res.status}`);
    } catch (e) {
      tickets = batch.map(() => ({ status: 'error' as const, message: e instanceof Error ? e.message : String(e) }));
    }
    batch.forEach((m, j) => {
      const t = tickets[j] ?? { status: 'error', message: 'no ticket' };
      if (t.details?.error === 'DeviceNotRegistered') revoke.push(m.to);
      const prev = results.get(m.notificationId);
      // A notification counts as sent if any of the user's devices accepted it.
      if (!prev || (!prev.ok && t.status === 'ok')) results.set(m.notificationId, { ok: t.status === 'ok', error: t.message });
    });
  }

  if (revoke.length) await db.from('push_tokens').update({ revoked_at: new Date().toISOString() }).in('expo_token', revoke);

  const now = new Date().toISOString();
  const sent = pending.filter((n) => results.get(n.id)?.ok).map((n) => n.id);
  const failed = pending.filter((n) => results.has(n.id) && !results.get(n.id)!.ok);
  const skipped = pending.filter((n) => !results.has(n.id)).map((n) => n.id);

  if (sent.length) await db.from('notifications').update({ push_status: 'sent', pushed_at: now }).in('id', sent);
  if (skipped.length) await db.from('notifications').update({ push_status: 'skipped', pushed_at: now }).in('id', skipped);
  for (const n of failed) {
    await db.from('notifications').update({ push_status: 'failed', pushed_at: now, push_error: results.get(n.id)!.error?.slice(0, 200) ?? null }).eq('id', n.id);
  }

  return Response.json({ sent: sent.length, skipped: skipped.length, failed: failed.length, revoked: revoke.length });
});
