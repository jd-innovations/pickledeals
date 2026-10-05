// delete-account (§5, App Store Guideline 5.1.1(v)): permanently deletes the caller's account.
//
// POST { appleAuthorizationCode?: string }  with the user's JWT.
//   200 { deleted: true }
//   409 { error: 'apple_reauth_required' }  user signed in with Apple; re-auth and send the code
//   403 { error: 'apple_account_mismatch' } the code belongs to a different Apple ID
//   502 { error: 'apple_revoke_failed' }    nothing was deleted; safe to retry
//
// Order matters: Apple tokens are revoked first, so a failure leaves the account intact.
// Deleting the auth user cascades to profiles, profiles_private, user_roles, the user's listings and
// the conversations on them; message senders elsewhere become null. Storage doesn't cascade, so the
// user's listing photos and the photos in their listings' threads are removed afterwards
// (best effort: the account is already gone, and failures are logged).
import { createClient } from 'npm:@supabase/supabase-js@2';

import { appleConfig, revokeWithAuthorizationCode } from '../_shared/apple.ts';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'content-type': 'application/json' } });

function serviceKey(): string {
  const keys = JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS') ?? '{}') as Record<string, string>;
  const key = keys.default ?? Object.values(keys)[0] ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!key) throw new Error('missing service key');
  return key;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: cors });
  if (req.method !== 'POST') return json(405, { error: 'method_not_allowed' });

  const jwt = req.headers.get('Authorization')?.replace(/^Bearer\s+/i, '');
  if (!jwt) return json(401, { error: 'unauthorized' });

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, serviceKey(), {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: auth, error: authError } = await admin.auth.getUser(jwt);
  if (authError || !auth.user) return json(401, { error: 'unauthorized' });
  const user = auth.user;

  const body = (await req.json().catch(() => ({}))) as { appleAuthorizationCode?: unknown };
  const code = typeof body.appleAuthorizationCode === 'string' ? body.appleAuthorizationCode : undefined;

  const appleIdentity = user.identities?.find((i) => i.provider === 'apple');
  if (appleIdentity) {
    if (!code) return json(409, { error: 'apple_reauth_required' });
    const cfg = appleConfig();
    if (!cfg) {
      console.error('delete-account: Apple secrets are not configured');
      return json(500, { error: 'apple_not_configured' });
    }
    try {
      const { sub } = await revokeWithAuthorizationCode(cfg, code);
      const expected = appleIdentity.identity_data?.sub ?? appleIdentity.id;
      if (sub !== expected) return json(403, { error: 'apple_account_mismatch' });
    } catch (e) {
      console.error('delete-account: Apple revocation failed', e);
      return json(502, { error: 'apple_revoke_failed' });
    }
  }

  // Threads on the user's listings disappear with them; note them before the cascade.
  const { data: threads } = await admin.from('conversations').select('id').eq('seller_id', user.id);

  const { error: deleteError } = await admin.auth.admin.deleteUser(user.id);
  if (deleteError) {
    console.error('delete-account: deleteUser failed', deleteError);
    return json(500, { error: 'delete_failed' });
  }

  try {
    await removeFolder(admin, 'listing-images', user.id);
    for (const t of threads ?? []) await removeFolder(admin, 'chat-images', t.id);
  } catch (e) {
    console.error('delete-account: storage cleanup failed', user.id, e);
  }

  return json(200, { deleted: true });
});

type Admin = ReturnType<typeof createClient>;

/** Removes every object under `prefix/` (one level of sub-folders deep, which covers both buckets). */
async function removeFolder(admin: Admin, bucket: string, prefix: string): Promise<void> {
  const files: string[] = [];
  const walk = async (path: string, depth: number) => {
    for (let offset = 0; ; offset += 1000) {
      const { data, error } = await admin.storage.from(bucket).list(path, { limit: 1000, offset });
      if (error) throw error;
      for (const item of data) {
        // Folders come back without an id.
        if (item.id) files.push(`${path}/${item.name}`);
        else if (depth > 0) await walk(`${path}/${item.name}`, depth - 1);
      }
      if (data.length < 1000) return;
    }
  };
  await walk(prefix, 1);
  for (let i = 0; i < files.length; i += 100) {
    const { error } = await admin.storage.from(bucket).remove(files.slice(i, i + 100));
    if (error) throw error;
  }
}
