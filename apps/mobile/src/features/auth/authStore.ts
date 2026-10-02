import type { AuthIntent } from '@pickledeals/shared';
import { router } from 'expo-router';
import { create } from 'zustand';

/**
 * D6: browsing never requires an account. Identity-dependent actions call `requireAuth(intent, run)`.
 * Guests get the native auth sheet; after signing in, the original action resumes automatically.
 * Phase 1 replaces `user` with the Supabase session; the intent flow stays the same.
 */
type PendingIntent = { intent: AuthIntent; run: () => void };

type AuthState = {
  user: { id: string; displayName: string } | null;
  pending: PendingIntent | null;
  requireAuth: (intent: AuthIntent, run: () => void) => void;
  completeSignIn: (user: { id: string; displayName: string }) => void;
  cancel: () => void;
  signOut: () => void;
};

export const useAuth = create<AuthState>((set, get) => ({
  user: null,
  pending: null,
  requireAuth: (intent, run) => {
    if (get().user) return run();
    set({ pending: { intent, run } });
    router.push({ pathname: '/sign-in', params: { intent } });
  },
  completeSignIn: (user) => {
    const pending = get().pending;
    set({ user, pending: null });
    if (router.canGoBack()) router.back();
    // Let the sheet finish dismissing before resuming, so navigation from the intent lands correctly.
    if (pending) setTimeout(pending.run, 350);
  },
  cancel: () => set({ pending: null }),
  signOut: () => set({ user: null }),
}));

export const INTENT_COPY: Record<AuthIntent, string> = {
  save_product: 'Sign in to save products and get price-drop alerts.',
  save_deal: 'Sign in to save deals.',
  save_listing: 'Sign in to save listings.',
  create_price_alert: 'Sign in to get notified when the price drops.',
  follow_brand: 'Sign in to follow brands.',
  message_seller: 'Sign in to message the seller.',
  make_offer: 'Sign in to make an offer.',
  create_listing: 'Sign in to sell your gear. Listing is free.',
  manage_listings: 'Sign in to manage your listings.',
};
