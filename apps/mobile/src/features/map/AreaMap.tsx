import { APPROX_AREA_RADIUS_M, regionAround } from '@pickledeals/shared';
import { View } from 'react-native';
import MapView, { Circle } from 'react-native-maps';

import { useTheme } from '@/design/theme';

import { AreaLabel } from './AreaLabel';
import type { AreaMapProps } from './types';

/**
 * Static "approximate area" map (listing detail, sell Details). Draws a ~1 km circle around the
 * public cell centre and never a pin — there is no exact point to show (D2).
 */
export function AreaMap({ center, height, label, labelStyle = 'badge', areaName }: AreaMapProps) {
  const { scheme, colors } = useTheme();
  return (
    <View style={{ height }} pointerEvents="none" accessible accessibilityLabel={areaName ? `Map of the approximate area around ${areaName}` : 'Map of the approximate area'}>
      <MapView
        style={{ flex: 1 }}
        region={regionAround(center, APPROX_AREA_RADIUS_M * 2.6)}
        mapType="mutedStandard"
        userInterfaceStyle={scheme}
        showsPointsOfInterests={false}
        scrollEnabled={false}
        zoomEnabled={false}
        pitchEnabled={false}
        rotateEnabled={false}
        toolbarEnabled={false}>
        <Circle center={{ latitude: center.lat, longitude: center.lng }} radius={APPROX_AREA_RADIUS_M} fillColor={colors.mapArea} strokeColor={colors.textTertiary} strokeWidth={1.5} lineDashPattern={[6, 4]} />
      </MapView>
      {label && <AreaLabel label={label} strong={labelStyle === 'title'} />}
    </View>
  );
}
