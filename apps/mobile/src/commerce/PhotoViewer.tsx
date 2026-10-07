import { Image } from 'expo-image';
import { useRef, useState } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  useWindowDimensions,
  View,
  type GestureResponderEvent,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTheme } from '@/design/theme';
import { IconButton, Text } from '@/ui';
import type { ImageSource } from './ProductImage';

const MAX_ZOOM = 4;
const DOUBLE_TAP_ZOOM = 2.5;
const DOUBLE_TAP_MS = 260;
/** Pull an unzoomed photo down this far (pt) and let go to close. */
const PULL_TO_CLOSE = 90;

/**
 * Full-screen photos: swipe between them, pinch or double-tap to zoom (iOS native ScrollView zoom,
 * the Photos-app feel), close with ✕ or by pulling an unzoomed photo down. Product and listing
 * galleries open it on the photo that was tapped.
 */
/** Index among the openable (remote) photos, for opening the viewer on the one that was tapped. */
export const photoIndex = (images: ImageSource[], src: ImageSource) => images.filter((s) => s.kind === 'remote').indexOf(src as Extract<ImageSource, { kind: 'remote' }>);

export function PhotoViewer({
  images,
  index,
  visible,
  onClose,
}: {
  images: ImageSource[];
  index: number;
  visible: boolean;
  onClose: () => void;
}) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const [page, setPage] = useState(index);
  const [zoomed, setZoomed] = useState(false);
  const pager = useRef<ScrollView>(null);
  const photos = images.filter((s) => s.kind === 'remote');

  const onPage = (e: NativeSyntheticEvent<NativeScrollEvent>) => setPage(Math.round(e.nativeEvent.contentOffset.x / width));

  return (
    <Modal visible={visible} animationType="fade" presentationStyle="fullScreen" onRequestClose={onClose} onShow={() => {
        setPage(index);
        setZoomed(false);
      }}>
      <View style={{ flex: 1, backgroundColor: colors.background }}>
        <ScrollView
          ref={pager}
          horizontal
          pagingEnabled
          scrollEnabled={!zoomed}
          showsHorizontalScrollIndicator={false}
          contentOffset={{ x: index * width, y: 0 }}
          onLayout={() => pager.current?.scrollTo({ x: index * width, animated: false })}
          onMomentumScrollEnd={onPage}
          accessibilityLabel={`Photo ${page + 1} of ${photos.length}`}>
          {photos.map((src, i) => (
            <ZoomablePhoto key={i} source={src} width={width} height={height} onZoomChange={setZoomed} onPullClose={onClose} />
          ))}
        </ScrollView>

        <View style={[styles.bar, { top: insets.top + 8 }]} pointerEvents="box-none">
          <IconButton icon="close" label="Close" tone="glass" onPress={onClose} />
          {photos.length > 1 && (
            <View style={[styles.counter, { backgroundColor: colors.glass }]} pointerEvents="none">
              <Text variant="caption" weight="700" numeric>
                {page + 1} / {photos.length}
              </Text>
            </View>
          )}
        </View>
      </View>
    </Modal>
  );
}

function ZoomablePhoto({
  source,
  width,
  height,
  onZoomChange,
  onPullClose,
}: {
  source: ImageSource;
  width: number;
  height: number;
  onZoomChange: (zoomed: boolean) => void;
  onPullClose: () => void;
}) {
  const ref = useRef<ScrollView>(null);
  const scale = useRef(1);
  const lastTap = useRef(0);

  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const z = e.nativeEvent.zoomScale ?? 1;
    if ((z > 1.01) !== (scale.current > 1.01)) onZoomChange(z > 1.01);
    scale.current = z;
  };

  const onTap = (e: GestureResponderEvent) => {
    const now = Date.now();
    if (now - lastTap.current > DOUBLE_TAP_MS) {
      lastTap.current = now;
      return;
    }
    lastTap.current = 0;
    if (scale.current > 1.01) {
      ref.current?.scrollResponderZoomTo({ x: 0, y: 0, width, height, animated: true });
    } else {
      const { locationX, locationY } = e.nativeEvent;
      const w = width / DOUBLE_TAP_ZOOM;
      const h = height / DOUBLE_TAP_ZOOM;
      ref.current?.scrollResponderZoomTo({ x: locationX - w / 2, y: locationY - h / 2, width: w, height: h, animated: true });
    }
  };

  if (source.kind !== 'remote') return null;
  return (
    <ScrollView
      ref={ref}
      style={{ width, height }}
      contentContainerStyle={{ width, height }}
      minimumZoomScale={1}
      maximumZoomScale={MAX_ZOOM}
      bouncesZoom
      centerContent
      alwaysBounceVertical
      showsHorizontalScrollIndicator={false}
      showsVerticalScrollIndicator={false}
      scrollEventThrottle={16}
      onScroll={onScroll}
      onScrollEndDrag={(e) => {
        if (scale.current <= 1.01 && e.nativeEvent.contentOffset.y < -PULL_TO_CLOSE) onPullClose();
      }}>
      <Pressable onPress={onTap} accessibilityRole="image" accessibilityLabel={source.alt} accessibilityHint="Pinch or double-tap to zoom">
        <Image source={{ uri: source.uri }} placeholder={source.blurhash ? { blurhash: source.blurhash } : undefined} contentFit="contain" style={{ width, height }} />
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  bar: { position: 'absolute', left: 16, right: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  counter: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 10 },
});
