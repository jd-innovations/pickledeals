// Sign in with Apple REST helpers (token exchange + revocation) used by delete-account.
// Apple requires apps that offer Sign in with Apple to revoke the user's tokens when the account
// is deleted. We don't store Apple refresh tokens: the app re-authenticates with Apple at deletion
// time and sends a fresh authorization code, which we exchange and immediately revoke.
import { decodeJwt, importPKCS8, SignJWT } from 'npm:jose@6';

const APPLE = 'https://appleid.apple.com';

type AppleConfig = { teamId: string; keyId: string; clientId: string; privateKey: string };

export function appleConfig(): AppleConfig | null {
  const teamId = Deno.env.get('APPLE_TEAM_ID');
  const keyId = Deno.env.get('APPLE_KEY_ID');
  const clientId = Deno.env.get('APPLE_CLIENT_ID');
  const privateKey = Deno.env.get('APPLE_PRIVATE_KEY')?.replace(/\\n/g, '\n');
  if (!teamId || !keyId || !clientId || !privateKey) return null;
  return { teamId, keyId, clientId, privateKey };
}

/** ES256 client secret JWT, as described in Apple's "Creating a client secret". */
async function clientSecret(cfg: AppleConfig): Promise<string> {
  const key = await importPKCS8(cfg.privateKey, 'ES256');
  return new SignJWT({})
    .setProtectedHeader({ alg: 'ES256', kid: cfg.keyId })
    .setIssuer(cfg.teamId)
    .setSubject(cfg.clientId)
    .setAudience(APPLE)
    .setIssuedAt()
    .setExpirationTime('5m')
    .sign(key);
}

async function post(path: string, body: Record<string, string>) {
  return fetch(`${APPLE}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(body),
  });
}

/**
 * Exchanges a fresh authorization code and revokes the resulting token.
 * Returns the Apple user id (`sub`) the code belonged to, so the caller can check it matches.
 */
export async function revokeWithAuthorizationCode(cfg: AppleConfig, code: string): Promise<{ sub: string }> {
  const secret = await clientSecret(cfg);

  const tokenRes = await post('/auth/token', {
    client_id: cfg.clientId,
    client_secret: secret,
    code,
    grant_type: 'authorization_code',
  });
  if (!tokenRes.ok) throw new Error(`apple_token_exchange_failed:${tokenRes.status}`);
  const tokens = (await tokenRes.json()) as { refresh_token?: string; access_token?: string; id_token: string };

  // The id_token came straight from Apple over TLS in response to our authenticated request.
  const sub = decodeJwt(tokens.id_token).sub;
  if (!sub) throw new Error('apple_token_missing_sub');

  const token = tokens.refresh_token ?? tokens.access_token;
  if (!token) throw new Error('apple_token_missing');
  const revokeRes = await post('/auth/revoke', {
    client_id: cfg.clientId,
    client_secret: secret,
    token,
    token_type_hint: tokens.refresh_token ? 'refresh_token' : 'access_token',
  });
  if (!revokeRes.ok) throw new Error(`apple_revoke_failed:${revokeRes.status}`);

  return { sub };
}
