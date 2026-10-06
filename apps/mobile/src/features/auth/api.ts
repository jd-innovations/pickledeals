import { publicNameFromParts } from '@pickledeals/shared';
import { FunctionsHttpError } from '@supabase/supabase-js';
import * as AppleAuthentication from 'expo-apple-authentication';
import * as Crypto from 'expo-crypto';
import { Platform } from 'react-native';

import { fetchProfile, updateDisplayName } from '@/features/profile/api';
import { requireSupabase } from '@/lib/supabase';

import { useAuth } from './authStore';
import { forgetGoogle, googleCredential, googleSignInConfigured } from './google';

export class AuthCanceled extends Error {}

export async function isAppleSignInAvailable(): Promise<boolean> {
  return Platform.OS === 'ios' && AppleAuthentication.isAvailableAsync();
}

async function appleCredential(scopes: AppleAuthentication.AppleAuthenticationScope[], nonce?: string) {
  try {
    return await AppleAuthentication.signInAsync({ requestedScopes: scopes, nonce });
  } catch (e) {
    if ((e as { code?: string }).code === 'ERR_REQUEST_CANCELED') throw new AuthCanceled();
    throw e;
  }
}

/** Native Sign in with Apple → Supabase session. Apple's name (first sign-in only) becomes the public name. */
export async function signInWithApple(): Promise<void> {
  // Apple receives the SHA-256 of the nonce; Supabase verifies the raw value against the token.
  const rawNonce = Crypto.randomUUID();
  const hashedNonce = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, rawNonce);
  const credential = await appleCredential(
    [AppleAuthentication.AppleAuthenticationScope.FULL_NAME, AppleAuthentication.AppleAuthenticationScope.EMAIL],
    hashedNonce,
  );
  if (!credential.identityToken) throw new Error('Apple did not return an identity token.');

  const { data, error } = await requireSupabase().auth.signInWithIdToken({
    provider: 'apple',
    token: credential.identityToken,
    nonce: rawNonce,
  });
  if (error) throw error;

  const appleName = publicNameFromParts(credential.fullName?.givenName, credential.fullName?.familyName);
  let profile = await fetchProfile(data.user.id);
  if (appleName && profile.nameSource === 'generated') profile = await updateDisplayName(data.user.id, appleName);
  useAuth.getState().setProfile(profile);
}

export const isGoogleSignInAvailable = () => googleSignInConfigured;

/** Native Sign in with Google → Supabase session. Google's name becomes the public name if none was chosen. */
export async function signInWithGoogle(): Promise<void> {
  const credential = await googleCredential();
  if (!credential) throw new AuthCanceled();
  const { data, error } = await requireSupabase().auth.signInWithIdToken({ provider: 'google', token: credential.idToken });
  if (error) throw error;

  const googleName = publicNameFromParts(credential.givenName, credential.familyName);
  let profile = await fetchProfile(data.user.id);
  if (googleName && profile.nameSource === 'generated') profile = await updateDisplayName(data.user.id, googleName);
  useAuth.getState().setProfile(profile);
}

export async function sendEmailCode(email: string): Promise<void> {
  const { error } = await requireSupabase().auth.signInWithOtp({ email: email.trim(), options: { shouldCreateUser: true } });
  if (error) throw error;
}

export async function verifyEmailCode(email: string, code: string): Promise<void> {
  const { data, error } = await requireSupabase().auth.verifyOtp({ email: email.trim(), token: code, type: 'email' });
  if (error) throw error;
  if (data.user) useAuth.getState().setProfile(await fetchProfile(data.user.id));
}

export async function signOut(): Promise<void> {
  const { error } = await requireSupabase().auth.signOut();
  if (error) throw error;
  await forgetGoogle();
}

/**
 * Permanently deletes the account (§5). Apple accounts re-authenticate first so the server can
 * revoke the Apple token, as App Store review requires. Google access is revoked on the device.
 */
export async function deleteAccount(): Promise<void> {
  const client = requireSupabase();
  const usesApple = useAuth.getState().user?.providers.includes('apple') ?? false;

  let appleAuthorizationCode: string | undefined;
  if (usesApple) {
    if (!(await isAppleSignInAvailable())) throw new Error('Open PickleDeals on your iPhone to delete an account that uses Sign in with Apple.');
    const credential = await appleCredential([]);
    appleAuthorizationCode = credential.authorizationCode ?? undefined;
    if (!appleAuthorizationCode) throw new Error('Apple did not return an authorization code.');
  }

  const { error } = await client.functions.invoke('delete-account', { body: { appleAuthorizationCode } });
  if (error) {
    const code = error instanceof FunctionsHttpError ? ((await error.context.json().catch(() => ({}))) as { error?: string }).error : undefined;
    throw new Error(DELETE_ERRORS[code ?? ''] ?? 'We couldn’t delete your account. Nothing was removed — please try again.');
  }
  // The server session is gone; clear the local one, and the app's Google grant if it had one.
  await client.auth.signOut({ scope: 'local' });
  await forgetGoogle(true);
}

const DELETE_ERRORS: Record<string, string> = {
  apple_account_mismatch: 'That Apple ID doesn’t match this account. Sign in with the Apple ID you used for PickleDeals.',
  apple_revoke_failed: 'Apple couldn’t confirm the request. Nothing was removed — please try again.',
};

/** User-facing copy for Supabase Auth errors. */
export function authErrorMessage(error: unknown): string {
  const code = (error as { code?: string }).code;
  switch (code) {
    case 'otp_expired':
      return 'That code is wrong or has expired. Check the latest email or send a new code.';
    case 'over_email_send_rate_limit':
    case 'over_request_rate_limit':
      return 'Too many attempts. Wait a minute and try again.';
    case 'email_address_invalid':
    case 'validation_failed':
      return 'Enter a valid email address.';
    default:
      return error instanceof Error && error.message ? error.message : 'Something went wrong. Please try again.';
  }
}
