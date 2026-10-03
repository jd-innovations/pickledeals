/**
 * Map geometry shared by the app and tests (Phase 7). D2: everything public is a geohash-6 cell
 * centre; these helpers let the client draw the same cell the server snaps to, without ever
 * needing a finer point.
 */

export type LatLng = { lat: number; lng: number };
/** react-native-maps region shape. */
export type MapRegion = { latitude: number; longitude: number; latitudeDelta: number; longitudeDelta: number };
export type Bounds = { minLng: number; minLat: number; maxLng: number; maxLat: number };

const BASE32 = '0123456789bcdefghjkmnpqrstuvwxyz';

/** Standard geohash (matches PostGIS ST_GeoHash). */
export function geohashEncode(lat: number, lng: number, precision = 6): string {
  let latLo = -90;
  let latHi = 90;
  let lngLo = -180;
  let lngHi = 180;
  let hash = '';
  let bits = 0;
  let ch = 0;
  let even = true;
  while (hash.length < precision) {
    if (even) {
      const mid = (lngLo + lngHi) / 2;
      if (lng >= mid) {
        ch = (ch << 1) | 1;
        lngLo = mid;
      } else {
        ch <<= 1;
        lngHi = mid;
      }
    } else {
      const mid = (latLo + latHi) / 2;
      if (lat >= mid) {
        ch = (ch << 1) | 1;
        latLo = mid;
      } else {
        ch <<= 1;
        latHi = mid;
      }
    }
    even = !even;
    if (++bits === 5) {
      hash += BASE32[ch];
      bits = 0;
      ch = 0;
    }
  }
  return hash;
}

/** Centre of a geohash cell (matches PostGIS ST_PointFromGeoHash). */
export function geohashCenter(hash: string): LatLng {
  let latLo = -90;
  let latHi = 90;
  let lngLo = -180;
  let lngHi = 180;
  let even = true;
  for (const c of hash.toLowerCase()) {
    const v = BASE32.indexOf(c);
    if (v < 0) throw new Error(`invalid geohash: ${hash}`);
    for (let b = 4; b >= 0; b--) {
      const bit = (v >> b) & 1;
      if (even) {
        const mid = (lngLo + lngHi) / 2;
        if (bit) lngLo = mid;
        else lngHi = mid;
      } else {
        const mid = (latLo + latHi) / 2;
        if (bit) latLo = mid;
        else latHi = mid;
      }
      even = !even;
    }
  }
  return { lat: (latLo + latHi) / 2, lng: (lngLo + lngHi) / 2 };
}

/** The public (~1 km) point a listing at this location will get — what buyers will see. */
export const snapToCell = (lat: number, lng: number): LatLng => geohashCenter(geohashEncode(lat, lng, 6));

/** Radius (m) of the "approximate area" circle drawn around a cell centre: covers a ~1.2 × 0.6 km cell. */
export const APPROX_AREA_RADIUS_M = 800;

const M_PER_DEG_LAT = 111_320;

/** A region that fits a circle of `radiusM` around `center`. */
export function regionAround(center: LatLng, radiusM: number): MapRegion {
  const latDelta = (radiusM * 2) / M_PER_DEG_LAT;
  const lngDelta = latDelta / Math.max(Math.cos((center.lat * Math.PI) / 180), 0.01);
  return { latitude: center.lat, longitude: center.lng, latitudeDelta: latDelta, longitudeDelta: lngDelta };
}

export function regionBounds(r: MapRegion): Bounds {
  return {
    minLng: Math.max(r.longitude - r.longitudeDelta / 2, -180),
    maxLng: Math.min(r.longitude + r.longitudeDelta / 2, 180),
    minLat: Math.max(r.latitude - r.latitudeDelta / 2, -90),
    maxLat: Math.min(r.latitude + r.latitudeDelta / 2, 90),
  };
}

/**
 * "Search this area" appears once the viewport has moved meaningfully away from the area last
 * searched: panned by more than a quarter of the view, or zoomed in/out by more than ~1.6×.
 */
export function viewportMoved(searched: MapRegion, now: MapRegion): boolean {
  const panLat = Math.abs(now.latitude - searched.latitude) / now.latitudeDelta;
  const panLng = Math.abs(now.longitude - searched.longitude) / now.longitudeDelta;
  const zoom = now.longitudeDelta / searched.longitudeDelta;
  return panLat > 0.25 || panLng > 0.25 || zoom > 1.6 || zoom < 1 / 1.6;
}

/** Web-mercator zoom level (supercluster's scale) for a region shown `widthPx` wide. */
export function regionZoom(r: MapRegion, widthPx: number): number {
  const z = Math.log2((360 * (widthPx / 256)) / Math.max(r.longitudeDelta, 1e-6));
  return Math.max(0, Math.min(20, Math.round(z)));
}
