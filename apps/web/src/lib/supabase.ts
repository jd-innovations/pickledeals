import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@pickledeals/shared';

import { SUPABASE_URL } from './urls';

/**
 * Read-only access with the publishable key: the website only ever sees what RLS shows a signed-out
 * visitor (D6), the same rows the app shows before sign-in.
 */
const KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '';

let client: SupabaseClient<Database> | null = null;

export function db(): SupabaseClient<Database> {
  if (!SUPABASE_URL || !KEY) throw new Error('Supabase URL and publishable key are not configured');
  client ??= createClient<Database>(SUPABASE_URL, KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  return client;
}
