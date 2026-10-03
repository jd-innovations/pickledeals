import * as Crypto from 'expo-crypto';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import { Platform } from 'react-native';

import { requireSupabase } from '@/lib/supabase';

/**
 * Device helpers for the marketplace.
 * - Location: we only ever need ~1 km, so we ask for Low accuracy; the server snaps it anyway (D2).
 * - Photos: resized to 2048 px and re-encoded to JPEG 0.8, which drops EXIF — including GPS — before
 *   anything leaves the phone (§6: a privacy requirement, not an optimisation).
 */

export type DeviceArea = { lat: number; lng: number; label: string | null; postalCode: string | null };

export async function getDeviceArea(): Promise<DeviceArea | 'denied'> {
  const { status } = await Location.requestForegroundPermissionsAsync();
  if (status !== 'granted') return 'denied';
  const pos = (await Location.getLastKnownPositionAsync({ maxAge: 15 * 60_000 })) ?? (await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Low }));
  const { latitude: lat, longitude: lng } = pos.coords;
  let label: string | null = null;
  let postalCode: string | null = null;
  if (Platform.OS !== 'web') {
    const [place] = await Location.reverseGeocodeAsync({ latitude: lat, longitude: lng }).catch(() => []);
    if (place) {
      label = [place.city ?? place.subregion ?? place.district, place.region].filter(Boolean).join(', ') || null;
      postalCode = place.postalCode ?? null;
    }
  }
  return { lat, lng, label, postalCode };
}

/** "34236" or "Sarasota, FL" → a point (native geocoder; not available on web). */
export async function geocodeArea(query: string): Promise<DeviceArea | null> {
  if (Platform.OS === 'web') return null;
  const [hit] = await Location.geocodeAsync(query).catch(() => []);
  if (!hit) return null;
  const [place] = await Location.reverseGeocodeAsync({ latitude: hit.latitude, longitude: hit.longitude }).catch(() => []);
  const label = place ? [place.city ?? place.subregion, place.region].filter(Boolean).join(', ') : query;
  return { lat: hit.latitude, lng: hit.longitude, label: label || query, postalCode: place?.postalCode ?? (/^\d{5}$/.test(query) ? query : null) };
}

export type PickedPhoto = { localUri: string; width: number; height: number };

export async function pickPhotos(source: 'library' | 'camera', remaining: number): Promise<PickedPhoto[]> {
  if (remaining <= 0) return [];
  const options: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], quality: 1, exif: false };
  let result: ImagePicker.ImagePickerResult;
  if (source === 'camera') {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) return [];
    result = await ImagePicker.launchCameraAsync(options);
  } else {
    result = await ImagePicker.launchImageLibraryAsync({ ...options, allowsMultipleSelection: true, selectionLimit: remaining, orderedSelection: true });
  }
  if (result.canceled) return [];
  return result.assets.slice(0, remaining).map((a) => ({ localUri: a.uri, width: a.width, height: a.height }));
}

const MAX_EDGE = 2048;

/** Resize + re-encode (strips EXIF/GPS) and upload to listing-images/{uid}/{listingId}/{uuid}.jpg. */
export async function uploadListingPhoto(uid: string, listingId: string, photo: PickedPhoto): Promise<{ path: string; width: number; height: number }> {
  const ctx = ImageManipulator.manipulate(photo.localUri);
  if (Math.max(photo.width, photo.height) > MAX_EDGE) {
    // Pass only the constrained edge; the other follows the aspect ratio (explicit nulls break on web).
    ctx.resize(photo.width >= photo.height ? { width: MAX_EDGE } : { height: MAX_EDGE });
  }
  const rendered = await ctx.renderAsync();
  const saved = await rendered.saveAsync({ compress: 0.8, format: SaveFormat.JPEG });

  const body = await (await fetch(saved.uri)).arrayBuffer();
  const path = `${uid}/${listingId}/${Crypto.randomUUID()}.jpg`;
  const { error } = await requireSupabase().storage.from('listing-images').upload(path, body, { contentType: 'image/jpeg', cacheControl: '31536000' });
  if (error) throw error;
  return { path, width: saved.width, height: saved.height };
}

export async function deleteListingPhoto(path: string) {
  await requireSupabase().storage.from('listing-images').remove([path]);
}
