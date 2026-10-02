import type { Session } from '@supabase/supabase-js';
import { useEffect, useState } from 'react';

import { supabase } from './supabase';

export type StaffRole = 'admin' | 'editor';

/** The app_role claim set by custom_access_token_hook. UI gating only — RLS is the real check. */
export function roleOf(session: Session | null): StaffRole | 'user' | null {
  if (!session) return null;
  try {
    const payload = JSON.parse(atob(session.access_token.split('.')[1]!.replace(/-/g, '+').replace(/_/g, '/')));
    return payload.app_role === 'admin' || payload.app_role === 'editor' ? payload.app_role : 'user';
  } catch {
    return 'user';
  }
}

export function useSession() {
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const { data } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
      setReady(true);
    });
    return () => data.subscription.unsubscribe();
  }, []);
  return { session, ready, role: roleOf(session) };
}
