// delete-account (§5, App Store Guideline 5.1.1(v)): permanently deletes the caller's account.
//
// POST { appleAuthorizationCode?: string }  with the user's JWT.
//   200 { deleted: true }
//   409 { error: 'apple_reauth_required' }  user signed in with Apple; re-auth and send the code
//   403 { error: 'apple_account_mismatch' } the code belongs to a different Apple ID
//   502 { error: 'apple_revoke_failed' }    nothing was deleted; safe to retry
//
// Order matters: Apple tokens are revoked first, so a failure leaves the account intact.
// Deleting the auth user cascades to profiles, profiles_private and user_roles. Later phases add
// their cleanup here (listing images in storage, anonymizing message senders).
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

  const { error: deleteError } = await admin.auth.admin.deleteUser(user.id);
  if (deleteError) {
    console.error('delete-account: deleteUser failed', deleteError);
    return json(500, { error: 'delete_failed' });
  }

  return json(200, { deleted: true });
});
