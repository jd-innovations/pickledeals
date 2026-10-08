import { requiresPublicName, TERMS_VERSION, type AuthIntent } from '@pickledeals/shared';
import type { User } from '@supabase/supabase-js';
import { router } from 'expo-router';
import { create } from 'zustand';

import { fetchProfile, type MyProfile } from '@/features/profile/api';
import { queryClient } from '@/lib/queryClient';
import { supabase } from '@/lib/supabase';

/**
 * D6: browsing never requires an account. Identity-dependent actions call `requireAuth(intent, run)`.
 * Guests get the native auth sheet; after signing in, the original action resumes automatically.
 * Intents that show the user's name to others (list, message, offer) first ask for a public name
 * if the account still has its generated "Player 1234" name.
 */
type PendingIntent = { intent: AuthIntent; run: () => void };

export type AuthUser = { id: string; email: string | null; providers: string[] };

type AuthState = {
  /** False until the persisted session has been read on launch. */
  ready: boolean;
  user: AuthUser | null;
  profile: MyProfile | null;
  pending: PendingIntent | null;
  requireAuth: (intent: AuthIntent, run: () => void) => void;
  /** Called by the sign-in sheet once a session exists. */
  resumeAfterSignIn: () => void;
  /** Called by the display-name sheet after saving. */
  resumeAfterProfile: () => void;
  resumeAfterTerms: () => void;
  cancel: () => void;
  refreshProfile: () => Promise<MyProfile | null>;
  setProfile: (profile: MyProfile) => void;
};

const needsPublicName = (intent: AuthIntent, profile: MyProfile | null) => requiresPublicName(intent) && profile?.nameSource !== 'provided';
/** Posting intents need the current Terms accepted (Guideline 1.2), after the public name. */
export const needsTerms = (intent: AuthIntent, profile: MyProfile | null) => requiresPublicName(intent) && profile?.termsVersion !== TERMS_VERSION;

function finish(pending: PendingIntent | null) {
  if (router.canGoBack()) router.back();
  // Let the sheet finish dismissing before resuming, so navigation from the intent lands correctly.
  if (pending) setTimeout(pending.run, 350);
}

export const useAuth = create<AuthState>((set, get) => ({
  ready: false,
  user: null,
  profile: null,
  pending: null,
  requireAuth: (intent, run) => {
    const { user, profile } = get();
    if (!user) {
      set({ pending: { intent, run } });
      router.push({ pathname: '/sign-in', params: { intent } });
    } else if (needsPublicName(intent, profile)) {
      set({ pending: { intent, run } });
      router.push({ pathname: '/display-name', params: { intent } });
    } else if (needsTerms(intent, profile)) {
      set({ pending: { intent, run } });
      router.push({ pathname: '/terms-agree', params: { intent } });
    } else {
      run();
    }
  },
  resumeAfterSignIn: () => {
    const { pending, profile } = get();
    if (pending && needsPublicName(pending.intent, profile)) {
      router.replace({ pathname: '/display-name', params: { intent: pending.intent } });
      return;
    }
    if (pending && needsTerms(pending.intent, profile)) {
      router.replace({ pathname: '/terms-agree', params: { intent: pending.intent } });
      return;
    }
    set({ pending: null });
    finish(pending);
  },
  resumeAfterProfile: () => {
    const { pending, profile } = get();
    if (pending && needsTerms(pending.intent, profile)) {
      router.replace({ pathname: '/terms-agree', params: { intent: pending.intent } });
      return;
    }
    set({ pending: null });
    finish(pending);
  },
  resumeAfterTerms: () => {
    const { pending } = get();
    set({ pending: null });
    finish(pending);
  },
  cancel: () => set({ pending: null }),
  refreshProfile: async () => {
    const user = get().user;
    if (!user) return null;
    try {
      const profile = await fetchProfile(user.id);
      // Ignore a late response for a user who has since signed out.
      if (get().user?.id === user.id) set({ profile });
      return profile;
    } catch (e) {
      // No profile row: the account was deleted elsewhere. Confirm with the server, then drop the
      // stale local session instead of showing a signed-in shell with no identity.
      if ((e as { code?: string }).code === 'PGRST116' && supabase) {
        const { error } = await supabase.auth.getUser();
        if (error) await supabase.auth.signOut({ scope: 'local' });
      }
      throw e;
    }
  },
  // Keeps the known terms version when an update returns the public profile only.
  setProfile: (profile) => set({ profile: { ...profile, termsVersion: profile.termsVersion ?? get().profile?.termsVersion ?? null } }),
}));

function toAuthUser(user: User): AuthUser {
  const providers = (user.app_metadata.providers as string[] | undefined) ?? [user.app_metadata.provider ?? 'email'];
  return { id: user.id, email: user.email ?? null, providers };
}

/** Mirrors the Supabase session into the store. Call once from the root layout. */
export function startAuthListener(): () => void {
  if (!supabase) {
    useAuth.setState({ ready: true });
    return () => {};
  }
  const { data } = supabase.auth.onAuthStateChange((event, session) => {
    const user = session ? toAuthUser(session.user) : null;
    const previous = useAuth.getState().user;
    useAuth.setState({
      ready: true,
      user: user && previous?.id === user.id && previous.email === user.email ? previous : user,
      ...(user ? null : { profile: null, pending: null }),
    });
    if (event === 'SIGNED_OUT') queryClient.clear();
    if (user && (event === 'INITIAL_SESSION' || event === 'SIGNED_IN')) {
      // supabase-js deadlocks if another auth call is awaited inside this callback; defer it.
      // Sign-in flows load the profile themselves, so skip it when it is already there.
      setTimeout(() => {
        const state = useAuth.getState();
        if (state.profile?.id !== user.id) state.refreshProfile().catch(() => {});
      }, 0);
    }
  });
  return () => data.subscription.unsubscribe();
}

export const INTENT_COPY: Record<AuthIntent, string> = {
  save_product: 'Sign in to save products and get price-drop alerts.',
  save_deal: 'Sign in to save deals.',
  save_listing: 'Sign in to save listings.',
  create_price_alert: 'Sign in to get notified when the price drops.',
  follow_brand: 'Sign in to follow brands and hear about their new deals.',
  save_search: 'Sign in to save this search and get new matching deals.',
  message_seller: 'Sign in to message the seller.',
  make_offer: 'Sign in to make an offer.',
  create_listing: 'Sign in to sell your gear. Listing is free.',
  manage_listings: 'Sign in to manage your listings.',
  report: 'Sign in to report this, so we can follow up.',
  view_saved: 'Sign in to see the deals, products and listings you’ve saved.',
  view_messages: 'Sign in to see your messages with buyers and sellers.',
};
