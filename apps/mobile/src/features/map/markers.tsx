import { memo } from 'react';
import { View } from 'react-native';

import { ProductImage, type ImageSource } from '@/commerce';
import { useTheme } from '@/design/theme';
import { Text } from '@/ui';

/** Price pin (design: MarketMap). Selected pins become the solid pill with a thumbnail and stem (MapPreview). */
export const PriceMarker = memo(function PriceMarker({ label, selected, image }: { label: string; selected?: boolean; image?: ImageSource }) {
  const { colors } = useTheme();
  if (selected) {
    return (
      <View style={{ alignItems: 'center' }} accessibilityLabel={`${label}, selected`}>
        <View
          style={{
            height: 44,
            paddingLeft: image ? 5 : 14,
            paddingRight: 14,
            borderRadius: 22,
            backgroundColor: colors.interactive,
            flexDirection: 'row',
            alignItems: 'center',
            gap: 8,
            boxShadow: colors.shadow,
          }}>
          {image && <ProductImage source={image} width={34} round={17} padding={2} />}
          <Text variant="headline" weight="700" numeric style={{ color: colors.onInteractive }}>
            {label}
          </Text>
        </View>
        <View style={{ width: 2, height: 10, backgroundColor: colors.interactive }} />
      </View>
    );
  }
  return (
    <View
      accessibilityLabel={label}
      style={{
        height: 30,
        paddingHorizontal: 10,
        borderRadius: 15,
        backgroundColor: colors.surfaceElevated,
        borderWidth: 0.5,
        borderColor: colors.border,
        justifyContent: 'center',
        boxShadow: colors.shadow,
      }}>
      <Text variant="footnote" weight="700" numeric>
        {label}
      </Text>
    </View>
  );
});

export const ClusterMarker = memo(function ClusterMarker({ count }: { count: number }) {
  const { colors } = useTheme();
  const size = count >= 100 ? 52 : 44;
  return (
    <View
      accessibilityLabel={`${count} listings`}
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: colors.interactive,
        borderWidth: 3,
        borderColor: colors.surfaceElevated,
        alignItems: 'center',
        justifyContent: 'center',
        boxShadow: colors.shadow,
      }}>
      <Text variant="subhead" weight="700" numeric style={{ color: colors.onInteractive }}>
        {count}
      </Text>
    </View>
  );
});
