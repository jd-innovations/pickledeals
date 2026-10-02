import { formatAgo, formatPrice } from '@pickledeals/shared';
import { useCallback, useEffect, useState } from 'react';

import { supabase } from '../lib/supabase';
import { ProductPicker, type PickedVariant } from './ProductPicker';

type Suggestion = { product_slug: string; brand: string; name: string; variant_id: string; score: number };
type Raw = {
  id: string;
  title: string | null;
  brand_text: string | null;
  url: string | null;
  price_cents: number | null;
  gtin: string | null;
  upc: string | null;
  ean: string | null;
  asin: string | null;
  mpn: string | null;
  retailer_sku: string | null;
  suggestions: Suggestion[];
  created_at: string;
  retailer: { name: string } | null;
};

/**
 * Review queue (§9): offers the matcher couldn't place. Matching one can remember its identifiers,
 * so the next import of the same item matches automatically.
 */
export function ReviewPage() {
  const [rows, setRows] = useState<Raw[]>([]);
  const [message, setMessage] = useState<{ error: boolean; text: string } | null>(null);

  const load = useCallback(async () => {
    const { data, error } = await supabase
      .from('raw_offer_records')
      .select('id, title, brand_text, url, price_cents, gtin, upc, ean, asin, mpn, retailer_sku, suggestions, created_at, retailer:retailers(name)')
      .eq('match_status', 'unmatched')
      .order('created_at', { ascending: false })
      .limit(100)
      .returns<Raw[]>();
    if (error) setMessage({ error: true, text: error.message });
    setRows(data ?? []);
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  const resolve = async (raw: Raw, variantId: string, remember: boolean) => {
    const { error } = await supabase.rpc('resolve_raw_offer', { raw_id: raw.id, variant: variantId, remember });
    setMessage(error ? { error: true, text: error.message } : { error: false, text: `Matched “${raw.title ?? raw.url}”. The offer is live.` });
    load();
  };
  const reject = async (raw: Raw) => {
    const { error } = await supabase.rpc('reject_raw_offer', { raw_id: raw.id });
    setMessage(error ? { error: true, text: error.message } : { error: false, text: 'Rejected.' });
    load();
  };

  return (
    <>
      <h1>Review queue</h1>
      <p className="muted">Imported offers without a confident match. Nothing here is visible in the app until it’s matched.</p>
      {message && <div className={`notice ${message.error ? 'error' : ''}`}>{message.text}</div>}
      {rows.length === 0 && <p className="muted">Nothing to review.</p>}
      <div style={{ display: 'grid', gap: 12, marginTop: 12 }}>
        {rows.map((r) => (
          <ReviewCard key={r.id} raw={r} onResolve={resolve} onReject={reject} />
        ))}
      </div>
    </>
  );
}

function ReviewCard({ raw, onResolve, onReject }: { raw: Raw; onResolve: (r: Raw, variantId: string, remember: boolean) => void; onReject: (r: Raw) => void }) {
  const [picked, setPicked] = useState<PickedVariant | null>(null);
  const [remember, setRemember] = useState(true);
  const identifiers = (['gtin', 'upc', 'ean', 'asin', 'mpn', 'retailer_sku'] as const).filter((k) => raw[k]).map((k) => `${k.toUpperCase()} ${raw[k]}`);

  return (
    <div className="card">
      <div className="row">
        <div className="grow">
          <strong>
            {raw.brand_text ? `${raw.brand_text} · ` : ''}
            {raw.title ?? '(no title)'}
          </strong>
          <div className="muted" style={{ fontSize: 12 }}>
            {raw.retailer?.name} · {raw.price_cents != null ? formatPrice(raw.price_cents) : 'no price'} · {formatAgo(raw.created_at)}
            {identifiers.length ? ` · ${identifiers.join(' · ')}` : ''}
          </div>
          {raw.url && (
            <a className="muted" style={{ fontSize: 12 }} href={raw.url} target="_blank" rel="noreferrer noopener">
              {raw.url}
            </a>
          )}
        </div>
        <button className="btn danger" onClick={() => onReject(raw)}>
          Reject
        </button>
      </div>
      {raw.suggestions.length > 0 && (
        <div className="row">
          <span className="muted">Suggestions:</span>
          {raw.suggestions.map((s) => (
            <button key={s.product_slug} className="btn" onClick={() => onResolve(raw, s.variant_id, remember)}>
              {s.brand} {s.name} <span className="muted">({Math.round(s.score * 100)}%)</span>
            </button>
          ))}
        </div>
      )}
      <label className="field">
        Or choose the exact variant
        <ProductPicker value={picked} onChange={setPicked} />
      </label>
      <div className="row">
        <label className="row">
          <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} disabled={identifiers.length === 0} /> Remember{' '}
          {identifiers.length ? identifiers.join(', ') : 'identifiers (none on this record)'} for future imports
        </label>
        <span className="grow" />
        <button className="btn primary" disabled={!picked} onClick={() => picked && onResolve(raw, picked.variantId, remember)}>
          Match to chosen variant
        </button>
      </div>
    </div>
  );
}
