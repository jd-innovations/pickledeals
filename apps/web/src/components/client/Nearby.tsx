'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

import type { ListingCardItem } from '@/data/market';

import { ListingCard } from '../Cards';
import { Icon } from '../Icon';

/** Home "Pre-owned near you": fetched after load so the cached home page stays the same for everyone. */
export function Nearby() {
  const [data, setData] = useState<{ area: string | null; items: ListingCardItem[] } | null>(null);
  useEffect(() => {
    let live = true;
    fetch('/api/nearby')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => live && setData(d))
      .catch(() => live && setData(null));
    return () => {
      live = false;
    };
  }, []);
  if (data && !data.items.length) return null;
  return (
    <section className="section" aria-busy={!data}>
      <div className="section-head">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <h2>{data?.area ? 'Pre-owned near you' : 'Pre-owned'}</h2>
          <span className="note">{data?.area ? `${data.area} · within 25 mi · approximate area` : 'Newest listings from players across the US'}</span>
        </div>
        <Link href="/marketplace" className="btn btn-secondary btn-xs">
          <Icon name="map" size={14} stroke={2} />
          Open map
        </Link>
      </div>
      <div className="grid">
        {data
          ? data.items.slice(0, 5).map((l) => <ListingCard key={l.id} listing={l} />)
          : Array.from({ length: 5 }, (_, i) => <div key={i} className="tile" aria-hidden="true" />)}
      </div>
    </section>
  );
}
