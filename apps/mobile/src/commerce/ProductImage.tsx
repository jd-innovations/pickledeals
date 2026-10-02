import { radius } from '@pickledeals/shared';
import { Image } from 'expo-image';
import type { ReactNode } from 'react';
import { View, type DimensionValue, type ViewStyle } from 'react-native';

import { useTheme } from '@/design/theme';
import { PlaceholderArt, type PlaceholderKind } from '@/dev/PlaceholderArt';

export type ImageSource =
  | { kind: 'remote'; uri: string; isCutout: boolean; blurhash?: string; alt: string }
  | { kind: 'placeholder'; art: PlaceholderKind; c1: string; c2: string; alt: string };

/**
 * Product photography is the colour of the app. Cutouts (transparent assets, preferred) sit on the
 * neutral imageTile token with padding; full photographs (with their own background) fill the tile.
 * D8: both are supported, decided per image by `isCutout`.
 */
export function ProductImage({
  source,
  width = '100%',
  aspectRatio = 1,
  round = radius.tile,
  padding,
  children,
  style,
}: {
  source: ImageSource;
  width?: DimensionValue;
  aspectRatio?: number;
  round?: number;
  padding?: number;
  children?: ReactNode;
  style?: ViewStyle;
}) {
  const { colors } = useTheme();
  const cutout = source.kind === 'placeholder' || source.isCutout;
  const inset = cutout ? (padding ?? 14) : 0;

  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel={source.alt}
      style={[{ width, aspectRatio, borderRadius: round, backgroundColor: colors.imageTile, overflow: 'hidden' }, style]}>
      <View style={{ flex: 1, padding: inset }}>
        {source.kind === 'placeholder' ? (
          <PlaceholderArt kind={source.art} c1={source.c1} c2={source.c2} />
        ) : (
          <Image
            source={{ uri: source.uri }}
            placeholder={source.blurhash ? { blurhash: source.blurhash } : undefined}
            contentFit={cutout ? 'contain' : 'cover'}
            transition={150}
            style={{ flex: 1 }}
          />
        )}
      </View>
      {children}
    </View>
  );
}
