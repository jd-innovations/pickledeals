import { useQuery } from '@tanstack/react-query';
import * as Crypto from 'expo-crypto';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';

import { useAuth } from '@/features/auth/authStore';
import { requireSupabase } from '@/lib/supabase';

/**
 * Profile photos (owner decisions Oct 11: optional, initials otherwise, pulled from Google
 * automatically). Files live at avatars/{uid}/{uuid}.jpg: square, 512 px, re-encoded to JPEG on the
 * phone, which strips EXIF and GPS. The server (set_avatar / remove_avatar) returns the previous file,
 * which is deleted here.
 */

const SIZE = 512;

export const avatarUrl = (path: string | null | undefined): string | null =>
  path ? requireSupabase().storage.from('avatars').getPublicUrl(path).data.publicUrl : null;

async function uploadAvatar(uid: string, body: ArrayBuffer): Promise<string> {
  const path = `${uid}/${Crypto.randomUUID()}.jpg`;
  const { error } = await requireSupabase().storage.from('avatars').upload(path, body, { contentType: 'image/jpeg', cacheControl: '31536000' });
  if (error) throw error;
  return path;
}

async function deleteAvatarFile(path: string | null) {
  if (path) await requireSupabase().storage.from('avatars').remove([path]).catch(() => {});
}

async function apply(path: string, source: 'upload' | 'google') {
  const { data: previous, error } = await requireSupabase().rpc('set_avatar', { path, source });
  if (error) {
    await deleteAvatarFile(path);
    throw error;
  }
  // The server hands back whichever file is now unused: the old photo, or this one when it declined it.
  await deleteAvatarFile(previous);
  await useAuth.getState().refreshProfile();
}

/** Take or choose a photo, crop it square, and make it the profile photo. False when cancelled. */
export async function changeAvatar(source: 'camera' | 'library'): Promise<boolean> {
  const uid = useAuth.getState().user?.id;
  if (!uid) return false;
  const options: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], allowsEditing: true, aspect: [1, 1], quality: 1, exif: false };
  let result: ImagePicker.ImagePickerResult;
  if (source === 'camera') {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) return false;
    result = await ImagePicker.launchCameraAsync(options);
  } else {
    result = await ImagePicker.launchImageLibraryAsync(options);
  }
  const asset = result.canceled ? null : result.assets[0];
  if (!asset) return false;

  // The editor crops to a square; centre-crop anyway in case a platform skips it.
  const edge = Math.min(asset.width, asset.height);
  const ctx = ImageManipulator.manipulate(asset.uri);
  if (asset.width !== asset.height) ctx.crop({ originX: (asset.width - edge) / 2, originY: (asset.height - edge) / 2, width: edge, height: edge });
  ctx.resize({ width: Math.min(SIZE, edge) });
  const saved = await (await ctx.renderAsync()).saveAsync({ compress: 0.82, format: SaveFormat.JPEG });
  const path = await uploadAvatar(uid, await (await fetch(saved.uri)).arrayBuffer());
  await apply(path, 'upload');
  return true;
}

export async function removeAvatar(): Promise<void> {
  const { data: previous, error } = await requireSupabase().rpc('remove_avatar');
  if (error) throw error;
  await deleteAvatarFile(previous);
  await useAuth.getState().refreshProfile();
}

/**
 * After Sign in with Google: use the Google account photo when the person has none, hasn't removed
 * one before, and Google's photo isn't the generic placeholder. Best effort; never blocks sign-in.
 */
export async function pullGoogleAvatar(photoUrl: string | null | undefined): Promise<void> {
  const { user, profile } = useAuth.getState();
  if (!user || !photoUrl || profile?.avatarPath) return;
  try {
    // Google photo URLs take a size suffix (=s96-c); ask for a 512 px square JPEG.
    const url = /=s\d+(-c)?$/.test(photoUrl) ? photoUrl.replace(/=s\d+(-c)?$/, `=s${SIZE}-c`) : photoUrl;
    const res = await fetch(url, { headers: { accept: 'image/jpeg' } });
    if (!res.ok || !(res.headers.get('content-type') ?? '').includes('jpeg')) return;
    const path = await uploadAvatar(user.id, await res.arrayBuffer());
    await apply(path, 'google');
  } catch {
    // The person can always add a photo themselves from Profile.
  }
}

/** Someone else's photo (sellers, people you message): one small read, cached for 10 minutes. */
export function useAvatarUrl(userId: string | null | undefined): string | null {
  const own = useAuth((s) => (s.user?.id && s.user.id === userId ? (s.profile?.avatarPath ?? null) : undefined));
  const { data } = useQuery({
    queryKey: ['avatar', userId],
    enabled: !!userId && own === undefined,
    staleTime: 10 * 60_000,
    queryFn: async () => {
      const { data: row, error } = await requireSupabase().from('profiles').select('avatar_path').eq('id', userId!).maybeSingle();
      if (error) throw error;
      return row?.avatar_path ?? null;
    },
  });
  return avatarUrl(own !== undefined ? own : data);
}
