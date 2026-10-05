import { dollarsToCents, formatAgo, formatPrice, suggestProductName } from '@pickledeals/shared';
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
  payload: { ships_from?: string; product_type?: string; description?: unknown[]; images?: unknown[]; specs?: Record<string, string> } | null;
  created_at: string;
  resolved_at: string | null;
  retailer: { name: string } | null;
};
type Option = { id: string; name: string };
type Run = {
  id: string;
  created_at: string;
  report: { matched?: number; unmatched?: number; offers_created?: number; offers_updated?: number; errors?: unknown[] };
  source: { name: string } | null;
};

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
      .select(
        'id, title, brand_text, url, price_cents, gtin, upc, ean, asin, mpn, retailer_sku, suggestions, payload, created_at, resolved_at, retailer:retailers(name)',
      )
      .eq('match_status', tab)
      .order('created_at', { ascending: false })
      .limit(100);
    if (retailer) query = query.eq('retailer_id', retailer);
    const { data, error } = await query.returns<Raw[]>();
    if (error) setMessage({ error: true, text: error.message });
    setRows(data ?? []);
    const r = await supabase
      .from('ingestion_runs')
      .select('id, created_at, report, source:ingestion_sources(name)')
      .order('created_at', { ascending: false })
      .limit(10)
      .returns<Run[]>();
    setRuns(r.data ?? []);
  }, [tab, retailer]);
  useEffect(() => {
    load();
  }, [load]);
  const [brands, setBrands] = useState<Option[]>([]);
  const [categories, setCategories] = useState<Option[]>([]);
  useEffect(() => {
    supabase
      .from('retailers')
      .select('id, name')
      .order('name')
      .then(({ data }) => setRetailers(data ?? []));
    supabase
      .from('brands')
      .select('id, name')
      .order('name')
      .then(({ data }) => setBrands(data ?? []));
    supabase
      .from('categories')
      .select('id, name')
      .order('sort')
      .then(({ data }) => setCategories(data ?? []));
  }, []);

  const createProduct = async (raw: Raw, p: { brand: string; category: string; name: string; variantLabel: string; msrpCents: number | null }) => {
    const { data, error } = await supabase.rpc('staff_create_product_from_raw', {
      raw_id: raw.id,
      brand: p.brand,
      category: p.category,
      name: p.name,
      variant_label: p.variantLabel || undefined,
      msrp_cents: p.msrpCents ?? undefined,
    });
    const slug = (data as { slug?: string } | null)?.slug;
    setMessage(
      error
        ? { error: true, text: error.message }
        : {
            error: false,
            text: `Created draft product ${slug}. Add a licensed image and publish it in Products (#/products/${slug}); the offer goes live then.`,
          },
    );
    load();
  };

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
            <ReviewCard key={r.id} raw={r} brands={brands} categories={categories} onResolve={resolve} onReject={reject} onCreate={createProduct} />
          ) : (
            <div key={r.id} className="card">
              <div className="row">
                <div className="grow">
                  <strong>
                    {r.brand_text ? `${r.brand_text} · ` : ''}
                    {r.title ?? '(no title)'}
                  </strong>
                  <div className="muted" style={{ fontSize: 12 }}>
                    {r.retailer?.name} · {r.price_cents != null ? formatPrice(r.price_cents) : 'no price'} · rejected{' '}
                    {r.resolved_at ? formatAgo(r.resolved_at) : ''}
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

type CreateInput = { brand: string; category: string; name: string; variantLabel: string; msrpCents: number | null };

function ReviewCard({
  raw,
  brands,
  categories,
  onResolve,
  onReject,
  onCreate,
}: {
  raw: Raw;
  brands: Option[];
  categories: Option[];
  onResolve: (r: Raw, variantId: string, remember: boolean) => void;
  onReject: (r: Raw) => void;
  onCreate: (r: Raw, p: CreateInput) => void;
}) {
  const [picked, setPicked] = useState<PickedVariant | null>(null);
  const [remember, setRemember] = useState(true);
  const [creating, setCreating] = useState(false);
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
            {raw.payload?.ships_from ? ` · Shopify Collective: ships from ${raw.payload.ships_from}` : ''}
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
      {creating ? (
        <CreateProductForm raw={raw} brands={brands} categories={categories} onCancel={() => setCreating(false)} onCreate={(p) => onCreate(raw, p)} />
      ) : (
        <div className="row">
          <span className="muted" style={{ fontSize: 12 }}>
            Not in the catalog yet?
          </span>
          <button className="btn" onClick={() => setCreating(true)}>
            Create product…
          </button>
        </div>
      )}
    </div>
  );
}

/** Shopify product type ("Paddle") → the catalog category with that name ("Paddles"), if one matches. */
function guessCategory(productType: string | undefined, categories: Option[]): string {
  const norm = (s: string) =>
    s
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, ' ')
      .trim()
      .replace(/(es|s)$/, '');
  const t = productType ? norm(productType) : '';
  if (!t) return '';
  return (categories.find((c) => norm(c.name) === t) ?? categories.find((c) => norm(c.name).includes(t) || t.includes(norm(c.name))))?.id ?? '';
}

function storeContent(raw: Raw): string {
  const p = raw.payload;
  const parts = [
    p?.description?.length ? 'description' : null,
    p?.images?.length ? `${p.images.length} image${p.images.length === 1 ? '' : 's'}` : null,
    p?.specs && Object.keys(p.specs).length ? `${Object.keys(p.specs).length} specs` : null,
  ].filter(Boolean);
  return parts.join(', ');
}

/**
 * A draft catalog product from this record. The brand starts from the feed's vendor name but is often
 * different (stores list other brands' items under their own name), so staff confirm it. The record's
 * barcode/SKU and vendor name are remembered, so the next import matches by itself.
 */
function CreateProductForm({
  raw,
  brands,
  categories,
  onCancel,
  onCreate,
}: {
  raw: Raw;
  brands: Option[];
  categories: Option[];
  onCancel: () => void;
  onCreate: (p: CreateInput) => void;
}) {
  const [brand, setBrand] = useState('');
  const [category, setCategory] = useState(() => guessCategory(raw.payload?.product_type, categories));
  const brandName = brands.find((b) => b.id === brand)?.name ?? null;
  const suggested = suggestProductName(raw.title ?? '', brandName);
  const [name, setName] = useState<string | null>(null);
  const [variantLabel, setVariantLabel] = useState(suggested.variant ?? '');
  const [msrp, setMsrp] = useState('');

  useEffect(() => {
    if (!raw.brand_text) return;
    supabase.rpc('brand_for_vendor', { vendor: raw.brand_text }).then(({ data }) => {
      if (typeof data === 'string') setBrand((b) => b || data);
    });
  }, [raw.brand_text]);

  const finalName = (name ?? suggested.name).trim();
  const msrpCents = msrp.trim() ? dollarsToCents(msrp) : null;
  const ready = brand && category && finalName && (msrp.trim() === '' || msrpCents != null);

  return (
    <div className="card" style={{ background: 'var(--background)' }}>
      <strong style={{ fontSize: 13 }}>New draft product</strong>
      {storeContent(raw) && (
        <p className="muted" style={{ fontSize: 12, margin: 0 }}>
          From the store, added automatically: {storeContent(raw)}. Images arrive with the source’s next run (within minutes).
        </p>
      )}
      <div className="grid3">
        <label className="field">
          Brand {raw.brand_text ? <span className="muted">(feed vendor: {raw.brand_text})</span> : null}
          <select value={brand} onChange={(e) => setBrand(e.target.value)}>
            <option value="">Choose…</option>
            {brands.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          Category
          <select value={category} onChange={(e) => setCategory(e.target.value)}>
            <option value="">Choose…</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          MSRP in dollars (from the brand’s own site; optional)
          <input className="num" value={msrp} onChange={(e) => setMsrp(e.target.value)} placeholder="e.g. 199.99" />
        </label>
        <label className="field">
          Product name (without the brand)
          <input value={name ?? suggested.name} onChange={(e) => setName(e.target.value)} />
        </label>
        <label className="field">
          Variant label (blank = Standard)
          <input value={variantLabel} onChange={(e) => setVariantLabel(e.target.value)} placeholder="e.g. 16mm" />
        </label>
      </div>
      <p className="muted" style={{ fontSize: 12, margin: 0 }}>
        The product starts as a draft and this offer stays hidden until you add a licensed image and publish it. Don’t copy images from the store unless the
        brand allows it.
      </p>
      <div className="row">
        <span className="grow" />
        <button className="btn" onClick={onCancel}>
          Cancel
        </button>
        <button
          className="btn primary"
          disabled={!ready}
          onClick={() => onCreate({ brand, category, name: finalName, variantLabel: variantLabel.trim(), msrpCents })}>
          Create draft product
        </button>
      </div>
    </div>
  );
}
