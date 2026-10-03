import { dollarsToCents, formatAgo, formatPrice } from '@pickledeals/shared';
import { useCallback, useEffect, useState, type FormEvent } from 'react';

import { supabase } from '../lib/supabase';
import { ProductPicker, type PickedVariant } from './ProductPicker';

type Retailer = { id: string; slug: string; name: string };
type Category = { id: string; name: string };
type Promo = {
  id: string;
  retailer_id: string;
  terms: string | null;
  verified_by: string | null;
  code: string;
  title: string;
  discount_type: 'percent' | 'amount' | 'free_ship';
  discount_value: number;
  min_purchase_cents: number;
  starts_at: string | null;
  ends_at: string | null;
  verified_at: string | null;
  is_exclusive: boolean;
  status: 'active' | 'removed';
  retailer: { name: string } | null;
  targets: { category_id: string | null; product: { name: string; slug: string } | null; category: { name: string } | null; variant: { label: string } | null }[];
};

const STALE_DAYS = 14;

/** Active and not ended, and either hidden for want of a check or going stale within 3 days. */
function needsVerification(p: Promo): boolean {
  if (p.status !== 'active' || (p.ends_at && new Date(p.ends_at).getTime() <= Date.now())) return false;
  return !p.verified_at || Date.now() - new Date(p.verified_at).getTime() > (STALE_DAYS - 3) * 86_400_000;
}

/** Mirrors promo_is_live(): active, in its dates, verified within 14 days (§9). */
function liveState(p: Promo): { live: boolean; reason: string } {
  const now = Date.now();
  if (p.status !== 'active') return { live: false, reason: 'removed' };
  if (!p.verified_at) return { live: false, reason: 'never verified' };
  if (now - new Date(p.verified_at).getTime() > STALE_DAYS * 86_400_000) return { live: false, reason: `stale (verified ${formatAgo(p.verified_at)})` };
  if (p.starts_at && new Date(p.starts_at).getTime() > now) return { live: false, reason: 'not started' };
  if (p.ends_at && new Date(p.ends_at).getTime() <= now) return { live: false, reason: 'ended' };
  return { live: true, reason: `verified ${formatAgo(p.verified_at)}` };
}

const describe = (p: Promo) =>
  p.discount_type === 'percent' ? `${p.discount_value}% off` : p.discount_type === 'amount' ? `${formatPrice(p.discount_value)} off` : 'Free shipping';

/**
 * Promo codes. A code only affects prices while it's live; verifying it (checking it works at the
 * retailer) restarts the 14-day window. Percent discounts round the saving down.
 */
export function PromosPage() {
  const [rows, setRows] = useState<Promo[]>([]);
  const [retailers, setRetailers] = useState<Retailer[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<Promo | null>(null);
  const [filter, setFilter] = useState<'all' | 'verify' | 'live' | 'hidden'>('all');
  const [names, setNames] = useState<Map<string, string>>(new Map());
  const [message, setMessage] = useState<{ error: boolean; text: string } | null>(null);

  const load = useCallback(async () => {
    const { data, error } = await supabase
      .from('promo_codes')
      .select(
        'id, retailer_id, terms, verified_by, code, title, discount_type, discount_value, min_purchase_cents, starts_at, ends_at, verified_at, is_exclusive, status, retailer:retailers(name), targets:promo_code_targets(category_id, product:products(name, slug), category:categories(name), variant:product_variants(label))',
      )
      .order('created_at', { ascending: false })
      .returns<Promo[]>();
    if (error) setMessage({ error: true, text: error.message });
    setRows(data ?? []);
    const ids = [...new Set((data ?? []).map((p) => p.verified_by).filter((x): x is string => !!x))];
    if (ids.length) {
      const { data: people } = await supabase.from('profiles').select('id, display_name').in('id', ids);
      setNames(new Map((people ?? []).map((p) => [p.id, p.display_name])));
    }
  }, []);
  useEffect(() => {
    load();
    supabase.from('retailers').select('id, slug, name').order('name').then(({ data }) => setRetailers(data ?? []));
    supabase.from('categories').select('id, name').order('sort').then(({ data }) => setCategories(data ?? []));
  }, [load]);

  const update = async (p: Promo, patch: Partial<Pick<Promo, 'verified_at' | 'status'>>, text: string) => {
    const { error } = await supabase.from('promo_codes').update(patch).eq('id', p.id);
    setMessage(error ? { error: true, text: error.message } : { error: false, text });
    load();
  };

  return (
    <>
      <div className="row">
        <h1 className="grow">Promo codes</h1>
        <button className="btn primary" onClick={() => setCreating(true)}>
          New code
        </button>
      </div>
      <p className="muted">Only live codes change prices in the app. “Verify” means you checked the code works at the retailer today; codes hide 14 days after their last check.</p>
      <div className="tabs">
        {(
          [
            ['all', 'All'],
            ['verify', `Needs verification (${rows.filter(needsVerification).length})`],
            ['live', 'Live'],
            ['hidden', 'Hidden'],
          ] as const
        ).map(([k, label]) => (
          <button key={k} className={`btn ${filter === k ? 'primary' : ''}`} onClick={() => setFilter(k)}>
            {label}
          </button>
        ))}
      </div>
      {message && <div className={`notice ${message.error ? 'error' : ''}`}>{message.text}</div>}
      {(creating || editing) && (
        <PromoForm
          key={editing?.id ?? 'new'}
          promo={editing}
          retailers={retailers}
          categories={categories}
          onCancel={() => {
            setCreating(false);
            setEditing(null);
          }}
          onDone={(text) => {
            setCreating(false);
            setEditing(null);
            setMessage({ error: false, text });
            load();
          }}
        />
      )}
      <table style={{ marginTop: 12 }}>
        <thead>
          <tr>
            <th>Code</th>
            <th>Retailer</th>
            <th>Discount</th>
            <th>Applies to</th>
            <th>Ends</th>
            <th>State</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {rows
            .filter((p) => (filter === 'verify' ? needsVerification(p) : filter === 'live' ? liveState(p).live : filter === 'hidden' ? !liveState(p).live : true))
            .sort((a, b) => (filter === 'verify' ? new Date(a.verified_at ?? 0).getTime() - new Date(b.verified_at ?? 0).getTime() : 0))
            .map((p) => {
            const state = liveState(p);
            const target = p.targets.map((t) => t.product?.name ?? t.category?.name ?? t.variant?.label).filter(Boolean).join(', ') || 'Sitewide';
            return (
              <tr key={p.id}>
                <td>
                  <strong style={{ fontFamily: 'Menlo, monospace' }}>{p.code}</strong>
                  <div className="muted" style={{ fontSize: 12 }}>
                    {p.title}
                    {p.is_exclusive ? ' · exclusive' : ''}
                  </div>
                </td>
                <td>{p.retailer?.name}</td>
                <td className="num">
                  {describe(p)}
                  {p.min_purchase_cents ? <div className="muted">over {formatPrice(p.min_purchase_cents)}</div> : null}
                </td>
                <td>{target}</td>
                <td className="muted">{p.ends_at ? new Date(p.ends_at).toLocaleDateString() : '—'}</td>
                <td>
                  <span className={`pill ${state.live ? 'dark' : ''}`}>{state.live ? 'live' : 'hidden'}</span>
                  <div className="muted" style={{ fontSize: 12 }}>
                    {state.reason}
                    {p.verified_by && names.get(p.verified_by) ? ` by ${names.get(p.verified_by)}` : ''}
                  </div>
                </td>
                <td>
                  <div className="row">
                    {p.status === 'active' && (
                      <button className="btn" onClick={() => update(p, { verified_at: new Date().toISOString() }, `Verified ${p.code}.`)}>
                        Verify now
                      </button>
                    )}
                    <button className="btn" onClick={() => setEditing(p)}>
                      Edit
                    </button>
                    <button className="btn danger" onClick={() => update(p, { status: p.status === 'active' ? 'removed' : 'active' }, `${p.status === 'active' ? 'Removed' : 'Restored'} ${p.code}.`)}>
                      {p.status === 'active' ? 'Remove' : 'Restore'}
                    </button>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </>
  );
}

const centsToInput = (c: number) => (c / 100).toFixed(2).replace(/\.00$/, '');

function PromoForm({
  promo,
  retailers,
  categories,
  onDone,
  onCancel,
}: {
  promo: Promo | null;
  retailers: Retailer[];
  categories: Category[];
  onDone: (m: string) => void;
  onCancel: () => void;
}) {
  const target = promo?.targets[0];
  const [f, setF] = useState(
    promo
      ? {
          retailer: promo.retailer_id,
          code: promo.code,
          title: promo.title,
          type: promo.discount_type,
          value: promo.discount_type === 'percent' ? String(promo.discount_value) : promo.discount_type === 'amount' ? centsToInput(promo.discount_value) : '',
          min: promo.min_purchase_cents ? centsToInput(promo.min_purchase_cents) : '',
          ends: promo.ends_at ? promo.ends_at.slice(0, 10) : '',
          exclusive: promo.is_exclusive,
          verified: false,
          terms: promo.terms ?? '',
        }
      : { retailer: '', code: '', title: '', type: 'percent' as Promo['discount_type'], value: '', min: '', ends: '', exclusive: false, verified: true, terms: '' },
  );
  const [targetKind, setTargetKind] = useState<'all' | 'product' | 'category'>(target?.product ? 'product' : target?.category_id ? 'category' : 'all');
  const [product, setProduct] = useState<PickedVariant | null>(
    target?.product ? { variantId: '', label: '', productSlug: target.product.slug, productName: target.product.name, brand: '' } : null,
  );
  const [category, setCategory] = useState(target?.category_id ?? '');
  const [error, setError] = useState<string | null>(null);

  const save = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    const value = f.type === 'percent' ? Number(f.value) : f.type === 'amount' ? dollarsToCents(f.value) : 1;
    const min = f.min ? dollarsToCents(f.min) : 0;
    if (!f.retailer || !/^[A-Za-z0-9_-]{2,40}$/.test(f.code) || f.title.trim().length < 2) return setError('Retailer, a code (letters, digits, - or _) and a title are required.');
    if (!value || value < 1 || (f.type === 'percent' && value > 90)) return setError(f.type === 'percent' ? 'Percent must be 1–90.' : 'Enter the discount in dollars.');
    if (min === null) return setError('Minimum purchase must be a dollar amount.');
    if (targetKind === 'product' && !product) return setError('Choose the product this code applies to.');
    if (targetKind === 'category' && !category) return setError('Choose the category this code applies to.');

    const fields = {
      retailer_id: f.retailer,
      code: f.code.toUpperCase(),
      title: f.title.trim(),
      discount_type: f.type,
      discount_value: value,
      min_purchase_cents: min,
      ends_at: f.ends ? new Date(`${f.ends}T23:59:59`).toISOString() : null,
      is_exclusive: f.exclusive,
      terms: f.terms.trim() || null,
      // Editing never un-verifies; ticking the box re-verifies.
      ...(f.verified || !promo ? { verified_at: f.verified ? new Date().toISOString() : null } : {}),
    };
    let promoId: string;
    if (promo) {
      const { error: updateError } = await supabase.from('promo_codes').update(fields).eq('id', promo.id);
      if (updateError) return setError(updateError.message);
      const { error: clearError } = await supabase.from('promo_code_targets').delete().eq('promo_id', promo.id);
      if (clearError) return setError(clearError.message);
      promoId = promo.id;
    } else {
      const { data: user } = await supabase.auth.getUser();
      const { data: created, error: insertError } = await supabase
        .from('promo_codes')
        .insert({ ...fields, created_by: user.user?.id ?? null })
        .select('id')
        .single();
      if (insertError) return setError(insertError.message);
      promoId = created.id;
    }

    if (targetKind !== 'all') {
      const target: { promo_id: string; category_id?: string; product_id?: string } = { promo_id: promoId };
      if (targetKind === 'category') target.category_id = category;
      else target.product_id = (await supabase.from('products').select('id').eq('slug', product!.productSlug).single()).data!.id;
      const { error: targetError } = await supabase.from('promo_code_targets').insert(target);
      if (targetError) return setError(`Code saved, but its target failed: ${targetError.message}`);
    }
    onDone(promo ? `Saved ${f.code.toUpperCase()}.` : `Added ${f.code.toUpperCase()}${f.verified ? ' (live)' : ' (hidden until verified)'}.`);
  };

  return (
    <form className="card" style={{ marginTop: 12 }} onSubmit={save}>
      <strong>{promo ? `Edit ${promo.code}` : 'New promo code'}</strong>
      <div className="grid3">
        <label className="field">
          Retailer
          <select value={f.retailer} onChange={(e) => setF({ ...f, retailer: e.target.value })}>
            <option value="">Choose…</option>
            {retailers.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          Code
          <input value={f.code} onChange={(e) => setF({ ...f, code: e.target.value })} placeholder="DINK15" style={{ fontFamily: 'Menlo, monospace' }} />
        </label>
        <label className="field">
          Title (shown in the app)
          <input value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} placeholder="15% off sitewide" />
        </label>
        <label className="field">
          Discount
          <select value={f.type} onChange={(e) => setF({ ...f, type: e.target.value as Promo['discount_type'] })}>
            <option value="percent">Percent off</option>
            <option value="amount">Amount off</option>
            <option value="free_ship">Free shipping</option>
          </select>
        </label>
        <label className="field">
          {f.type === 'percent' ? 'Percent (1–90)' : f.type === 'amount' ? 'Amount (USD)' : 'Value'}
          <input className="num" value={f.type === 'free_ship' ? '' : f.value} disabled={f.type === 'free_ship'} onChange={(e) => setF({ ...f, value: e.target.value })} />
        </label>
        <label className="field">
          Minimum purchase (USD, optional)
          <input className="num" value={f.min} onChange={(e) => setF({ ...f, min: e.target.value })} />
        </label>
        <label className="field">
          Ends (optional)
          <input type="date" value={f.ends} onChange={(e) => setF({ ...f, ends: e.target.value })} />
        </label>
        <label className="field">
          Applies to
          <select value={targetKind} onChange={(e) => setTargetKind(e.target.value as typeof targetKind)}>
            <option value="all">Sitewide</option>
            <option value="product">One product</option>
            <option value="category">One category</option>
          </select>
        </label>
        {targetKind === 'category' && (
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
        )}
      </div>
      {targetKind === 'product' && (
        <label className="field">
          Product
          <ProductPicker value={product} onChange={setProduct} />
        </label>
      )}
      <label className="field">
        Terms (optional)
        <input value={f.terms} onChange={(e) => setF({ ...f, terms: e.target.value })} placeholder="Excludes sale items" />
      </label>
      <div className="row">
        <label className="row">
          <input type="checkbox" checked={f.verified} onChange={(e) => setF({ ...f, verified: e.target.checked })} /> I checked this code works today{promo?.verified_at ? ` (last checked ${formatAgo(promo.verified_at)})` : ''}
        </label>
        <label className="row">
          <input type="checkbox" checked={f.exclusive} onChange={(e) => setF({ ...f, exclusive: e.target.checked })} /> PickleDeals exclusive
        </label>
        <span className="grow" />
        <button type="button" className="btn" onClick={onCancel}>
          Cancel
        </button>
        <button className="btn primary">Save</button>
      </div>
      {error && <div className="notice error">{error}</div>}
    </form>
  );
}
