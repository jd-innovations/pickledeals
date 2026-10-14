'use client';

import { formatPrice } from '@pickledeals/shared';
import { useCallback, useEffect, useRef, useState } from 'react';

import type { ListingCardItem, MapListing } from '@/data/market';

import { ListingCard } from '../Cards';

import { isDark, loadMapKit } from './mapkit';

const US = { lat: 39.5, lng: -98.35 };

const toCard = (m: MapListing): ListingCardItem => ({
  id: m.id,
  sellerId: '',
  status: 'active',
  condition: m.condition,
  priceCents: m.priceCents,
  pickup: true,
  ships: false,
  publishedAt: '',
  title: m.title,
  productSlug: null,
  variantLabel: null,
  hasVariants: false,
  brandName: m.brandName,
  categorySlug: m.categorySlug,
  categoryName: '',
  areaLabel: m.areaLabel,
  distanceM: null,
  bestNewCents: null,
  imagePath: m.imagePath,
});

/**
 * Pre-owned marketplace (approved: listings beside an Apple map). The list renders on the server;
 * the map adds price pins at each listing's public ~1 km cell (D2) and "Search this area" swaps the
 * list for what's in view. Without a MapKit key the list takes the full width.
 */
export function MarketExplorer({ initial, origin, category, focus }: { initial: ListingCardItem[]; origin: { lat: number; lng: number } | null; category?: string; focus?: string }) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<any>(null);
  const [mapState, setMapState] = useState<'loading' | 'on' | 'off'>('loading');
  const [items, setItems] = useState(initial);
  const [selected, setSelected] = useState<string | null>(focus ?? null);
  const [moved, setMoved] = useState(false);
  const focusPending = useRef(focus ?? null);
  const [busy, setBusy] = useState(false);

  const showPins = useCallback((pins: MapListing[]) => {
    const mk = window.mapkit;
    const m = map.current;
    if (!mk || !m) return;
    m.removeAnnotations(m.annotations);
    m.addAnnotations(
      pins.map((p) => {
        const a = new mk.Annotation(new mk.Coordinate(p.point.lat, p.point.lng), () => {
          const b = document.createElement('button');
          b.type = 'button';
          b.className = 'map-pin';
          b.textContent = formatPrice(p.priceCents);
          b.setAttribute('aria-label', `${p.title}, ${formatPrice(p.priceCents)}`);
          return b;
        });
        a.addEventListener('select', () => {
          setSelected(p.id);
          document.querySelector(`[data-listing="${p.id}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        });
        return a;
      }),
    );
    // Opened from a listing ("See nearby listings on the map"): select its pin once.
    const f = m.annotations.find((_: unknown, i: number) => pins[i]?.id === focusPending.current);
    if (f) {
      focusPending.current = null;
      f.selected = true;
    }
  }, []);

  const searchArea = useCallback(
    async (replaceList: boolean) => {
      const m = map.current;
      if (!m) return;
      const r = m.region.toBoundingRegion();
      const q = new URLSearchParams({ minLat: String(r.southLatitude), maxLat: String(r.northLatitude), minLng: String(r.westLongitude), maxLng: String(r.eastLongitude) });
      if (category) q.set('category', category);
      setBusy(true);
      try {
        const res = await fetch(`/api/market?${q}`).then((x) => x.json() as Promise<{ items: MapListing[] }>);
        showPins(res.items);
        if (replaceList) setItems(res.items.map(toCard));
        setMoved(false);
      } finally {
        setBusy(false);
      }
    },
    [category, showPins],
  );

  useEffect(() => {
    let off = false;
    loadMapKit().then((ok) => {
      if (off) return;
      if (!ok || !el.current) return setMapState('off');
      const mk = window.mapkit;
      const center = origin ?? US;
      const span = focus ? 0.15 : origin ? 0.6 : 30;
      const m = new mk.Map(el.current, {
        center: new mk.Coordinate(center.lat, center.lng),
        showsCompass: mk.FeatureVisibility.Hidden,
        showsMapTypeControl: false,
        colorScheme: isDark() ? mk.Map.ColorSchemes.Dark : mk.Map.ColorSchemes.Light,
      });
      m.region = new mk.CoordinateRegion(new mk.Coordinate(center.lat, center.lng), new mk.CoordinateSpan(span, span * 1.4));
      m.addEventListener('region-change-end', () => setMoved(true));
      map.current = m;
      setMapState('on');
      void searchArea(false);
    });
    const onTheme = () => {
      const mk = window.mapkit;
      if (map.current && mk) map.current.colorScheme = isDark() ? mk.Map.ColorSchemes.Dark : mk.Map.ColorSchemes.Light;
    };
    window.addEventListener('pd-theme', onTheme);
    return () => {
      off = true;
      window.removeEventListener('pd-theme', onTheme);
      map.current?.destroy();
      map.current = null;
    };
  }, [origin, focus, searchArea]);

  const list = items.length ? (
    <div className={`grid ${mapState === 'off' ? 'g4' : 'g3'}`}>
      {items.map((l) => (
        <ListingCard key={l.id} listing={l} selected={l.id === selected} />
      ))}
    </div>
  ) : (
    <div className="empty">
      <h2>No pre-owned listings here yet</h2>
      <p>Players list paddles, shoes and gear from the PickleDeals app. {mapState === 'on' ? 'Move the map, or check back soon.' : 'Check back soon.'}</p>
      <a href="/app" className="btn btn-primary btn-sm">
        Sell yours in the app
      </a>
    </div>
  );

  if (mapState === 'off') return <div className="section">{list}</div>;
  return (
    <div className="market-split">
      <div className="market-list">{list}</div>
      <div className="market-map" aria-label="Map of listings">
        <div ref={el} style={{ position: 'absolute', inset: 0 }} />
        {mapState === 'loading' && <div className="map-msg">Loading the map…</div>}
        {mapState === 'on' && moved && (
          <button type="button" className="map-search" onClick={() => void searchArea(true)} disabled={busy}>
            {busy ? 'Searching…' : 'Search this area'}
          </button>
        )}
      </div>
    </div>
  );
}
