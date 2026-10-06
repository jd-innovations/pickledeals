/** Web preview: Google's native sheet isn't available, so the button is hidden. */
export const googleSignInConfigured = false;

export type GoogleCredential = { idToken: string; givenName: string | null; familyName: string | null };

export async function googleCredential(): Promise<GoogleCredential | null> {
  throw new Error('Sign in with Google is available in the iOS app.');
}

export async function forgetGoogle(): Promise<void> {}
