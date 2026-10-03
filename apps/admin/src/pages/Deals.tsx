import { formatPrice } from '@pickledeals/shared';
import { useCallback, useEffect, useState, type FormEvent } from 'react';

import { supabase } from '../lib/supabase';
import { ProductPicker, type PickedVariant } from './ProductPicker';

type FeedRow = {
  deal_id: string;
  kind: string;
  origin: 'auto' | 'curated';
  headline: string;
  is_staff_pick: boolean;
  product_name: string;
  brand_name: string;
  variant_label: string;
  retailer_name: string;
  price_cents: number | null;
  discount_pct: number | null;
  badges: string[];
  ends_at: string | null;
};

/**
 * Deals. Auto deals come from prices (codes, drops vs typical, sales vs MSRP) and update themselves;
 * staff can pick, end, or curate. Curated deals still show live prices — headlines can't invent them.
 */
export function DealsPage() {
  const [rows, setRows] = useState<FeedRow[]>([]);
  const [creating, setCreating] = useState(false);
  const [message, setMessage] = useState<{ error: boolean; text: string } | null>(null);

  const load = useCallback(async () => {
    const { data, error } = await supabase.from('deal_feed').select('deal_id, kind, origin, headline, is_staff_pick, product_name, brand_name, variant_label, retailer_name, price_cents, discount_pct, badges, ends_at').order('score', { ascending: false });
    if (error) setMessage({ error: true, text: error.message });
    setRows((data as FeedRow[]) ?? []);
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  const update = async (id: string, patch: { is_staff_pick?: boolean; status?: 'removed' }, text: string) => {
    const { error } = await supabase.from('deals').update(patch).eq('id', id);
    setMessage(error ? { error: true, text: error.message } : { error: false, text });
    load();
  };

  return (
    <>
      <div className="row">
        <h1 className="grow">Live deals</h1>
        <button className="btn primary" onClick={() => setCreating(true)}>
          Curate a deal
        </button>
      </div>
      <p className="muted">Automatic deals refresh whenever prices or codes change (and every 30 minutes). Removing one hides it until the next new episode.</p>
      {message && <div className={`notice ${message.error ? 'error' : ''}`}>{message.text}</div>}
      {creating && (
        <CurateForm
          onCancel={() => setCreating(false)}
          onDone={(t) => {
            setCreating(false);
            setMessage({ error: false, text: t });
            load();
          }}
        />
      )}
      <table style={{ marginTop: 12 }}>
        <thead>
          <tr>
            <th>Deal</th>
            <th>Type</th>
            <th>Price</th>
            <th>Badges</th>
            <th>Staff pick</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {rows.map((d) => (
            <tr key={d.deal_id}>
              <td>
                <strong>
                  {d.brand_name} {d.product_name}
                </strong>{' '}
                <span className="muted">{d.variant_label}</span>
                <div className="muted" style={{ fontSize: 12 }}>
                  {d.headline} · {d.retailer_name}
                </div>
              </td>
              <td>
                <span className="pill">{d.origin === 'curated' ? 'curated' : d.kind.replace('_', ' ')}</span>
              </td>
              <td className="num">
                {d.price_cents != null ? formatPrice(d.price_cents) : 'check price'}
                {d.discount_pct ? <div className="muted">−{d.discount_pct}%</div> : null}
              </td>
              <td className="muted" style={{ fontSize: 12 }}>
                {d.badges.join(', ') || '—'}
              </td>
              <td>
                <input type="checkbox" checked={d.is_staff_pick} onChange={(e) => update(d.deal_id, { is_staff_pick: e.target.checked }, e.target.checked ? 'Marked as staff pick.' : 'Removed staff pick.')} />
              </td>
              <td>
                <button className="btn danger" onClick={() => confirm('Remove this deal from the app?') && update(d.deal_id, { status: 'removed' }, 'Deal removed.')}>
                  Remove
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}

function CurateForm({ onDone, onCancel }: { onDone: (t: string) => void; onCancel: () => void }) {
  const [variant, setVariant] = useState<PickedVariant | null>(null);
  const [headline, setHeadline] = useState('');
  const [ends, setEnds] = useState('');
  const [pick, setPick] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const save = async (e: FormEvent) => {
    e.preventDefault();
    if (!variant || headline.trim().length < 2) return setError('Choose a variant and write a headline.');
    const { data: user } = await supabase.auth.getUser();
    const { error } = await supabase.from('deals').insert({
      variant_id: variant.variantId,
      kind: 'editorial',
      origin: 'curated',
      headline: headline.trim(),
      is_staff_pick: pick,
      ends_at: ends ? new Date(`${ends}T23:59:59`).toISOString() : null,
      created_by: user.user?.id ?? null,
    });
    if (error) return setError(error.message);
    onDone(`Curated ${variant.productName}. It uses the variant’s current best offer.`);
  };

  return (
    <form className="card" style={{ marginTop: 12 }} onSubmit={save}>
      <strong>Curate a deal</strong>
      <label className="field">
        Product variant (needs at least one retailer offer to appear)
        <ProductPicker value={variant} onChange={setVariant} />
      </label>
      <div className="grid3">
        <label className="field" style={{ gridColumn: 'span 2' }}>
          Headline
          <input value={headline} onChange={(e) => setHeadline(e.target.value)} maxLength={90} placeholder="Our favourite control paddle under $200" />
        </label>
        <label className="field">
          Ends (optional)
          <input type="date" value={ends} onChange={(e) => setEnds(e.target.value)} />
        </label>
      </div>
      <div className="row">
        <label className="row">
          <input type="checkbox" checked={pick} onChange={(e) => setPick(e.target.checked)} /> Staff pick (leads the home feed)
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
