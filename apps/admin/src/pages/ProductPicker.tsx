import { useEffect, useState } from 'react';

import { supabase } from '../lib/supabase';

export type PickedVariant = { variantId: string; label: string; productSlug: string; productName: string; brand: string };

type Hit = { slug: string; name: string; brand: { name: string } | null; variants: { id: string; label: string; is_default: boolean }[] };

/** Search products by name/slug, then pick a variant (offers bind to variants). */
export function ProductPicker({ value, onChange, initialQuery = '' }: { value: PickedVariant | null; onChange: (v: PickedVariant | null) => void; initialQuery?: string }) {
  const [q, setQ] = useState(initialQuery);
  const [hits, setHits] = useState<Hit[]>([]);

  useEffect(() => {
    const term = q.trim().replace(/[%,()]/g, '');
    if (term.length < 2 || value) return setHits([]);
    let cancelled = false;
    const t = setTimeout(async () => {
      const { data } = await supabase
        .from('products')
        .select('slug, name, brand:brands(name), variants:product_variants(id, label, is_default)')
        .or(`name.ilike.%${term}%,slug.ilike.%${term}%`)
        .order('name')
        .limit(8)
        .returns<Hit[]>();
      if (!cancelled) setHits(data ?? []);
    }, 200);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [q, value]);

  if (value) {
    return (
      <div className="row">
        <span className="grow">
          <strong>
            {value.brand} {value.productName}
          </strong>{' '}
          · {value.label}
        </span>
        <button type="button" className="btn" onClick={() => onChange(null)}>
          Change
        </button>
      </div>
    );
  }

  return (
    <div style={{ display: 'grid', gap: 6 }}>
      <input placeholder="Search products (name or slug)" value={q} onChange={(e) => setQ(e.target.value)} />
      {hits.map((h) => (
        <div key={h.slug} className="row" style={{ padding: '4px 0' }}>
          <span className="grow">
            {h.brand?.name} {h.name} <span className="muted">· {h.slug}</span>
          </span>
          {[...h.variants]
            .sort((a, b) => Number(b.is_default) - Number(a.is_default) || a.label.localeCompare(b.label))
            .map((v) => (
              <button
                key={v.id}
                type="button"
                className="btn"
                onClick={() => onChange({ variantId: v.id, label: v.label, productSlug: h.slug, productName: h.name, brand: h.brand?.name ?? '' })}>
                {v.label}
              </button>
            ))}
        </div>
      ))}
    </div>
  );
}
