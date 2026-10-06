import { GoogleSignin, isCancelledResponse, isErrorWithCode, isSuccessResponse, statusCodes } from '@react-native-google-signin/google-signin';

/**
 * Native Sign in with Google (iOS system sheet). Client IDs are public values from the build env:
 * EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID (the token's audience Supabase checks) and
 * EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID. Without both, Google sign-in is hidden.
 */
const webClientId = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID?.trim();
const iosClientId = process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID?.trim();

export const googleSignInConfigured = !!(webClientId && iosClientId);

let configured = false;
function configure() {
  if (configured) return;
  GoogleSignin.configure({ webClientId, iosClientId });
  configured = true;
}

export type GoogleCredential = { idToken: string; givenName: string | null; familyName: string | null };

/** Shows Google's sheet. Returns null when the user cancels. */
export async function googleCredential(): Promise<GoogleCredential | null> {
  configure();
  try {
    const response = await GoogleSignin.signIn();
    if (isCancelledResponse(response)) return null;
    if (!isSuccessResponse(response) || !response.data.idToken) throw new Error('Google did not return an identity token.');
    return { idToken: response.data.idToken, givenName: response.data.user.givenName, familyName: response.data.user.familyName };
  } catch (e) {
    if (isErrorWithCode(e) && (e.code === statusCodes.SIGN_IN_CANCELLED || e.code === statusCodes.IN_PROGRESS)) return null;
    throw e;
  }
}

/** Forget the device's Google session (sign out), and also the app's grant (account deletion). */
export async function forgetGoogle(revoke = false): Promise<void> {
  if (!googleSignInConfigured) return;
  configure();
  try {
    if (revoke) await GoogleSignin.revokeAccess();
    await GoogleSignin.signOut();
  } catch {
    // Best effort: the PickleDeals session is what matters, and it's cleared separately.
  }
}
