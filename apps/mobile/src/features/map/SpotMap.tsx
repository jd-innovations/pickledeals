import { regionAround } from '@pickledeals/shared';
import { View } from 'react-native';
import MapView, { Marker } from 'react-native-maps';

import { useTheme } from '@/design/theme';

import type { SpotMapProps } from './types';

/**
 * A meet-up spot shared in chat. Unlike listing areas this is an exact point, which is fine: it
 * lives only in a private message between the two participants (D2, §8).
 */
export function SpotMap({ point, height }: SpotMapProps) {
  const { scheme, colors } = useTheme();
  return (
    <View style={{ height }} pointerEvents="none">
      <MapView
        style={{ flex: 1 }}
        region={regionAround(point, 450)}
        mapType="mutedStandard"
        userInterfaceStyle={scheme}
        showsPointsOfInterests={false}
        scrollEnabled={false}
        zoomEnabled={false}
        pitchEnabled={false}
        rotateEnabled={false}
        toolbarEnabled={false}>
        <Marker coordinate={{ latitude: point.lat, longitude: point.lng }} tracksViewChanges={false}>
          <SpotDot color={colors.interactive} ring={colors.surfaceElevated} />
        </Marker>
      </MapView>
    </View>
  );
}

export function SpotDot({ color, ring }: { color: string; ring: string }) {
  return <View style={{ width: 26, height: 26, borderRadius: 13, backgroundColor: color, borderWidth: 3, borderColor: ring }} />;
}
