import * as Haptics from 'expo-haptics';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { ActivityIndicator, Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';

import { useTheme } from '@/design/theme';
import { useAuth } from '@/features/auth/authStore';
import { chooseAction } from '@/lib/dialog';
import { Icon, Text } from '@/ui';

import { deleteListingPhoto, pickPhotos, uploadListingPhoto, type PickedPhoto } from '../device';
import { useSellDraft, type DraftPhoto } from '../hooks';
import { SellFrame } from './SellFrame';

const MAX = 10;
const SHOTS: Record<string, string[]> = {
  paddles: ['Face', 'Back', 'Edge guard', 'Grip', 'Any flaws'],
  shoes: ['Pair', 'Soles', 'Inside', 'Size label', 'Any flaws'],
};

/** Step 2 — photos. Each is resized + EXIF-stripped on device and uploaded as soon as it's added. */
export default function SellPhotosStep() {
  const { colors } = useTheme();
  const { width } = useWindowDimensions();
  const uid = useAuth((s) => s.user?.id);
  const { draft, update } = useSellDraft();
  const tile = Math.floor((Math.min(width, 600) - 32 - 16) / 3);
  const photos = draft.photos;
  const uploading = photos.some((p) => p.uploading);
  const done = photos.filter((p) => p.path).length;
  const category = draft.product?.categorySlug ?? draft.custom?.categorySlug ?? '';
  const shots = SHOTS[category] ?? ['Front', 'Back', 'Close-up', 'Any flaws'];

  const patch = (localUri: string, p: Partial<DraftPhoto> | null) =>
    update((d) => ({ photos: p ? d.photos.map((x) => (x.localUri === localUri ? { ...x, ...p } : x)) : d.photos.filter((x) => x.localUri !== localUri) }));

  const upload = async (photo: PickedPhoto) => {
    if (!uid) return;
    try {
      const res = await uploadListingPhoto(uid, draft.id, photo);
      patch(photo.localUri, { path: res.path, width: res.width, height: res.height, uploading: false, error: undefined });
    } catch (e) {
      if (__DEV__) console.warn('Listing photo upload failed', e);
      patch(photo.localUri, { uploading: false, error: 'Upload failed' });
    }
  };

  const add = async (source: 'camera' | 'library') => {
    const picked = await pickPhotos(source, MAX - photos.length);
    if (!picked.length) return;
    Haptics.selectionAsync().catch(() => {});
    update((d) => ({ photos: [...d.photos, ...picked.map((p) => ({ ...p, uploading: true }))] }));
    picked.forEach(upload);
  };

  const manage = (p: DraftPhoto, i: number) =>
    chooseAction(`Photo ${i + 1}`, [
      ...(i > 0 ? [{ text: 'Make cover', onPress: () => update((d) => ({ photos: [p, ...d.photos.filter((x) => x.localUri !== p.localUri)] })) }] : []),
      ...(p.error
        ? [
            {
              text: 'Retry upload',
              onPress: () => {
                patch(p.localUri, { uploading: true, error: undefined });
                upload(p);
              },
            },
          ]
        : []),
      {
        text: 'Remove',
        destructive: true,
        onPress: () => {
          patch(p.localUri, null);
          if (p.path) deleteListingPhoto(p.path).catch(() => {});
        },
      },
    ]);

  return (
    <SellFrame
      step={2}
      title="Add photos"
      subtitle="Up to 10. Tap a photo to make it the cover or remove it."
      ctaDisabled={done === 0 || uploading}
      ctaLoading={uploading && done === 0}
      onContinue={() => router.push('/sell/condition')}
      footer={
        <Text variant="footnote" tone="secondary" align="center" numeric>
          {photos.length === 0
            ? 'Your own photos only — stock catalog photos are never used as your cover'
            : `${done} ${done === 1 ? 'photo' : 'photos'} added${uploading ? ' · uploading…' : ''} · location data is removed`}
        </Text>
      }>
      <View style={styles.grid}>
        {photos.map((p, i) => (
          <Pressable
            key={p.localUri}
            accessibilityRole="button"
            accessibilityLabel={`Photo ${i + 1}${i === 0 ? ', cover' : ''}${p.uploading ? ', uploading' : ''}${p.error ? ', upload failed' : ''}`}
            onPress={() => manage(p, i)}
            style={{ width: tile, height: tile, borderRadius: 14, overflow: 'hidden', backgroundColor: colors.imageTile }}>
            <Image source={{ uri: p.localUri }} contentFit="cover" style={{ flex: 1, opacity: p.uploading ? 0.5 : 1 }} />
            {i === 0 && (
              <View style={[styles.cover, { backgroundColor: colors.interactive }]}>
                <Text variant="badge" style={{ fontSize: 10, color: colors.onInteractive }}>
                  COVER
                </Text>
              </View>
            )}
            {p.uploading && <ActivityIndicator style={StyleSheet.absoluteFill} color={colors.textPrimary} />}
            {p.error && (
              <View style={[styles.retry, { backgroundColor: colors.background }]}>
                <Text variant="badge" style={{ fontSize: 10 }}>
                  RETRY
                </Text>
              </View>
            )}
          </Pressable>
        ))}
        {photos.length < MAX && (
          <>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Take a photo"
              onPress={() => add('camera')}
              style={[styles.add, { width: tile, height: tile, backgroundColor: colors.interactive }]}>
              <Icon name="camera" size={24} color={colors.onInteractive} />
              <Text variant="footnote" weight="700" style={{ color: colors.onInteractive }}>
                Camera
              </Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Choose from library"
              onPress={() => add('library')}
              style={[styles.add, { width: tile, height: tile, borderWidth: 1.5, borderStyle: 'dashed', borderColor: colors.border }]}>
              <Icon name="plus" size={24} color={colors.textSecondary} />
              <Text variant="footnote" weight="700" tone="secondary">
                Library
              </Text>
            </Pressable>
          </>
        )}
      </View>

      <View style={{ gap: 10 }}>
        <Text variant="subhead" weight="700">
          Shots buyers look for
        </Text>
        <View style={styles.wrap}>
          {shots.map((s, i) => {
            const on = i < done;
            return (
              <View key={s} style={[styles.shot, on ? { backgroundColor: colors.interactive } : { borderWidth: 1, borderColor: colors.border }]}>
                {on && <Icon name="check" size={12} color={colors.onInteractive} weight="bold" />}
                <Text variant="footnote" weight="600" style={{ color: on ? colors.onInteractive : colors.textPrimary }}>
                  {s}
                </Text>
              </View>
            );
          })}
        </View>
      </View>
    </SellFrame>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  add: { borderRadius: 14, alignItems: 'center', justifyContent: 'center', gap: 6 },
  cover: { position: 'absolute', left: 6, bottom: 6, paddingHorizontal: 6, paddingVertical: 3, borderRadius: 5 },
  retry: { position: 'absolute', right: 6, top: 6, paddingHorizontal: 6, paddingVertical: 3, borderRadius: 5 },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  shot: { height: 34, paddingHorizontal: 12, borderRadius: 17, flexDirection: 'row', alignItems: 'center', gap: 5 },
});
