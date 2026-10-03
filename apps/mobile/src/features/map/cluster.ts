import { regionZoom, type LatLng, type MapRegion } from '@pickledeals/shared';
import { useMemo } from 'react';
import Supercluster from 'supercluster';

/** One listing (or several in one ~1 km cell) to draw. `point` is always a public cell centre (D2). */
export type MapPin = { id: string; point: LatLng; label: string };

export type MapFeature =
  | { kind: 'pin'; key: string; pin: MapPin }
  | { kind: 'cluster'; key: string; clusterId: number; count: number; point: LatLng; ids: string[]; sameCell: boolean };

type Props = { id: string };

/**
 * Client-side clustering (D4) over the bounded result set (≤ 500 rows). The index is rebuilt only
 * when the pins change; panning just re-queries it, which is cheap. Listings sharing a cell have
 * identical points, so they always stay one cluster (`sameCell`) — tapping it lists them instead
 * of zooming forever.
 */
export function useClusters(pins: MapPin[], region: MapRegion | null, widthPx: number, selectedId: string | null = null) {
  // The selected listing is drawn on its own, above any cluster it would otherwise join.
  const index = useMemo(() => {
    const sc = new Supercluster<Props, Props>({ radius: 56, maxZoom: 22, minPoints: 2 });
    sc.load(pins.filter((p) => p.id !== selectedId).map((p) => ({ type: 'Feature', properties: { id: p.id }, geometry: { type: 'Point', coordinates: [p.point.lng, p.point.lat] } })));
    return sc;
  }, [pins, selectedId]);
  const byId = useMemo(() => new Map(pins.map((p) => [p.id, p])), [pins]);

  const features = useMemo<MapFeature[]>(() => {
    if (!region || pins.length === 0) return [];
    // Query a little past the edges so pins don't pop in at the border while panning.
    const padLng = region.longitudeDelta * 0.6;
    const padLat = region.latitudeDelta * 0.6;
    const bbox: [number, number, number, number] = [
      Math.max(region.longitude - padLng, -180),
      Math.max(region.latitude - padLat, -85),
      Math.min(region.longitude + padLng, 180),
      Math.min(region.latitude + padLat, 85),
    ];
    const selected = selectedId ? byId.get(selectedId) : undefined;
    const clustered = index.getClusters(bbox, regionZoom(region, widthPx)).map((f): MapFeature => {
      const [lng, lat] = f.geometry.coordinates;
      if ('cluster' in f.properties && f.properties.cluster) {
        const leaves = index.getLeaves(f.properties.cluster_id, Infinity).map((l) => l.properties.id);
        const first = byId.get(leaves[0]!)!.point;
        const sameCell = leaves.every((id) => {
          const p = byId.get(id)!.point;
          return p.lat === first.lat && p.lng === first.lng;
        });
        return { kind: 'cluster', key: `c${f.properties.cluster_id}`, clusterId: f.properties.cluster_id, count: f.properties.point_count, point: { lat: lat!, lng: lng! }, ids: leaves, sameCell };
      }
      const pin = byId.get((f.properties as Props).id)!;
      return { kind: 'pin', key: pin.id, pin };
    });
    return selected ? [...clustered, { kind: 'pin', key: selected.id, pin: selected }] : clustered;
  }, [index, byId, region, widthPx, pins.length, selectedId]);

  /** Region that splits a cluster apart. */
  const expansionRegion = (clusterId: number, at: LatLng, current: MapRegion): MapRegion => {
    const zoom = Math.min(index.getClusterExpansionZoom(clusterId), 18);
    const factor = 2 ** (regionZoom(current, widthPx) - zoom);
    return { latitude: at.lat, longitude: at.lng, latitudeDelta: current.latitudeDelta * factor, longitudeDelta: current.longitudeDelta * factor };
  };

  return { features, expansionRegion };
}
