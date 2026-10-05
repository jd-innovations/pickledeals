import { dollarsToCents, formatAgo } from '@pickledeals/shared';
import { useCallback, useEffect, useRef, useState } from 'react';

import { useNotice } from '../lib/ops';
import { supabase } from '../lib/supabase';

type Report = {
  ok?: boolean;
  rows?: number;
  matched?: number;
  unmatched?: number;
  already_queued?: number;
  learned?: number;
  identifier_conflicts?: number;
  error_count?: number;
  deactivated?: number;
  offers_created?: number;
  offers_updated?: number;
};
type Source = {
  slug: string;
  name: string;
  kind: 'feed' | 'api';
  retailer_name: string | null;
  is_active: boolean;
  interval_minutes: number | null;
  max_age_minutes: number | null;
  config: {
    adapter?: string;
    url_env?: string;
    complete?: boolean;
    columns?: Record<string, string[]>;
    max_requests?: number;
    // Shopify stores
    mode?: 'storefront' | 'public';
    store_url?: string;
    domain_env?: string;
    token_env?: string;
    shipping?: { flat_cents?: number | null; free_over_cents?: number | null };
  };
  next_run_at: string | null;
  running_since: string | null;
  last_started_at: string | null;
  last_success_at: string | null;
  last_error: string | null;
  consecutive_failures: number;
  active_offers: number;
  priced_offers: number;
  stale_offers: number;
  last_run: { id: string; created_at: string; report: Report } | null;
};
type VendorAlias = { vendor_key: string; created_at: string; brand: { name: string } | null };
type Learned = {
  id: string;
  kind: string;
  value: string;
  retailer_name: string | null;
  product_name: string;
  product_slug: string;
  variant_label: string;
  source: string;
  created_at: string;
};

const FIELDS: [string, string][] = [
  ['external_ref', 'SKU (required)'],
  ['price', 'Price (required)'],
  ['sale_price', 'Sale price'],
  ['url', 'Product URL'],
  ['buy_link', 'Buy link (click URL is unwrapped)'],
  ['title', 'Product name'],
  ['brand', 'Brand'],
  ['upc', 'UPC'],
  ['gtin', 'GTIN / EAN'],
  ['mpn', 'Manufacturer part number'],
  ['in_stock', 'In stock'],
  ['shipping', 'Shipping'],
];

const centsText = (c: number | null | undefined) => (c == null ? '' : (c / 100).toFixed(2).replace(/.00$/, ''));

const every = (m: number | null) => (m == null ? 'manual only' : m % 60 === 0 ? `every ${m / 60} h` : `every ${m} min`);

function status(s: Source): { text: string; on: boolean } {
  if (!s.is_active) return { text: 'off', on: false };
  if (s.running_since) return { text: 'running…', on: true };
  if (s.consecutive_failures > 0) return { text: `failing (${s.consecutive_failures})`, on: false };
  if (!s.last_success_at) return { text: 'never run', on: false };
  return { text: 'healthy', on: true };
}

/**
 * Automated offer sources (§9, Phase 12). The scheduler runs each source on its interval through the
 * same matcher as manual entry; unmatched items land in the review queue once, and exact matches teach
 * the catalog new identifiers. Credentials and feed URLs are Edge Function secrets, never stored here.
 */
export function IntegrationsPage() {
  const [rows, setRows] = useState<Source[]>([]);
  const [learned, setLearned] = useState<Learned[]>([]);
  const [aliases, setAliases] = useState<VendorAlias[]>([]);
  const [editing, setEditing] = useState<string | null>(null);
  const { report, view } = useNotice();
  const polling = useRef<number | null>(null);

  const load = useCallback(async () => {
    const [s, l] = await Promise.all([supabase.rpc('staff_integrations'), supabase.rpc('staff_learned_identifiers', { max_rows: 50 })]);
    if (s.error) report(s.error, '');
    setRows((s.data ?? []) as Source[]);
    setLearned((l.data ?? []) as Learned[]);
    const a = await supabase.from('brand_vendor_aliases').select('vendor_key, created_at, brand:brands(name)').order('vendor_key').returns<VendorAlias[]>();
    setAliases(a.data ?? []);
    return (s.data ?? []) as Source[];
  }, [report]);
  useEffect(() => {
    load();
    return () => {
      if (polling.current) window.clearInterval(polling.current);
    };
  }, [load]);

  const runNow = async (s: Source) => {
    const { error } = await supabase.rpc('request_ingestion_run', { source_slug: s.slug });
    report(error, `Started ${s.name}. This page refreshes until it finishes.`);
    if (error) return;
    const started = Date.now();
    if (polling.current) window.clearInterval(polling.current);
    polling.current = window.setInterval(async () => {
      const fresh = await load();
      const row = fresh.find((x) => x.slug === s.slug);
      const done = row && !row.running_since && row.last_started_at && new Date(row.last_started_at).getTime() >= started - 5000;
      if (done || Date.now() - started > 180_000) {
        window.clearInterval(polling.current!);
        polling.current = null;
        if (done) report(null, row!.consecutive_failures ? `${s.name} failed: ${row!.last_error ?? 'see the message below'}` : `${s.name} finished.`);
      }
    }, 3000);
  };

  const toggle = async (s: Source, on: boolean) => {
    const { error } = await supabase
      .from('ingestion_sources')
      .update({ is_active: on, ...(on ? { next_run_at: new Date().toISOString() } : {}) })
      .eq('slug', s.slug);
    report(error, on ? `${s.name} is on. It runs within 5 minutes.` : `${s.name} is off.`);
    load();
  };

  const forgetAlias = async (a: VendorAlias) => {
    if (!confirm(`Forget the vendor name “${a.vendor_key}”? New imports will fall back to matching it by brand name.`)) return;
    const { error } = await supabase.from('brand_vendor_aliases').delete().eq('vendor_key', a.vendor_key);
    report(error, `Forgot “${a.vendor_key}”.`);
    load();
  };

  const forget = async (l: Learned) => {
    if (!confirm(`Forget ${l.kind.toUpperCase()} ${l.value} for ${l.product_name} ${l.variant_label}? Imports with it will go to the review queue again.`))
      return;
    const { error } = await supabase.from('product_identifiers').delete().eq('id', l.id);
    report(error, `Forgot ${l.kind.toUpperCase()} ${l.value}.`);
    load();
  };

  return (
    <>
      <h1>Integrations</h1>
      <p className="muted">
        Automated prices from APIs and affiliate datafeeds. Each source runs on its schedule; offers it hasn’t refreshed within its freshness window stop
        showing a price (API) or are hidden (feed).
      </p>
      {view}
      <div style={{ display: 'grid', gap: 12, marginTop: 12 }}>
        {rows
          .filter((s) => s.kind === 'feed' || s.kind === 'api')
          .map((s) => {
            const st = status(s);
            const r = s.last_run?.report;
            return (
              <div key={s.slug} className="card">
                <div className="row">
                  <div className="grow">
                    <strong>{s.name}</strong>{' '}
                    <span className="pill">{s.config.adapter === 'shopify' ? 'Shopify store' : s.kind === 'api' ? 'API' : 'datafeed'}</span>{' '}
                    <span className={`pill ${st.on ? 'dark' : ''}`}>{st.text}</span>
                    <div className="muted" style={{ fontSize: 12 }}>
                      {s.retailer_name ?? 'no retailer'} · {every(s.interval_minutes)} · prices expire after{' '}
                      {s.max_age_minutes ? every(s.max_age_minutes).replace('every ', '') : 'never'}
                      {s.last_success_at ? ` · last success ${formatAgo(s.last_success_at)}` : ''}
                      {s.is_active && s.next_run_at && !s.running_since
                        ? ` · next run ${new Date(s.next_run_at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`
                        : ''}
                    </div>
                  </div>
                  <label className="row" style={{ fontSize: 13 }}>
                    <input type="checkbox" checked={s.is_active} onChange={(e) => toggle(s, e.target.checked)} /> On
                  </label>
                  <button className="btn" disabled={!s.is_active || !!s.running_since} onClick={() => runNow(s)}>
                    Run now
                  </button>
                  <button className="btn" onClick={() => setEditing(editing === s.slug ? null : s.slug)}>
                    Settings
                  </button>
                </div>
                <div className="tiles">
                  <Tile n={s.active_offers} label="Active offers" />
                  <Tile n={s.priced_offers} label={s.kind === 'api' ? 'Showing a price' : 'With a price'} />
                  <Tile n={s.stale_offers} label="Past freshness window" alert={s.stale_offers > 0} />
                  {r && <Tile n={r.matched ?? 0} label={`Matched last run (of ${r.rows ?? '?'})`} />}
                  {r && <Tile n={r.unmatched ?? 0} label="New in review queue" alert={(r.unmatched ?? 0) > 0} href="#/review" />}
                  {r && <Tile n={r.learned ?? 0} label="Identifiers learned" />}
                </div>
                {r && (
                  <div className="muted" style={{ fontSize: 12 }}>
                    Last run {s.last_run ? formatAgo(s.last_run.created_at) : ''}: {r.offers_created ?? 0} offers created, {r.offers_updated ?? 0} updated,{' '}
                    {r.already_queued ?? 0} already waiting in review, {r.deactivated ?? 0} removed from the feed, {r.error_count ?? 0} row errors
                    {r.identifier_conflicts ? `, ${r.identifier_conflicts} identifier conflicts (not learned)` : ''}.
                  </div>
                )}
                {s.last_error && <div className={`notice ${s.consecutive_failures ? 'error' : ''}`}>{s.last_error}</div>}
                {s.kind === 'api' && (
                  <span className="muted" style={{ fontSize: 12 }}>
                    Amazon policy: prices come only from the API, show for at most 60 minutes after a refresh, are never kept as price history, and raw
                    responses are deleted after 24 hours.
                  </span>
                )}
                {editing === s.slug && <SourceSettings s={s} onSaved={(e, t) => (report(e, t), !e && setEditing(null), load())} />}
              </div>
            );
          })}
      </div>

      <h2>Vendor names</h2>
      <p className="muted">
        Store feeds name brands their own way (“EngagePickleball”). Names are remembered when you create a product from the review queue; others match a brand
        by its name. Stores sometimes list other brands’ items under their own name, so always check the brand in review.
      </p>
      {aliases.length === 0 ? (
        <p className="muted">None yet.</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Vendor name (normalized)</th>
              <th>Brand</th>
              <th>When</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {aliases.map((a) => (
              <tr key={a.vendor_key}>
                <td className="num">{a.vendor_key}</td>
                <td>{a.brand?.name}</td>
                <td className="muted">{formatAgo(a.created_at)}</td>
                <td>
                  <button className="btn danger" onClick={() => forgetAlias(a)}>
                    Forget
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <h2>Learned identifiers</h2>
      <p className="muted">
        Matched automatically (exact identifier or a previous match) or remembered from the review queue. A wrong one sends a retailer’s item to the wrong
        product; forget it to send that item back to review.
      </p>
      {learned.length === 0 ? (
        <p className="muted">None yet.</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Identifier</th>
              <th>Product</th>
              <th>From</th>
              <th>When</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {learned.map((l) => (
              <tr key={l.id}>
                <td>
                  <span className="pill">{l.kind.toUpperCase()}</span> <span className="num">{l.value}</span>
                  {l.retailer_name && (
                    <div className="muted" style={{ fontSize: 12 }}>
                      at {l.retailer_name}
                    </div>
                  )}
                </td>
                <td>
                  <a href={`#/products/${encodeURIComponent(l.product_slug)}`}>{l.product_name}</a> <span className="muted">{l.variant_label}</span>
                </td>
                <td>{l.source === 'learned' ? 'automatic' : 'review queue'}</td>
                <td className="muted">{formatAgo(l.created_at)}</td>
                <td>
                  <button className="btn danger" onClick={() => forget(l)}>
                    Forget
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}

function Tile({ n, label, alert, href }: { n: number; label: string; alert?: boolean; href?: string }) {
  const body = (
    <>
      <span className="tile-n num" style={{ fontSize: 22 }}>
        {n}
      </span>
      <span className="muted">{label}</span>
    </>
  );
  return href ? (
    <a className={`tile ${alert ? 'alert' : ''}`} href={href}>
      {body}
    </a>
  ) : (
    <div className={`tile ${alert ? 'alert' : ''}`}>{body}</div>
  );
}

function SourceSettings({ s, onSaved }: { s: Source; onSaved: (e: { message: string } | null, t: string) => void }) {
  const [interval, setInterval_] = useState(String(s.interval_minutes ?? ''));
  const [maxAge, setMaxAge] = useState(String(s.max_age_minutes ?? ''));
  const [complete, setComplete] = useState(!!s.config.complete);
  const [maxRequests, setMaxRequests] = useState(String(s.config.max_requests ?? 60));
  const [columns, setColumns] = useState<Record<string, string>>(Object.fromEntries(FIELDS.map(([k]) => [k, (s.config.columns?.[k] ?? []).join(', ')])));
  const shopify = s.config.adapter === 'shopify';
  const [mode, setMode] = useState(s.config.mode ?? 'storefront');
  const [flat, setFlat] = useState(centsText(s.config.shipping?.flat_cents));
  const [freeOver, setFreeOver] = useState(centsText(s.config.shipping?.free_over_cents));

  const save = async () => {
    const config = { ...s.config };
    if (shopify) {
      config.complete = complete;
      config.mode = mode;
      config.shipping = { flat_cents: dollarsToCents(flat) ?? 0, free_over_cents: freeOver.trim() ? dollarsToCents(freeOver) : null };
    } else if (s.kind === 'feed') {
      config.complete = complete;
      config.columns = Object.fromEntries(
        Object.entries(columns)
          .map(
            ([k, v]) =>
              [
                k,
                v
                  .split(',')
                  .map((x) => x.trim())
                  .filter(Boolean),
              ] as const,
          )
          .filter(([, v]) => v.length),
      );
    } else config.max_requests = Number(maxRequests) || 60;
    const { error } = await supabase
      .from('ingestion_sources')
      .update({ interval_minutes: interval ? Number(interval) : null, max_age_minutes: maxAge ? Number(maxAge) : null, config })
      .eq('slug', s.slug);
    const friendly =
      error && error.message.includes('api_hourly')
        ? { message: 'API prices must expire within 60 minutes (Amazon requires hourly refreshes when prices show without a timestamp).' }
        : error && error.message.includes('check')
          ? { message: 'Schedule must be 5 minutes to 7 days; freshness 15 minutes to 14 days.' }
          : error;
    onSaved(friendly, `Saved ${s.name}.`);
  };

  return (
    <div className="card" style={{ background: 'var(--background)' }}>
      <div className="grid3">
        <label className="field">
          Run every (minutes, blank = manual)
          <input className="num" value={interval} onChange={(e) => setInterval_(e.target.value.replace(/\D/g, ''))} />
        </label>
        <label className="field">
          Prices expire after (minutes)
          <input className="num" value={maxAge} onChange={(e) => setMaxAge(e.target.value.replace(/\D/g, ''))} />
        </label>
        {shopify ? (
          <label className="field">
            Source
            <select value={mode} onChange={(e) => setMode(e.target.value as 'storefront' | 'public')}>
              <option value="storefront">Storefront API (products in the PickleDeals channel)</option>
              <option value="public">Public product data (whole store, stopgap)</option>
            </select>
          </label>
        ) : s.kind === 'api' ? (
          <label className="field">
            Max requests per run (10 items each, 1/second)
            <input className="num" value={maxRequests} onChange={(e) => setMaxRequests(e.target.value.replace(/\D/g, ''))} />
          </label>
        ) : (
          <label className="field">
            Feed URL secret (Edge Function env)
            <input value={s.config.url_env ?? ''} disabled />
          </label>
        )}
      </div>
      {shopify && (
        <>
          <div className="grid3">
            <label className="field">
              Shipping per order ($, 0 = free)
              <input className="num" value={flat} onChange={(e) => setFlat(e.target.value)} />
            </label>
            <label className="field">
              Free shipping from ($, blank = never)
              <input className="num" value={freeOver} onChange={(e) => setFreeOver(e.target.value)} />
            </label>
            <label className="field">
              Secrets (Edge Function env)
              <input value={`${s.config.domain_env ?? ''}, ${s.config.token_env ?? ''}`} disabled />
            </label>
          </div>
          <label className="row" style={{ fontSize: 13 }}>
            <input type="checkbox" checked={complete} onChange={(e) => setComplete(e.target.checked)} /> Full catalog: hide this store’s offers for products it
            no longer lists
          </label>
          <span className="muted" style={{ fontSize: 12 }}>
            Links go to {s.config.store_url} with utm_source=pickledeals. Shopify’s compare-at price is never shown as a “was” price.
          </span>
        </>
      )}
      {s.kind === 'feed' && !shopify && (
        <>
          <label className="row" style={{ fontSize: 13 }}>
            <input type="checkbox" checked={complete} onChange={(e) => setComplete(e.target.checked)} /> Full feed: hide this source’s offers that disappear
            from it (skipped if the feed looks truncated)
          </label>
          <strong style={{ fontSize: 13 }}>Columns (comma-separated header names to try, case-insensitive)</strong>
          <div className="grid3">
            {FIELDS.map(([k, label]) => (
              <label key={k} className="field">
                {label}
                <input value={columns[k] ?? ''} onChange={(e) => setColumns({ ...columns, [k]: e.target.value })} />
              </label>
            ))}
          </div>
        </>
      )}
      <div className="row">
        <span className="grow" />
        <button className="btn primary" onClick={save}>
          Save settings
        </button>
      </div>
    </div>
  );
}
