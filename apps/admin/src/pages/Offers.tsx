import { buildOfferRecords, dollarsToCents, formatAgo, formatPrice, type OfferRecord } from '@pickledeals/shared';
import { useCallback, useEffect, useState, type FormEvent } from 'react';

import { go } from '../App';
import { supabase } from '../lib/supabase';
import { ProductPicker, type PickedVariant } from './ProductPicker';

type Retailer = { id: string; slug: string; name: string; domain: string; price_display_default: 'show' | 'check_price' };
type OfferRow = {
  id: string;
  url: string;
  price_cents: number | null;
  shipping_cents: number;
  in_stock: boolean;
  status: 'active' | 'inactive';
  price_display: 'show' | 'check_price';
  external_ref: string | null;
  available_sizes: string[];
  last_checked_at: string;
  retailer: { slug: string; name: string } | null;
  variant: { id: string; label: string; product: { slug: string; name: string; brand: { name: string } | null } | null } | null;
};
type IngestReport = {
  applied: boolean;
  dry_run: boolean;
  matched: number;
  unmatched: number;
  offers_created: number;
  offers_updated: number;
  errors: { row: number; message: string }[];
  queued: { row: number; title: string | null }[];
};

/**
 * Offers (Phase 3). Every write goes through the ingestion pipeline (`ingest_offers`), so admin
 * entry, CSV and future feeds share one matcher, price history and stats path (§9).
 */
export function OffersPage() {
  const [retailers, setRetailers] = useState<Retailer[]>([]);
  const [rows, setRows] = useState<OfferRow[]>([]);
  const [filter, setFilter] = useState({ q: '', retailer: '' });
  const [editing, setEditing] = useState<Partial<OfferRow> | null>(null);
  const [message, setMessage] = useState<{ error: boolean; text: string } | null>(null);

  useEffect(() => {
    supabase.from('retailers').select('id, slug, name, domain, price_display_default').order('name').then(({ data }) => setRetailers(data ?? []));
  }, []);

  const load = useCallback(async () => {
    let query = supabase
      .from('retailer_offers')
      .select('id, url, price_cents, shipping_cents, in_stock, status, price_display, external_ref, available_sizes, last_checked_at, retailer:retailers!inner(slug, name), variant:product_variants!inner(id, label, product:products!inner(slug, name, brand:brands(name)))')
      .order('last_checked_at', { ascending: false })
      .limit(300);
    if (filter.retailer) query = query.eq('retailer.slug', filter.retailer);
    const term = filter.q.trim().replace(/[%,()]/g, '');
    if (term) query = query.ilike('variant.product.name', `%${term}%`);
    const { data, error } = await query.returns<OfferRow[]>();
    if (error) setMessage({ error: true, text: error.message });
    setRows(data ?? []);
  }, [filter]);
  useEffect(() => {
    const t = setTimeout(load, 200);
    return () => clearTimeout(t);
  }, [load]);

  const setStatus = async (o: OfferRow, status: OfferRow['status']) => {
    const { error } = await supabase.from('retailer_offers').update({ status }).eq('id', o.id);
    setMessage(error ? { error: true, text: error.message } : { error: false, text: `${status === 'active' ? 'Reactivated' : 'Deactivated'} offer.` });
    load();
  };

  return (
    <>
      <div className="row">
        <h1 className="grow">Offers</h1>
        <button className="btn primary" onClick={() => setEditing({})}>
          Add offer
        </button>
      </div>
      <p className="muted">Saving runs the ingestion pipeline: price history and best-price stats update automatically. Amazon and other check-price retailers never store a manual price (D1).</p>
      {message && <div className={`notice ${message.error ? 'error' : ''}`}>{message.text}</div>}
      {editing && (
        <OfferForm
          retailers={retailers}
          initial={editing}
          onDone={(text) => {
            setEditing(null);
            setMessage({ error: false, text });
            load();
          }}
          onCancel={() => setEditing(null)}
        />
      )}
      <div className="row" style={{ margin: '12px 0' }}>
        <input className="grow" placeholder="Filter by product name" value={filter.q} onChange={(e) => setFilter({ ...filter, q: e.target.value })} />
        <select value={filter.retailer} onChange={(e) => setFilter({ ...filter, retailer: e.target.value })}>
          <option value="">All retailers</option>
          {retailers.map((r) => (
            <option key={r.id} value={r.slug}>
              {r.name}
            </option>
          ))}
        </select>
      </div>
      <table>
        <thead>
          <tr>
            <th>Product</th>
            <th>Retailer</th>
            <th>Price</th>
            <th>Ship</th>
            <th>Stock</th>
            <th>Checked</th>
            <th>Status</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {rows.map((o) => (
            <tr key={o.id}>
              <td>
                <strong>
                  {o.variant?.product?.brand?.name} {o.variant?.product?.name}
                </strong>
                <div className="muted" style={{ fontSize: 12 }}>
                  {o.variant?.label}
                  {o.external_ref ? ` · ref ${o.external_ref}` : ''}
                </div>
              </td>
              <td>{o.retailer?.name}</td>
              <td className="num">{o.price_display === 'check_price' ? <span className="pill">check price</span> : formatPrice(o.price_cents!)}</td>
              <td className="num">{o.price_display === 'check_price' ? '—' : o.shipping_cents ? formatPrice(o.shipping_cents) : 'free'}</td>
              <td>{o.in_stock ? 'in stock' : 'out'}</td>
              <td className="muted">{formatAgo(o.last_checked_at)}</td>
              <td>
                <span className={`pill ${o.status === 'active' ? 'dark' : ''}`}>{o.status}</span>
              </td>
              <td>
                <div className="row">
                  <button className="btn" onClick={() => setEditing(o)}>
                    Update
                  </button>
                  <button className="btn danger" onClick={() => setStatus(o, o.status === 'active' ? 'inactive' : 'active')}>
                    {o.status === 'active' ? 'Deactivate' : 'Activate'}
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <OfferImport />
    </>
  );
}

const cents = (c: number | null | undefined) => (c == null ? '' : (c / 100).toFixed(2));

function OfferForm({ retailers, initial, onDone, onCancel }: { retailers: Retailer[]; initial: Partial<OfferRow>; onDone: (msg: string) => void; onCancel: () => void }) {
  const editing = !!initial.id;
  const [variant, setVariant] = useState<PickedVariant | null>(
    initial.variant?.product
      ? { variantId: initial.variant.id, label: initial.variant.label, productSlug: initial.variant.product.slug, productName: initial.variant.product.name, brand: initial.variant.product.brand?.name ?? '' }
      : null,
  );
  const [retailer, setRetailer] = useState(initial.retailer?.slug ?? '');
  const [url, setUrl] = useState(initial.url ?? '');
  const [price, setPrice] = useState(cents(initial.price_cents));
  const [shipping, setShipping] = useState(cents(initial.shipping_cents ?? 0));
  const [inStock, setInStock] = useState(initial.in_stock ?? true);
  const [sizes, setSizes] = useState((initial.available_sizes ?? []).join(', '));
  const [ref, setRef] = useState(initial.external_ref ?? '');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const r = retailers.find((x) => x.slug === retailer);
  const checkPrice = r?.price_display_default === 'check_price';

  const save = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!variant || !r) return setError('Choose a product variant and a retailer.');
    if (!url.startsWith('https://')) return setError('URL must start with https://');
    const host = new URL(url).hostname;
    if (host !== r.domain && !host.endsWith(`.${r.domain}`)) return setError(`URL must be on ${r.domain}.`);
    const priceCents = price ? dollarsToCents(price) : undefined;
    const shipCents = shipping ? dollarsToCents(shipping) : 0;
    if (priceCents === null || shipCents === null) return setError('Prices must be dollar amounts like 179.99.');
    if (!checkPrice && !priceCents) return setError(`${r.name} shows prices, so a price is required.`);

    const record: OfferRecord = {
      retailer_slug: r.slug,
      url,
      price_cents: checkPrice ? undefined : priceCents,
      shipping_cents: shipCents,
      in_stock: inStock,
      available_sizes: sizes.split(',').map((s) => s.trim()).filter(Boolean),
      external_ref: ref.trim() || undefined,
      variant_id: variant.variantId,
    };
    setBusy(true);
    const { data, error } = await supabase.rpc('ingest_offers', { source: 'manual', records: [record] as never, dry_run: false });
    setBusy(false);
    const report = data as unknown as IngestReport | null;
    if (error || !report?.applied) return setError(error?.message ?? report?.errors.map((x) => x.message).join('; ') ?? 'Save failed');
    onDone(report.offers_created ? 'Offer added.' : 'Offer updated.');
  };

  return (
    <form className="card" style={{ marginTop: 12 }} onSubmit={save}>
      <strong>{editing ? 'Update offer' : 'Add offer'}</strong>
      <label className="field">
        Product variant
        {editing ? (
          <span>
            {variant?.brand} {variant?.productName} · {variant?.label}
          </span>
        ) : (
          <ProductPicker value={variant} onChange={setVariant} />
        )}
      </label>
      <div className="grid3">
        <label className="field">
          Retailer
          <select value={retailer} disabled={editing} onChange={(e) => setRetailer(e.target.value)}>
            <option value="">Choose…</option>
            {retailers.map((x) => (
              <option key={x.id} value={x.slug}>
                {x.name}
                {x.price_display_default === 'check_price' ? ' (check price)' : ''}
              </option>
            ))}
          </select>
        </label>
        <label className="field" style={{ gridColumn: 'span 2' }}>
          Product URL {r ? `(on ${r.domain})` : ''}
          <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://" />
        </label>
        <label className="field">
          Price (USD)
          <input className="num" value={checkPrice ? '' : price} disabled={checkPrice} placeholder={checkPrice ? 'Shown at retailer (D1)' : '179.99'} onChange={(e) => setPrice(e.target.value)} />
        </label>
        <label className="field">
          Shipping (USD)
          <input className="num" value={shipping} onChange={(e) => setShipping(e.target.value)} placeholder="0" />
        </label>
        <label className="field">
          External ref (optional)
          <input value={ref} disabled={editing} onChange={(e) => setRef(e.target.value)} placeholder="SKU or listing id" />
        </label>
        <label className="field" style={{ gridColumn: 'span 2' }}>
          Sizes in stock (comma-separated, shoes)
          <input value={sizes} onChange={(e) => setSizes(e.target.value)} placeholder="9, 9.5, 10" />
        </label>
        <label className="row" style={{ alignSelf: 'end' }}>
          <input type="checkbox" checked={inStock} onChange={(e) => setInStock(e.target.checked)} /> In stock
        </label>
      </div>
      {error && <div className="notice error">{error}</div>}
      <div className="row">
        <span className="grow" />
        <button type="button" className="btn" onClick={onCancel}>
          Cancel
        </button>
        <button className="btn primary" disabled={busy}>
          {busy ? 'Saving…' : 'Save'}
        </button>
      </div>
    </form>
  );
}

function OfferImport() {
  const [records, setRecords] = useState<OfferRecord[] | null>(null);
  const [issues, setIssues] = useState<{ line: number; message: string }[]>([]);
  const [report, setReport] = useState<IngestReport | null>(null);
  const [busy, setBusy] = useState(false);

  const pick = async (file: File | undefined) => {
    setReport(null);
    if (!file) return setRecords(null);
    const built = buildOfferRecords(await file.text());
    setIssues(built.issues);
    setRecords(built.issues.length ? null : built.records);
  };
  const run = async (dryRun: boolean) => {
    if (!records) return;
    setBusy(true);
    const { data, error } = await supabase.rpc('ingest_offers', { source: 'csv', records: records as never, dry_run: dryRun });
    setBusy(false);
    setReport(error ? { applied: false, dry_run: dryRun, matched: 0, unmatched: 0, offers_created: 0, offers_updated: 0, errors: [{ row: 0, message: error.message }], queued: [] } : (data as unknown as IngestReport));
  };

  return (
    <div className="card" style={{ marginTop: 24 }}>
      <strong>Import offers from CSV</strong>
      <p className="muted" style={{ margin: 0 }}>
        Columns: retailer_slug, url, price_usd, shipping_usd, in_stock, available_sizes (|-separated), external_ref, product_slug, variant_label, title, brand, gtin, upc, ean, asin, mpn, retailer_sku. Rows
        without a product_slug or known identifier go to the review queue.
      </p>
      <input type="file" accept=".csv,text/csv" onChange={(e) => pick(e.target.files?.[0])} />
      {issues.map((i) => (
        <div key={i.line} className="notice error">
          Line {i.line}: {i.message}
        </div>
      ))}
      {records && (
        <div className="row">
          <span className="grow">{records.length} rows parsed</span>
          <button className="btn" disabled={busy} onClick={() => run(true)}>
            Dry run
          </button>
          <button className="btn primary" disabled={busy || !report?.dry_run || report.errors.length > 0} onClick={() => run(false)}>
            Apply
          </button>
        </div>
      )}
      {report && (
        <div className="notice">
          <strong>{report.applied ? 'Applied' : report.dry_run ? 'Dry run — nothing written' : 'Not applied — nothing written'}</strong> · matched {report.matched} · to review {report.unmatched} · created{' '}
          {report.offers_created} · updated {report.offers_updated}
          {report.errors.map((e, i) => (
            <div key={i}>
              Row {e.row}: {e.message}
            </div>
          ))}
          {report.applied && report.unmatched > 0 && (
            <div>
              <a href="#/review" onClick={() => go('review')}>
                Open the review queue →
              </a>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
