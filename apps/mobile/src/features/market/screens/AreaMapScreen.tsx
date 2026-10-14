import { router, useLocalSearchParams } from 'expo-router';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTheme } from '@/design/theme';
import { AreaMap } from '@/features/map';
import { Button, IconButton, Skeleton, Text } from '@/ui';

import { formatDistance } from '../components';
import { useAreaDistance, useListing, useMarket } from '../hooks';

/**
 * Full-screen approximate-area map (opened from a listing's map). Pan and zoom around the ~1 km circle
 * to see where it is; there's still no pin, address or directions (D2): the meet-up spot is agreed in
 * chat. "See nearby listings" opens the marketplace map on the same area with this listing selected.
 */
export default function AreaMapScreen() {
  const { id = '' } = useLocalSearchParams<{ id: string }>();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { data: l } = useListing(id);
  const feedItem = useMarket({ ids: [id], statuses: ['active', 'pending', 'sold'], radiusM: null, limit: 1 }, !!id).data?.items[0];
  const distance = formatDistance(useAreaDistance(l?.areaCenter, feedItem?.distanceM));

  const seeNearby = () => {
    if (!l?.areaCenter) return;
    router.back();
    router.push({ pathname: '/market/map', params: { lat: String(l.areaCenter.lat), lng: String(l.areaCenter.lng), focus: l.id } });
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.mapLand }}>
      {l?.areaCenter ? (
        <AreaMap center={l.areaCenter} height={0} fill interactive areaName={l.areaLabel} />
      ) : (
        <View style={{ flex: 1, padding: 20, paddingTop: insets.top + 80 }}>
          <Skeleton height={200} />
        </View>
      )}

      <View style={{ position: 'absolute', left: 16, right: 16, top: insets.top + 8, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <IconButton icon="close" label="Close map" tone="glass" size={44} onPress={() => router.back()} />
        <View
          style={{ flex: 1, minHeight: 44, borderRadius: 22, paddingHorizontal: 14, paddingVertical: 6, justifyContent: 'center', backgroundColor: colors.glass, borderWidth: 0.5, borderColor: colors.border, boxShadow: colors.shadow }}>
          <Text variant="subhead" weight="700" numberOfLines={1}>
            {l?.areaLabel ?? 'Approximate area'}
          </Text>
          <Text variant="caption" weight="400" tone="secondary" numberOfLines={1} numeric>
            {[distance ? `${distance} away` : null, 'area shown to about 1 km'].filter(Boolean).join(' · ')}
          </Text>
        </View>
      </View>

      <View
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: 0,
          paddingTop: 14,
          paddingHorizontal: 16,
          paddingBottom: insets.bottom + 12,
          gap: 10,
          borderTopLeftRadius: 28,
          borderTopRightRadius: 28,
          backgroundColor: colors.glass,
          borderTopWidth: 0.5,
          borderColor: colors.border,
        }}>
        <Text variant="footnote" tone="secondary" align="center">
          Sellers share the exact meet-up spot privately in chat.
        </Text>
        <Button label="See nearby listings" icon="map" iconPosition="leading" fullWidth disabled={!l?.areaCenter} onPress={seeNearby} />
      </View>
    </View>
  );
}
