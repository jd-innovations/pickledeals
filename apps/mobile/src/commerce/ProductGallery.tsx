import { radius } from '@pickledeals/shared';
import { useState, type ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, useWindowDimensions, View, type NativeScrollEvent, type NativeSyntheticEvent } from 'react-native';

import { useTheme } from '@/design/theme';
import { Text } from '@/ui';
import { PhotoViewer, photoIndex } from './PhotoViewer';
import { ProductImage, type ImageSource } from './ProductImage';

/**
 * Product hero: one image, or a swipeable set with a "2 / 12" counter, in the same pattern as a
 * listing's photo gallery. The tile keeps the design's rounded hero shape and side margins.
 * Tapping a photo opens it full screen (PhotoViewer).
 */
export function ProductGallery({
  images,
  inset = 16,
  aspectRatio = 1,
  padding = 36,
  fit,
}: {
  images: ImageSource[];
  inset?: number;
  aspectRatio?: number;
  padding?: number;
  fit?: 'cover' | 'contain';
}) {
  const { colors } = useTheme();
  const { width: screen } = useWindowDimensions();
  const [page, setPage] = useState(0);
  const [open, setOpen] = useState<number | null>(null);
  const width = screen - inset * 2;
  const count = images.length;
  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => setPage(Math.round(e.nativeEvent.contentOffset.x / width));

  const tile = (src: ImageSource, i: number, el: ReactNode) =>
    src.kind === 'remote' ? (
      <Pressable key={i} accessibilityRole="button" accessibilityLabel={count > 1 ? `Open photo ${i + 1} of ${count}` : 'Open photo'} onPress={() => setOpen(photoIndex(images, src))}>
        {el}
      </Pressable>
    ) : (
      <View key={i}>{el}</View>
    );

  const viewer = <PhotoViewer images={images} index={open ?? 0} visible={open !== null} onClose={() => setOpen(null)} />;

  if (count <= 1)
    return (
      <>
        {tile(images[0]!, 0, <ProductImage source={images[0]!} round={radius.hero} aspectRatio={aspectRatio} padding={padding} fit={fit} />)}
        {viewer}
      </>
    );
  return (
    <View style={{ width, aspectRatio, borderRadius: radius.hero, overflow: 'hidden' }}>
      <ScrollView
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={onScroll}
        scrollEventThrottle={16}
        accessibilityLabel={`Photos, ${page + 1} of ${count}`}>
        {images.map((src, i) => tile(src, i, <ProductImage source={src} width={width} aspectRatio={aspectRatio} round={0} padding={padding} fit={fit} />))}
      </ScrollView>
      <View style={[styles.counter, { backgroundColor: colors.background }]} pointerEvents="none">
        <Text variant="caption" weight="700" numeric>
          {page + 1} / {count}
        </Text>
      </View>
      {viewer}
    </View>
  );
}

const styles = StyleSheet.create({
  counter: { position: 'absolute', right: 12, bottom: 12, paddingHorizontal: 8, paddingVertical: 5, borderRadius: 10 },
});
