import { describe, expect, it } from 'vitest';

import { geohashCenter, geohashEncode, regionAround, regionBounds, regionZoom, snapToCell, viewportMoved } from './geo';

describe('geohash', () => {
  it('matches PostGIS ST_GeoHash (pgTAP: 27.336789,-82.531234 → dhv79b)', () => {
    expect(geohashEncode(27.336789, -82.531234, 6)).toBe('dhv79b');
  });

  it('decodes to the cell centre, which re-encodes to the same cell', () => {
    const c = geohashCenter('dhv79b');
    expect(geohashEncode(c.lat, c.lng, 6)).toBe('dhv79b');
    // The seeded Sarasota cell centre the map RPC returns.
    const s = snapToCell(27.336, -82.53);
    expect(s.lat).toBeCloseTo(27.3367309570312, 9);
    expect(s.lng).toBeCloseTo(-82.5347900390625, 9);
  });

  it('snaps nearby points to the same public point (D2)', () => {
    expect(snapToCell(27.3368, -82.5313)).toEqual(snapToCell(27.337, -82.53));
    expect(snapToCell(27.336789, -82.531234)).not.toEqual({ lat: 27.336789, lng: -82.531234 });
  });

  it('rejects invalid hashes', () => {
    expect(() => geohashCenter('dhv7ai')).toThrow();
  });
});

describe('viewport', () => {
  const base = regionAround({ lat: 27.33, lng: -82.53 }, 10_000);

  it('builds a region that fits the radius and bounds around it', () => {
    expect(base.latitudeDelta).toBeCloseTo(0.1797, 3);
    expect(base.longitudeDelta).toBeGreaterThan(base.latitudeDelta);
    const b = regionBounds(base);
    expect(b.minLat).toBeLessThan(27.33);
    expect(b.maxLng).toBeGreaterThan(-82.53);
  });

  it('only offers "Search this area" after a meaningful move', () => {
    expect(viewportMoved(base, base)).toBe(false);
    expect(viewportMoved(base, { ...base, latitude: base.latitude + base.latitudeDelta * 0.1 })).toBe(false);
    expect(viewportMoved(base, { ...base, longitude: base.longitude + base.longitudeDelta * 0.4 })).toBe(true);
    expect(viewportMoved(base, { ...base, latitudeDelta: base.latitudeDelta * 3, longitudeDelta: base.longitudeDelta * 3 })).toBe(true);
    expect(viewportMoved(base, { ...base, latitudeDelta: base.latitudeDelta / 2, longitudeDelta: base.longitudeDelta / 2 })).toBe(true);
  });

  it('derives a clamped zoom level', () => {
    expect(regionZoom({ ...base, longitudeDelta: 360 }, 256)).toBe(0);
    expect(regionZoom(base, 390)).toBeGreaterThan(9);
    expect(regionZoom({ ...base, longitudeDelta: 1e-9 }, 390)).toBe(20);
  });
});
