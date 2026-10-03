import { formatAgo, formatPrice } from '@pickledeals/shared';
import { useCallback, useEffect, useState } from 'react';

import { supabase } from '../lib/supabase';
import { ProductPicker, type PickedVariant } from './ProductPicker';

type Suggestion = { product_slug: string; brand: string; name: string; variant_id: string; score: number };
type Row = {
  id: string;
  suggestions: Suggestion[];
  created_at: string;
  listing: {
    id: string;
    custom_title: string | null;
    custom_brand_text: string | null;
    price_cents: number;
    condition: string;
    status: string;
    category: { name: string } | null;
  } | null;
};

/**
 * Custom listings (D3): sellers can list items that aren't in the catalog. Linking one to a catalog
 * variant puts it on that product page and into its "sells for" stats; nothing creates products automatically.
 */
export function ListingReviewPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [message, setMessage] = useState<{ error: boolean; text: string } | null>(null);

  const load = useCallback(async () => {
    const { data, error } = await supabase
      .from('listing_catalog_reviews')
      .select('id, suggestions, created_at, listing:listings(id, custom_title, custom_brand_text, price_cents, condition, status, category:categories(name))')
      .eq('decision', 'pending')
      .order('created_at', { ascending: false })
      .limit(100)
      .returns<Row[]>();
    if (error) setMessage({ error: true, text: error.message });
    setRows(data ?? []);
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  const resolve = async (row: Row, decision: 'linked' | 'dismissed', variantId?: string) => {
    const { error } = await supabase.rpc('resolve_listing_review', { review: row.id, decision, variant: variantId });
    const title = row.listing?.custom_title ?? 'listing';
    setMessage(error ? { error: true, text: error.message } : { error: false, text: decision === 'linked' ? `Linked “${title}”. It now shows on the product page.` : `Kept “${title}” as a custom item.` });
    load();
  };

  return (
    <>
      <h1>Custom listings</h1>
      <p className="muted">Pre-owned items listed outside the catalog. They’re already live in the marketplace; linking adds them to a product page.</p>
      {message && <div className={`notice ${message.error ? 'error' : ''}`}>{message.text}</div>}
      {rows.length === 0 && <p className="muted">Nothing to review.</p>}
      <div style={{ display: 'grid', gap: 12, marginTop: 12 }}>
        {rows.map((r) => (
          <ReviewCard key={r.id} row={r} onResolve={resolve} />
        ))}
      </div>
    </>
  );
}

function ReviewCard({ row, onResolve }: { row: Row; onResolve: (r: Row, decision: 'linked' | 'dismissed', variantId?: string) => void }) {
  const [picked, setPicked] = useState<PickedVariant | null>(null);
  const l = row.listing;
  if (!l) return null;
  return (
    <div className="card">
      <div className="row">
        <div className="grow">
          <strong>
            {l.custom_brand_text ? `${l.custom_brand_text} · ` : ''}
            {l.custom_title}
          </strong>
          <div className="muted" style={{ fontSize: 12 }}>
            {l.category?.name} · {formatPrice(l.price_cents)} · {l.condition.replace('_', ' ')} · {l.status} · listed {formatAgo(row.created_at)}
          </div>
        </div>
        <button className="btn" onClick={() => onResolve(row, 'dismissed')}>
          Keep as custom
        </button>
      </div>
      {row.suggestions.length > 0 && (
        <div className="row">
          <span className="muted">Suggestions:</span>
          {row.suggestions.map((s) => (
            <button key={s.product_slug} className="btn" onClick={() => onResolve(row, 'linked', s.variant_id)}>
              {s.brand} {s.name} <span className="muted">({Math.round(s.score * 100)}%)</span>
            </button>
          ))}
        </div>
      )}
      <label className="field">
        Or choose the exact variant
        <ProductPicker value={picked} onChange={setPicked} initialQuery={l.custom_title ?? ''} />
      </label>
      <div className="row">
        <span className="grow" />
        <button className="btn primary" disabled={!picked} onClick={() => picked && onResolve(row, 'linked', picked.variantId)}>
          Link to chosen variant
        </button>
      </div>
    </div>
  );
}
