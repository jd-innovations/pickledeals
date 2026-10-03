import { APPROX_AREA_RADIUS_M, type MapRegion } from '@pickledeals/shared';
import { useImperativeHandle, useRef, useState } from 'react';
import { Pressable, StyleSheet, View, type LayoutChangeEvent } from 'react-native';

import { useTheme } from '@/design/theme';
import { IconButton, Text } from '@/ui';

import { useClusters } from './cluster';
import { ClusterMarker, PriceMarker } from './markers';
import type { ListingMapProps } from './types';

const M_PER_DEG_LAT = 111_320;

/**
 * Web stand-in for the D4 adapter. react-native-maps has no web build, so the browser preview gets
 * a plain pannable canvas (drag to pan, +/− to zoom) that exercises the same pins, clustering,
 * selection and viewport callbacks. It is not a real map; the native file renders Apple Maps.
 */
export function ListingMap({ ref, initialRegion, pins, selectedId, selectedImage, onRegionChange, onSelectPin, onSelectCell, onPressMap, bottomInset = 0 }: ListingMapProps) {
  const { colors } = useTheme();
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [region, setRegion] = useState<MapRegion>(initialRegion);
  const [drag, setDrag] = useState({ dx: 0, dy: 0 });
  const { features, expansionRegion } = useClusters(pins, size.w ? region : null, size.w || 390, selectedId);
  const selected = selectedId ? pins.find((p) => p.id === selectedId) : undefined;

  const settle = (r: MapRegion) => {
    setRegion(r);
    onRegionChange(r);
  };
  useImperativeHandle(ref, () => ({ animateTo: settle }));

  // Drag to pan (pointer events; handlers read the latest render's region directly).
  const start = useRef<{ x: number; y: number } | null>(null);
  const onPointerDown = (e: { nativeEvent: { clientX: number; clientY: number } }) => {
    start.current = { x: e.nativeEvent.clientX, y: e.nativeEvent.clientY };
  };
  const onPointerMove = (e: { nativeEvent: { clientX: number; clientY: number } }) => {
    if (start.current) setDrag({ dx: e.nativeEvent.clientX - start.current.x, dy: e.nativeEvent.clientY - start.current.y });
  };
  const onPointerUp = () => {
    start.current = null;
    if (Math.abs(drag.dx) + Math.abs(drag.dy) < 4) return setDrag({ dx: 0, dy: 0 });
    setDrag({ dx: 0, dy: 0 });
    settle({ ...region, longitude: region.longitude - (drag.dx / size.w) * region.longitudeDelta, latitude: region.latitude + (drag.dy / size.h) * region.latitudeDelta });
  };

  const toXY = (lat: number, lng: number) => ({
    x: ((lng - (region.longitude - region.longitudeDelta / 2)) / region.longitudeDelta) * size.w + drag.dx,
    y: ((region.latitude + region.latitudeDelta / 2 - lat) / region.latitudeDelta) * size.h + drag.dy,
  });
  const zoom = (f: number) => settle({ ...region, latitudeDelta: region.latitudeDelta * f, longitudeDelta: region.longitudeDelta * f });

  // Faint graticule so panning visibly moves something.
  const step = 10 ** Math.ceil(Math.log10(region.longitudeDelta / 4));
  const lines: { key: string; x?: number; y?: number }[] = [];
  if (size.w) {
    for (let lng = Math.ceil((region.longitude - region.longitudeDelta) / step) * step; lng < region.longitude + region.longitudeDelta; lng += step) lines.push({ key: `x${lng.toFixed(6)}`, x: toXY(0, lng).x });
    for (let lat = Math.ceil((region.latitude - region.latitudeDelta) / step) * step; lat < region.latitude + region.latitudeDelta; lat += step) lines.push({ key: `y${lat.toFixed(6)}`, y: toXY(lat, 0).y });
  }

  const at = (lat: number, lng: number, anchorBottom = false) => {
    const { x, y } = toXY(lat, lng);
    return { position: 'absolute' as const, left: x, top: y, width: 0, height: 0, overflow: 'visible' as const, alignItems: 'center' as const, justifyContent: anchorBottom ? ('flex-end' as const) : ('center' as const) };
  };

  return (
    <View
      style={{ flex: 1, overflow: 'hidden', backgroundColor: colors.mapLand }}
      onLayout={(e: LayoutChangeEvent) => setSize({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerLeave={onPointerUp}>
      <Pressable accessibilityLabel="Map" style={StyleSheet.absoluteFill} onPress={onPressMap}>
        {lines.map((l) => (
          <View key={l.key} style={l.x != null ? { position: 'absolute', left: l.x, top: 0, bottom: 0, width: 2, backgroundColor: colors.mapRoad } : { position: 'absolute', top: l.y, left: 0, right: 0, height: 2, backgroundColor: colors.mapRoad }} />
        ))}
      </Pressable>
      {size.w > 0 && selected && (
        <View pointerEvents="none" style={at(selected.point.lat, selected.point.lng)}>
          <View
            style={{
              width: ((APPROX_AREA_RADIUS_M * 2) / (region.latitudeDelta * M_PER_DEG_LAT)) * size.h,
              aspectRatio: 1,
              borderRadius: 999,
              backgroundColor: colors.mapArea,
              borderWidth: 1.5,
              borderStyle: 'dashed',
              borderColor: colors.textTertiary,
            }}
          />
        </View>
      )}
      {size.w > 0 &&
        features.map((f) =>
          f.kind === 'cluster' ? (
            <View key={f.key} style={at(f.point.lat, f.point.lng)}>
              <Pressable accessibilityRole="button" onPress={() => (f.sameCell ? onSelectCell(f.ids) : settle(expansionRegion(f.clusterId, f.point, region)))}>
                <ClusterMarker count={f.count} />
              </Pressable>
            </View>
          ) : (
            <View key={f.key} style={[at(f.pin.point.lat, f.pin.point.lng, f.pin.id === selectedId), { zIndex: f.pin.id === selectedId ? 10 : 1 }]}>
              <Pressable accessibilityRole="button" onPress={() => onSelectPin(f.pin.id)}>
                <PriceMarker label={f.pin.label} selected={f.pin.id === selectedId} image={f.pin.id === selectedId ? selectedImage : undefined} />
              </Pressable>
            </View>
          ),
        )}
      <View style={{ position: 'absolute', right: 20, bottom: bottomInset + 60, gap: 8 }}>
        <IconButton icon="plus" label="Zoom in" tone="glass" size={36} onPress={() => zoom(0.5)} />
        <IconButton icon="minus" label="Zoom out" tone="glass" size={36} onPress={() => zoom(2)} />
      </View>
      <Text variant="caption" tone="tertiary" style={{ position: 'absolute', left: 16, bottom: bottomInset + 8 }}>
        Web preview — Apple Maps on iOS
      </Text>
    </View>
  );
}
