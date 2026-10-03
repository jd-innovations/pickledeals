// dispatch-notifications (§11): sends pending notifications to the Expo Push API.
// Called every minute by pg_cron (public.trigger_dispatch) with the service key. Users without an
// active device are marked 'skipped' (the Activity feed still shows them). Tokens Expo reports as
// DeviceNotRegistered are revoked. Phase 10: preferences, quiet hours, the daily cap and the
// morning summary are decided in SQL (claim_pending_notifications); each push carries the iOS badge.
// Tickets are kept, and a receipts pass ~15 minutes later revokes tokens Expo reports as
// DeviceNotRegistered (§11).
import { createClient } from 'npm:@supabase/supabase-js@2';

const EXPO_PUSH_URL = Deno.env.get('EXPO_PUSH_URL') ?? 'https://exp.host/--/api/v2/push/send';
const EXPO_RECEIPTS_URL = Deno.env.get('EXPO_RECEIPTS_URL') ?? 'https://exp.host/--/api/v2/push/getReceipts';
const RECEIPT_DELAY_MS = 15 * 60_000;
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

type Pending = { id: string; user_id: string; title: string; body: string; route: string | null; badge: number | null };
type Ticket = { status: 'ok' | 'error'; id?: string; message?: string; details?: { error?: string } };

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response(null, { status: 405 });
  if (!isServiceCall(req)) return new Response(JSON.stringify({ error: 'forbidden' }), { status: 403 });

  const db = createClient(Deno.env.get('SUPABASE_URL')!, serviceKey(), { auth: { persistSession: false } });

  const headers: Record<string, string> = { 'content-type': 'application/json', accept: 'application/json' };
  const accessToken = Deno.env.get('EXPO_ACCESS_TOKEN');
  if (accessToken) headers.authorization = `Bearer ${accessToken}`;

  const receipts = await checkReceipts(db, headers);

  const { data, error } = await db.rpc('claim_pending_notifications', { max_rows: 500 });
  const pending = (data ?? []) as Pending[];
  if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  if (!pending.length) return Response.json({ sent: 0, skipped: 0, failed: 0, ...receipts });

  const userIds = [...new Set(pending.map((n) => n.user_id))];
  const { data: tokens } = await db.from('push_tokens').select('user_id, expo_token').in('user_id', userIds).is('revoked_at', null);
  const byUser = new Map<string, string[]>();
  for (const t of tokens ?? []) byUser.set(t.user_id, [...(byUser.get(t.user_id) ?? []), t.expo_token]);

  // One message per (notification, device).
  const messages = pending.flatMap((n) =>
    (byUser.get(n.user_id) ?? []).map((to) => ({
      notificationId: n.id,
      to,
      title: n.title,
      body: n.body,
      sound: 'default',
      ...(n.badge != null ? { badge: n.badge } : {}),
      data: { route: n.route, notificationId: n.id },
    })),
  );

  const results = new Map<string, { ok: boolean; error?: string }>();
  const revoke: string[] = [];
  const tickets: { ticket_id: string; expo_token: string }[] = [];

  for (let i = 0; i < messages.length; i += BATCH) {
    const batch = messages.slice(i, i + BATCH);
    let batchTickets: Ticket[] = [];
    try {
      const res = await fetch(EXPO_PUSH_URL, {
        method: 'POST',
        headers,
        body: JSON.stringify(batch.map(({ notificationId: _id, ...m }) => m)),
      });
      batchTickets = ((await res.json()) as { data?: Ticket[] }).data ?? [];
      if (!res.ok && !batchTickets.length) throw new Error(`Expo push ${res.status}`);
    } catch (e) {
      batchTickets = batch.map(() => ({ status: 'error' as const, message: e instanceof Error ? e.message : String(e) }));
    }
    batch.forEach((m, j) => {
      const t = batchTickets[j] ?? { status: 'error', message: 'no ticket' };
      if (t.status === 'ok' && t.id) tickets.push({ ticket_id: t.id, expo_token: m.to });
      if (t.details?.error === 'DeviceNotRegistered') revoke.push(m.to);
      const prev = results.get(m.notificationId);
      // A notification counts as sent if any of the user's devices accepted it.
      if (!prev || (!prev.ok && t.status === 'ok')) results.set(m.notificationId, { ok: t.status === 'ok', error: t.message });
    });
  }

  if (revoke.length) await db.from('push_tokens').update({ revoked_at: new Date().toISOString() }).in('expo_token', revoke);
  if (tickets.length) await db.from('push_receipts').upsert(tickets, { onConflict: 'ticket_id', ignoreDuplicates: true });

  const now = new Date().toISOString();
  const sent = pending.filter((n) => results.get(n.id)?.ok).map((n) => n.id);
  const failed = pending.filter((n) => results.has(n.id) && !results.get(n.id)!.ok);
  const skipped = pending.filter((n) => !results.has(n.id)).map((n) => n.id);

  if (sent.length) await db.from('notifications').update({ push_status: 'sent', pushed_at: now }).in('id', sent);
  if (skipped.length) await db.from('notifications').update({ push_status: 'skipped', pushed_at: now }).in('id', skipped);
  for (const n of failed) {
    await db.from('notifications').update({ push_status: 'failed', pushed_at: now, push_error: results.get(n.id)!.error?.slice(0, 200) ?? null }).eq('id', n.id);
  }

  return Response.json({ sent: sent.length, skipped: skipped.length, failed: failed.length, revoked: revoke.length, ...receipts });
});

type Db = ReturnType<typeof createClient>;

/** Receipts for tickets older than ~15 minutes; DeviceNotRegistered revokes the token. */
async function checkReceipts(db: Db, headers: Record<string, string>): Promise<{ receiptsChecked: number; receiptRevoked: number }> {
  const before = new Date(Date.now() - RECEIPT_DELAY_MS).toISOString();
  const { data } = await db.from('push_receipts').select('ticket_id, expo_token').lt('created_at', before).limit(1000);
  const rows = (data ?? []) as { ticket_id: string; expo_token: string }[];
  if (!rows.length) return { receiptsChecked: 0, receiptRevoked: 0 };
  let receipts: Record<string, { status: 'ok' | 'error'; details?: { error?: string } }> = {};
  try {
    const res = await fetch(EXPO_RECEIPTS_URL, { method: 'POST', headers, body: JSON.stringify({ ids: rows.map((r) => r.ticket_id) }) });
    receipts = ((await res.json()) as { data?: typeof receipts }).data ?? {};
  } catch {
    return { receiptsChecked: 0, receiptRevoked: 0 };  // try again next run
  }
  const dead = rows.filter((r) => receipts[r.ticket_id]?.details?.error === 'DeviceNotRegistered').map((r) => r.expo_token);
  if (dead.length) await db.from('push_tokens').update({ revoked_at: new Date().toISOString() }).in('expo_token', dead);
  await db.from('push_receipts').delete().in('ticket_id', rows.map((r) => r.ticket_id));
  return { receiptsChecked: rows.length, receiptRevoked: dead.length };
}
