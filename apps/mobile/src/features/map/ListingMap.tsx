import { APPROX_AREA_RADIUS_M, type MapRegion } from '@pickledeals/shared';
import { useImperativeHandle, useRef, useState } from 'react';
import { useWindowDimensions } from 'react-native';
import MapView, { Circle, Marker } from 'react-native-maps';

import { useTheme } from '@/design/theme';

import { useClusters } from './cluster';
import { ClusterMarker, PriceMarker } from './markers';
import type { ListingMapProps } from './types';

/**
 * D4 adapter: Apple Maps via react-native-maps. `mutedStandard` + the app's light/dark scheme is the
 * closest native match to the monochrome design. Everything provider-specific stays in this file
 * (and its .web twin); screens only see ListingMapProps.
 */
export function ListingMap({ ref, initialRegion, pins, selectedId, selectedImage, showsUser, onRegionChange, onSelectPin, onSelectCell, onPressMap, bottomInset = 0, topInset = 0 }: ListingMapProps) {
  const { scheme, colors } = useTheme();
  const { width } = useWindowDimensions();
  const map = useRef<MapView>(null);
  const [region, setRegion] = useState<MapRegion>(initialRegion);
  const { features, expansionRegion } = useClusters(pins, region, width, selectedId);
  const selected = selectedId ? pins.find((p) => p.id === selectedId) : undefined;

  useImperativeHandle(ref, () => ({ animateTo: (r: MapRegion) => map.current?.animateToRegion(r, 350) }), []);

  return (
    <MapView
      ref={map}
      style={{ flex: 1 }}
      initialRegion={initialRegion}
      mapType="mutedStandard"
      userInterfaceStyle={scheme}
      showsPointsOfInterests={false}
      showsUserLocation={showsUser}
      showsMyLocationButton={false}
      showsCompass={false}
      pitchEnabled={false}
      rotateEnabled={false}
      mapPadding={{ top: topInset, bottom: bottomInset, left: 0, right: 0 }}
      onPress={(e) => {
        // Marker taps also bubble a map press on iOS; only clear on a press on the map itself.
        if (e.nativeEvent.action !== 'marker-press') onPressMap();
      }}
      onRegionChangeComplete={(r) => {
        setRegion(r);
        onRegionChange(r);
      }}>
      {selected && (
        <Circle center={{ latitude: selected.point.lat, longitude: selected.point.lng }} radius={APPROX_AREA_RADIUS_M} fillColor={colors.mapArea} strokeColor={colors.textTertiary} strokeWidth={1.5} lineDashPattern={[6, 4]} />
      )}
      {features.map((f) =>
        f.kind === 'cluster' ? (
          <Marker
            key={f.key}
            coordinate={{ latitude: f.point.lat, longitude: f.point.lng }}
            tracksViewChanges={false}
            onPress={() => (f.sameCell ? onSelectCell(f.ids) : map.current?.animateToRegion(expansionRegion(f.clusterId, f.point, region), 350))}>
            <ClusterMarker count={f.count} />
          </Marker>
        ) : (
          <Marker
            // Remount when selection changes so the snapshot updates while tracksViewChanges stays off.
            key={`${f.key}:${f.pin.id === selectedId ? 's' : 'n'}`}
            coordinate={{ latitude: f.pin.point.lat, longitude: f.pin.point.lng }}
            anchor={f.pin.id === selectedId ? { x: 0.5, y: 1 } : { x: 0.5, y: 0.5 }}
            zIndex={f.pin.id === selectedId ? 10 : 1}
            tracksViewChanges={f.pin.id === selectedId}
            onPress={() => onSelectPin(f.pin.id)}>
            <PriceMarker label={f.pin.label} selected={f.pin.id === selectedId} image={f.pin.id === selectedId ? selectedImage : undefined} />
          </Marker>
        ),
      )}
    </MapView>
  );
}
