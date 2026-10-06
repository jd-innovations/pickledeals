import { radius } from '@pickledeals/shared';
import { useState } from 'react';
import { ScrollView, StyleSheet, useWindowDimensions, View, type NativeScrollEvent, type NativeSyntheticEvent } from 'react-native';

import { useTheme } from '@/design/theme';
import { Text } from '@/ui';
import { ProductImage, type ImageSource } from './ProductImage';

/**
 * Product hero: one image, or a swipeable set with a "2 / 12" counter, in the same pattern as a
 * listing's photo gallery. The tile keeps the design's rounded hero shape and side margins.
 */
export function ProductGallery({ images, inset = 16 }: { images: ImageSource[]; inset?: number }) {
  const { colors } = useTheme();
  const { width: screen } = useWindowDimensions();
  const [page, setPage] = useState(0);
  const width = screen - inset * 2;
  if (images.length <= 1) return <ProductImage source={images[0]!} round={radius.hero} padding={36} />;
  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => setPage(Math.round(e.nativeEvent.contentOffset.x / width));
  return (
    <View style={{ width, aspectRatio: 1, borderRadius: radius.hero, overflow: 'hidden' }}>
      <ScrollView
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={onScroll}
        scrollEventThrottle={16}
        accessibilityLabel={`Photos, ${page + 1} of ${images.length}`}>
        {images.map((src, i) => (
          <ProductImage key={i} source={src} width={width} round={0} padding={36} />
        ))}
      </ScrollView>
      <View style={[styles.counter, { backgroundColor: colors.background }]} pointerEvents="none">
        <Text variant="caption" weight="700" numeric>
          {page + 1} / {images.length}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  counter: { position: 'absolute', right: 12, bottom: 12, paddingHorizontal: 8, paddingVertical: 5, borderRadius: 10 },
});
