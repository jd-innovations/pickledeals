import { slugify, SLUG_PATTERN } from '@pickledeals/shared';
import { useCallback, useEffect, useState } from 'react';

import { useNotice } from '../lib/ops';
import { supabase } from '../lib/supabase';
import { ProductPicker, type PickedVariant } from './ProductPicker';

type Item = { id: string; sort: number; product: { name: string; slug: string } | null; deal: { headline: string; status: string } | null };
type Collection = {
  id: string;
  slug: string;
  title: string;
  subtitle: string | null;
  eyebrow: string | null;
  sort: number;
  is_active: boolean;
  starts_at: string | null;
  ends_at: string | null;
  items: Item[];
};
type DealOption = { deal_id: string; product_name: string; brand_name: string; variant_label: string; headline: string };

const day = (iso: string | null) => (iso ? iso.slice(0, 10) : '');
const startOf = (d: string) => (d ? new Date(`${d}T00:00:00`).toISOString() : null);
const endOf = (d: string) => (d ? new Date(`${d}T23:59:59`).toISOString() : null);
type Report = (e: { message: string } | null, t: string) => void;

function scheduleText(c: Collection): string | null {
  const now = Date.now();
  if (c.starts_at && new Date(c.starts_at).getTime() > now) return `starts ${new Date(c.starts_at).toLocaleDateString()}`;
  if (c.ends_at && new Date(c.ends_at).getTime() <= now) return 'ended';
  if (c.ends_at) return `until ${new Date(c.ends_at).toLocaleDateString()}`;
  return null;
}

/**
 * Collections: editorial banners on Deals home, in this order, each with its live deals. Items are
 * products (their current deals appear automatically) or specific deals.
 */
export function CollectionsPage() {
  const [rows, setRows] = useState<Collection[]>([]);
  const [deals, setDeals] = useState<DealOption[]>([]);
  const [draft, setDraft] = useState({ title: '', eyebrow: 'STAFF PICKS', subtitle: '' });
  const { report, view } = useNotice();

  const load = useCallback(async () => {
    const [c, d] = await Promise.all([
      supabase
        .from('collections')
        .select('id, slug, title, subtitle, eyebrow, sort, is_active, starts_at, ends_at, items:collection_items(id, sort, product:products(name, slug), deal:deals(headline, status))')
        .eq('kind', 'editorial')
        .order('sort')
        .order('sort', { referencedTable: 'collection_items' }),
      supabase.from('deal_feed').select('deal_id, product_name, brand_name, variant_label, headline').order('score', { ascending: false }),
    ]);
    if (c.error) report(c.error, '');
    setRows((c.data as Collection[]) ?? []);
    setDeals((d.data as DealOption[]) ?? []);
  }, [report]);
  useEffect(() => {
    load();
  }, [load]);

  const create = async () => {
    const slug = slugify(draft.title);
    if (draft.title.trim().length < 2 || !SLUG_PATTERN.test(slug)) return report({ message: 'Give the collection a title.' }, '');
    const { error } = await supabase.from('collections').insert({ slug, title: draft.title.trim(), eyebrow: draft.eyebrow.trim() || null, subtitle: draft.subtitle.trim() || null, sort: rows.length });
    report(error, `Created ${draft.title}.`);
    if (!error) setDraft({ title: '', eyebrow: 'STAFF PICKS', subtitle: '' });
    load();
  };
  const move = async (i: number, dir: -1 | 1) => {
    const a = rows[i];
    const b = rows[i + dir];
    if (!a || !b) return;
    const [r1, r2] = await Promise.all([supabase.from('collections').update({ sort: i + dir }).eq('id', a.id), supabase.from('collections').update({ sort: i }).eq('id', b.id)]);
    report(r1.error ?? r2.error, 'Reordered.');
    load();
  };

  return (
    <>
      <h1>Collections</h1>
      <p className="muted">Each visible collection shows as a banner on Deals home, in this order. Add products (their current deals appear automatically) or specific deals.</p>
      {view}
      <div style={{ display: 'grid', gap: 12, marginTop: 12 }}>
        {rows.map((c, i) => (
          <CollectionCard key={c.id} c={c} deals={deals} first={i === 0} last={i === rows.length - 1} onMove={(dir) => move(i, dir)} report={(e, t) => (report(e, t), load())} />
        ))}
      </div>
      <div className="card" style={{ marginTop: 12 }}>
        <strong>New collection</strong>
        <div className="grid3">
          <input placeholder="Title (Court shoes on sale)" value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} />
          <input placeholder="Eyebrow (STAFF PICKS · UPDATED DAILY)" value={draft.eyebrow} onChange={(e) => setDraft({ ...draft, eyebrow: e.target.value })} />
          <input placeholder="Subtitle (optional)" value={draft.subtitle} onChange={(e) => setDraft({ ...draft, subtitle: e.target.value })} />
        </div>
        <div className="row">
          <span className="grow" />
          <button className="btn primary" onClick={create}>
            Create
          </button>
        </div>
      </div>
    </>
  );
}

function CollectionCard({ c, deals, first, last, onMove, report }: { c: Collection; deals: DealOption[]; first: boolean; last: boolean; onMove: (dir: -1 | 1) => void; report: Report }) {
  const [picked, setPicked] = useState<PickedVariant | null>(null);
  const [deal, setDeal] = useState('');
  const [editing, setEditing] = useState(false);
  const [f, setF] = useState({ title: c.title, eyebrow: c.eyebrow ?? '', subtitle: c.subtitle ?? '', starts: day(c.starts_at), ends: day(c.ends_at) });
  const schedule = scheduleText(c);

  const addProduct = async () => {
    if (!picked) return;
    const { data: p } = await supabase.from('products').select('id').eq('slug', picked.productSlug).single();
    const { error } = await supabase.from('collection_items').insert({ collection_id: c.id, product_id: p!.id, sort: c.items.length });
    setPicked(null);
    report(error, `Added ${picked.productName}.`);
  };
  const addDeal = async () => {
    const d = deals.find((x) => x.deal_id === deal);
    const { error } = await supabase.from('collection_items').insert({ collection_id: c.id, deal_id: deal, sort: c.items.length });
    setDeal('');
    report(error, `Added ${d?.headline ?? 'deal'}.`);
  };
  const moveItem = async (i: number, dir: -1 | 1) => {
    const a = c.items[i];
    const b = c.items[i + dir];
    if (!a || !b) return;
    const [r1, r2] = await Promise.all([supabase.from('collection_items').update({ sort: i + dir }).eq('id', a.id), supabase.from('collection_items').update({ sort: i }).eq('id', b.id)]);
    report(r1.error ?? r2.error, 'Reordered.');
  };
  const save = async () => {
    const { error } = await supabase
      .from('collections')
      .update({ title: f.title.trim(), eyebrow: f.eyebrow.trim() || null, subtitle: f.subtitle.trim() || null, starts_at: startOf(f.starts), ends_at: endOf(f.ends) })
      .eq('id', c.id);
    if (!error) setEditing(false);
    report(error, `Saved ${f.title.trim()}.`);
  };
  const remove = async () => {
    if (!confirm(`Delete “${c.title}” and its ${c.items.length} items? Hiding it keeps them.`)) return;
    const { error } = await supabase.from('collections').delete().eq('id', c.id);
    report(error, `Deleted ${c.title}.`);
  };

  return (
    <div className="card">
      <div className="row">
        <div className="row" style={{ gap: 2 }}>
          <button className="btn" disabled={first} onClick={() => onMove(-1)} aria-label="Move collection up">
            ↑
          </button>
          <button className="btn" disabled={last} onClick={() => onMove(1)} aria-label="Move collection down">
            ↓
          </button>
        </div>
        <div className="grow">
          <div className="muted" style={{ fontSize: 12 }}>
            {c.eyebrow}
          </div>
          <strong>{c.title}</strong> <span className="muted">· {c.slug}</span> {schedule && <span className="pill">{schedule}</span>}
          {c.subtitle && (
            <div className="muted" style={{ fontSize: 12 }}>
              {c.subtitle}
            </div>
          )}
        </div>
        <label className="row">
          <input
            type="checkbox"
            checked={c.is_active}
            onChange={async (e) => {
              const { error } = await supabase.from('collections').update({ is_active: e.target.checked }).eq('id', c.id);
              report(error, e.target.checked ? 'Collection visible.' : 'Collection hidden.');
            }}
          />{' '}
          Visible
        </label>
        <button className="btn" onClick={() => setEditing(!editing)}>
          Edit
        </button>
        <button className="btn danger" onClick={remove}>
          Delete
        </button>
      </div>

      {editing && (
        <div className="grid3">
          <label className="field">
            Title
            <input value={f.title} maxLength={60} onChange={(e) => setF({ ...f, title: e.target.value })} />
          </label>
          <label className="field">
            Eyebrow
            <input value={f.eyebrow} maxLength={40} onChange={(e) => setF({ ...f, eyebrow: e.target.value })} />
          </label>
          <label className="field">
            Subtitle
            <input value={f.subtitle} maxLength={120} onChange={(e) => setF({ ...f, subtitle: e.target.value })} />
          </label>
          <label className="field">
            Starts (optional)
            <input type="date" value={f.starts} onChange={(e) => setF({ ...f, starts: e.target.value })} />
          </label>
          <label className="field">
            Ends (optional)
            <input type="date" value={f.ends} onChange={(e) => setF({ ...f, ends: e.target.value })} />
          </label>
          <div className="row" style={{ alignSelf: 'end' }}>
            <button className="btn" onClick={() => setEditing(false)}>
              Cancel
            </button>
            <button className="btn primary" disabled={f.title.trim().length < 2} onClick={save}>
              Save
            </button>
          </div>
        </div>
      )}

      {c.items.length === 0 ? (
        <span className="muted">No items yet. While visible, the banner shows “0 deals”, so hide it until it has items.</span>
      ) : (
        <table>
          <tbody>
            {c.items.map((it, i) => (
              <tr key={it.id}>
                <td style={{ width: 80 }}>
                  <div className="row" style={{ gap: 2 }}>
                    <button className="btn" disabled={i === 0} onClick={() => moveItem(i, -1)} aria-label="Move item up">
                      ↑
                    </button>
                    <button className="btn" disabled={i === c.items.length - 1} onClick={() => moveItem(i, 1)} aria-label="Move item down">
                      ↓
                    </button>
                  </div>
                </td>
                <td>
                  {it.product ? (
                    <>
                      <span className="pill">product</span> {it.product.name}
                    </>
                  ) : (
                    <>
                      <span className="pill">deal</span> {it.deal?.headline} {it.deal && it.deal.status !== 'active' && <span className="muted">({it.deal.status})</span>}
                    </>
                  )}
                </td>
                <td style={{ width: 90 }}>
                  <button
                    className="btn danger"
                    onClick={async () => {
                      const { error } = await supabase.from('collection_items').delete().eq('id', it.id);
                      report(error, 'Removed.');
                    }}>
                    Remove
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <div className="row">
        <div className="grow">
          <ProductPicker value={picked} onChange={setPicked} />
        </div>
        <button className="btn" disabled={!picked} onClick={addProduct}>
          Add product
        </button>
      </div>
      <div className="row">
        <select className="grow" value={deal} onChange={(e) => setDeal(e.target.value)}>
          <option value="">Or add one live deal…</option>
          {deals.map((d) => (
            <option key={d.deal_id} value={d.deal_id}>
              {d.brand_name} {d.product_name} {d.variant_label} — {d.headline}
            </option>
          ))}
        </select>
        <button className="btn" disabled={!deal} onClick={addDeal}>
          Add deal
        </button>
      </div>
    </div>
  );
}
