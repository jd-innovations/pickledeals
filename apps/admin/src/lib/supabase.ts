import type { Database } from '@pickledeals/shared';
import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

if (!url || !key) throw new Error('Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in apps/admin/.env.local');

/** Admin uses the same anon key as the app: staff powers come only from the JWT app_role claim + RLS. */
export const supabase = createClient<Database>(url, key);

export const publicUrl = (bucket: 'catalog' | 'brand-logos', path: string) => supabase.storage.from(bucket).getPublicUrl(path).data.publicUrl;
