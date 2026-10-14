import { APPROX_AREA_RADIUS_M, regionAround } from '@pickledeals/shared';
import { View } from 'react-native';
import MapView, { Circle } from 'react-native-maps';

import { useTheme } from '@/design/theme';

import { AreaLabel } from './AreaLabel';
import type { AreaMapProps } from './types';

/**
 * "Approximate area" map (listing detail, sell Details, the full-screen area map). Draws a ~1 km
 * circle around the public cell centre and never a pin — there is no exact point to show (D2).
 * Fixed by default; `interactive` lets people pan and zoom around it.
 */
export function AreaMap({ center, height, label, labelStyle = 'badge', areaName, interactive, fill }: AreaMapProps) {
  const { scheme, colors } = useTheme();
  const region = regionAround(center, APPROX_AREA_RADIUS_M * (interactive ? 6 : 2.6));
  return (
    <View
      style={fill ? { flex: 1 } : { height }}
      pointerEvents={interactive ? 'auto' : 'none'}
      accessible={!interactive}
      accessibilityLabel={areaName ? `Map of the approximate area around ${areaName}` : 'Map of the approximate area'}>
      <MapView
        style={{ flex: 1 }}
        {...(interactive ? { initialRegion: region } : { region })}
        mapType="mutedStandard"
        userInterfaceStyle={scheme}
        showsPointsOfInterests={!!interactive}
        scrollEnabled={!!interactive}
        zoomEnabled={!!interactive}
        pitchEnabled={false}
        rotateEnabled={false}
        toolbarEnabled={false}>
        <Circle center={{ latitude: center.lat, longitude: center.lng }} radius={APPROX_AREA_RADIUS_M} fillColor={colors.mapArea} strokeColor={colors.textTertiary} strokeWidth={1.5} lineDashPattern={[6, 4]} />
      </MapView>
      {label && <AreaLabel label={label} strong={labelStyle === 'title'} />}
    </View>
  );
}
