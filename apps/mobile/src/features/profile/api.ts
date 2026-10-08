import { normalizeDisplayName } from '@pickledeals/shared';

import { requireSupabase } from '@/lib/supabase';

export type MyProfile = {
  id: string;
  displayName: string;
  /** 'generated' = auto-assigned "Player 1234"; marketplace intents need 'provided'. */
  nameSource: 'generated' | 'provided';
  memberSince: string;
  areaLabel: string | null;
  /** Terms of Use version the user agreed to (null: not yet). */
  termsVersion?: string | null;
};

type ProfileRow = {
  id: string;
  display_name: string;
  display_name_source: MyProfile['nameSource'];
  member_since: string;
  area_label: string | null;
};

const COLUMNS = 'id, display_name, display_name_source, member_since, area_label';

const toProfile = (row: ProfileRow): MyProfile => ({
  id: row.id,
  displayName: row.display_name,
  nameSource: row.display_name_source,
  memberSince: row.member_since,
  areaLabel: row.area_label,
});

export async function fetchProfile(userId: string): Promise<MyProfile> {
  const client = requireSupabase();
  const [{ data, error }, terms] = await Promise.all([
    client.from('profiles').select(COLUMNS).eq('id', userId).single<ProfileRow>(),
    client.from('profiles_private').select('terms_version').eq('user_id', userId).maybeSingle(),
  ]);
  if (error) throw error;
  return { ...toProfile(data), termsVersion: terms.data?.terms_version ?? null };
}

export async function acceptTerms(version: string): Promise<void> {
  const { error } = await requireSupabase().rpc('accept_terms', { version });
  if (error) throw error;
}

export async function updateDisplayName(userId: string, name: string): Promise<MyProfile> {
  const { data, error } = await requireSupabase()
    .from('profiles')
    .update({ display_name: normalizeDisplayName(name) })
    .eq('id', userId)
    .select(COLUMNS)
    .single<ProfileRow>();
  if (error) throw error;
  return toProfile(data);
}
