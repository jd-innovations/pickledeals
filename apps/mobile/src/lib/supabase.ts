import type { Database } from '@pickledeals/shared';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { AppState, Platform } from 'react-native';

import { encryptedSessionStorage } from './secureStorage';

const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
export type Supabase = SupabaseClient<Database>;

/** Expo web pre-renders routes in Node; sessions only exist in a real client. */
const isServerRender = Platform.OS === 'web' && typeof window === 'undefined';

/**
 * Null until environment variables are configured (and during web pre-rendering), so the app still
 * boots for design-system work. Native sessions are encrypted at rest (see secureStorage); web uses
 * supabase-js's localStorage.
 */
export const supabase: Supabase | null =
  url && anonKey && !isServerRender
    ? createClient<Database>(url, anonKey, {
        auth: {
          storage: Platform.OS === 'web' ? undefined : encryptedSessionStorage,
          autoRefreshToken: true,
          persistSession: true,
          detectSessionInUrl: false,
        },
      })
    : null;

export function requireSupabase(): Supabase {
  if (!supabase) throw new Error('Supabase is not configured. Set EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY.');
  return supabase;
}

// Refresh tokens only while the app is in the foreground (supabase-js React Native guidance).
if (supabase && Platform.OS !== 'web') {
  AppState.addEventListener('change', (state) => {
    if (state === 'active') supabase.auth.startAutoRefresh();
    else supabase.auth.stopAutoRefresh();
  });
}
