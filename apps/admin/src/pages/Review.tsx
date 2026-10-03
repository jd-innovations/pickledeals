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
  resolved_at: string | null;
  retailer: { name: string } | null;
};
type Run = { id: string; created_at: string; report: { matched?: number; unmatched?: number; offers_created?: number; offers_updated?: number; errors?: unknown[] }; source: { name: string } | null };

/**
 * Review queue (§9): offers the matcher couldn't place. Matching one can remember its identifiers,
 * so the next import of the same item matches automatically. Rejected records can be reopened.
 */
export function ReviewPage() {
  const [rows, setRows] = useState<Raw[]>([]);
  const [tab, setTab] = useState<'unmatched' | 'rejected'>('unmatched');
  const [retailer, setRetailer] = useState('');
  const [retailers, setRetailers] = useState<{ id: string; name: string }[]>([]);
  const [runs, setRuns] = useState<Run[]>([]);
  const [message, setMessage] = useState<{ error: boolean; text: string } | null>(null);

  const load = useCallback(async () => {
    let query = supabase
      .from('raw_offer_records')
      .select('id, title, brand_text, url, price_cents, gtin, upc, ean, asin, mpn, retailer_sku, suggestions, created_at, resolved_at, retailer:retailers(name)')
      .eq('match_status', tab)
      .order('created_at', { ascending: false })
      .limit(100);
    if (retailer) query = query.eq('retailer_id', retailer);
    const { data, error } = await query.returns<Raw[]>();
    if (error) setMessage({ error: true, text: error.message });
    setRows(data ?? []);
    const r = await supabase.from('ingestion_runs').select('id, created_at, report, source:ingestion_sources(name)').order('created_at', { ascending: false }).limit(10).returns<Run[]>();
    setRuns(r.data ?? []);
  }, [tab, retailer]);
  useEffect(() => {
    load();
  }, [load]);
  useEffect(() => {
    supabase.from('retailers').select('id, name').order('name').then(({ data }) => setRetailers(data ?? []));
  }, []);

  const resolve = async (raw: Raw, variantId: string, remember: boolean) => {
    const { error } = await supabase.rpc('resolve_raw_offer', { raw_id: raw.id, variant: variantId, remember });
    setMessage(error ? { error: true, text: error.message } : { error: false, text: `Matched “${raw.title ?? raw.url}”. The offer is live.` });
    load();
  };
  const reject = async (raw: Raw) => {
    const { error } = await supabase.rpc('reject_raw_offer', { raw_id: raw.id });
    setMessage(error ? { error: true, text: error.message } : { error: false, text: 'Rejected. Find it under Rejected to undo.' });
    load();
  };
  const reopen = async (raw: Raw) => {
    const { error } = await supabase.rpc('reopen_raw_offer', { raw_id: raw.id });
    setMessage(error ? { error: true, text: error.message } : { error: false, text: `Moved “${raw.title ?? raw.url}” back to the queue.` });
    load();
  };

  return (
    <>
      <h1>Review queue</h1>
      <p className="muted">Imported offers without a confident match. Nothing here is visible in the app until it’s matched.</p>
      <div className="tabs">
        <button className={`btn ${tab === 'unmatched' ? 'primary' : ''}`} onClick={() => setTab('unmatched')}>
          Needs a match
        </button>
        <button className={`btn ${tab === 'rejected' ? 'primary' : ''}`} onClick={() => setTab('rejected')}>
          Rejected
        </button>
        <span className="grow" />
        <select value={retailer} onChange={(e) => setRetailer(e.target.value)}>
          <option value="">All retailers</option>
          {retailers.map((r) => (
            <option key={r.id} value={r.id}>
              {r.name}
            </option>
          ))}
        </select>
      </div>
      {message && <div className={`notice ${message.error ? 'error' : ''}`}>{message.text}</div>}
      {rows.length === 0 && <p className="muted">{tab === 'unmatched' ? 'Nothing to review.' : 'Nothing rejected.'}</p>}
      <div style={{ display: 'grid', gap: 12, marginTop: 12 }}>
        {rows.map((r) =>
          tab === 'unmatched' ? (
            <ReviewCard key={r.id} raw={r} onResolve={resolve} onReject={reject} />
          ) : (
            <div key={r.id} className="card">
              <div className="row">
                <div className="grow">
                  <strong>
                    {r.brand_text ? `${r.brand_text} · ` : ''}
                    {r.title ?? '(no title)'}
                  </strong>
                  <div className="muted" style={{ fontSize: 12 }}>
                    {r.retailer?.name} · {r.price_cents != null ? formatPrice(r.price_cents) : 'no price'} · rejected {r.resolved_at ? formatAgo(r.resolved_at) : ''}
                  </div>
                </div>
                <button className="btn" onClick={() => reopen(r)}>
                  Reopen
                </button>
              </div>
            </div>
          ),
        )}
      </div>

      <h2>Recent imports</h2>
      {runs.length === 0 ? (
        <p className="muted">No imports yet.</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>When</th>
              <th>Source</th>
              <th>Matched</th>
              <th>To review</th>
              <th>Offers created / updated</th>
              <th>Errors</th>
            </tr>
          </thead>
          <tbody>
            {runs.map((run) => (
              <tr key={run.id} className="num">
                <td className="muted">{formatAgo(run.created_at)}</td>
                <td>{run.source?.name}</td>
                <td>{run.report.matched ?? '—'}</td>
                <td>{run.report.unmatched ?? '—'}</td>
                <td>
                  {run.report.offers_created ?? 0} / {run.report.offers_updated ?? 0}
                </td>
                <td>{run.report.errors?.length ?? 0}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
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
