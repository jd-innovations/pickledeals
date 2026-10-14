'use client';

import { APPROX_AREA_RADIUS_M } from '@pickledeals/shared';
import { useEffect, useRef, useState } from 'react';

import { isDark, loadMapKit } from './mapkit';

const cssVar = (name: string) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

/**
 * A listing's approximate area (same as the app): a ~1 km dashed circle around the public cell centre,
 * never a pin (D2). People can pan and zoom. Without a MapKit key it renders nothing and the page keeps
 * its text description.
 */
export function AreaMap({ center, areaName }: { center: { lat: number; lng: number }; areaName: string | null }) {
  const el = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<'loading' | 'on' | 'off'>('loading');

  useEffect(() => {
    let off = false;
    let map: any = null;
    let circle: any = null;
    const paint = () => {
      const mk = window.mapkit;
      if (!mk || !map || !circle) return;
      map.colorScheme = isDark() ? mk.Map.ColorSchemes.Dark : mk.Map.ColorSchemes.Light;
      circle.style = new mk.Style({ fillColor: cssVar('--map-area'), fillOpacity: 1, strokeColor: cssVar('--text-tertiary'), lineWidth: 1.5, lineDash: [6, 4] });
    };
    loadMapKit().then((ok) => {
      if (off) return;
      if (!ok || !el.current) return setState('off');
      const mk = window.mapkit;
      const at = new mk.Coordinate(center.lat, center.lng);
      map = new mk.Map(el.current, { center: at, showsCompass: mk.FeatureVisibility.Hidden, showsMapTypeControl: false, isRotationEnabled: false });
      const span = (APPROX_AREA_RADIUS_M * 6) / 111_000;
      map.region = new mk.CoordinateRegion(at, new mk.CoordinateSpan(span, span * 1.3));
      circle = new mk.CircleOverlay(at, APPROX_AREA_RADIUS_M);
      map.addOverlay(circle);
      paint();
      setState('on');
    });
    window.addEventListener('pd-theme', paint);
    return () => {
      off = true;
      window.removeEventListener('pd-theme', paint);
      map?.destroy();
    };
  }, [center.lat, center.lng]);

  if (state === 'off') return null;
  return (
    <section className="area-map" aria-label={areaName ? `Map of the approximate area around ${areaName}` : 'Map of the approximate area'}>
      <div ref={el} style={{ position: 'absolute', inset: 0 }} />
      {state === 'loading' && <div className="map-msg">Loading the map…</div>}
      <span className="area-map-label glass">Approximate area</span>
    </section>
  );
}
