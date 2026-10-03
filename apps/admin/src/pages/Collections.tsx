import { slugify, SLUG_PATTERN } from '@pickledeals/shared';
import { useCallback, useEffect, useState } from 'react';

import { supabase } from '../lib/supabase';
import { ProductPicker, type PickedVariant } from './ProductPicker';

type Collection = { id: string; slug: string; title: string; subtitle: string | null; eyebrow: string | null; sort: number; is_active: boolean; items: { id: string; product: { name: string; slug: string } | null }[] };
type Placement = { id: string; campaign: string; label: string; is_active: boolean; ends_at: string | null; deal: { headline: string } | null };
type DealOption = { deal_id: string; product_name: string; brand_name: string; variant_label: string; headline: string };

/**
 * Collections (editorial edits on Deals home) and placements (sponsored slots). Sponsored items are
 * always labelled in the app and never change ranking or the organic feed.
 */
export function CollectionsPage() {
  const [rows, setRows] = useState<Collection[]>([]);
  const [placements, setPlacements] = useState<Placement[]>([]);
  const [deals, setDeals] = useState<DealOption[]>([]);
  const [draft, setDraft] = useState({ title: '', eyebrow: 'STAFF PICKS', subtitle: '' });
  const [message, setMessage] = useState<{ error: boolean; text: string } | null>(null);
  const done = (error: { message: string } | null, text: string) => setMessage(error ? { error: true, text: error.message } : { error: false, text });

  const load = useCallback(async () => {
    const [c, p, d] = await Promise.all([
      supabase.from('collections').select('id, slug, title, subtitle, eyebrow, sort, is_active, items:collection_items(id, product:products(name, slug))').order('sort'),
      supabase.from('placements').select('id, campaign, label, is_active, ends_at, deal:deals(headline)').order('sort'),
      supabase.from('deal_feed').select('deal_id, product_name, brand_name, variant_label, headline').order('score', { ascending: false }),
    ]);
    setRows((c.data as Collection[]) ?? []);
    setPlacements((p.data as Placement[]) ?? []);
    setDeals((d.data as DealOption[]) ?? []);
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  const create = async () => {
    const slug = slugify(draft.title);
    if (draft.title.trim().length < 2 || !SLUG_PATTERN.test(slug)) return setMessage({ error: true, text: 'Give the collection a title.' });
    const { error } = await supabase.from('collections').insert({ slug, title: draft.title.trim(), eyebrow: draft.eyebrow.trim() || null, subtitle: draft.subtitle.trim() || null, sort: rows.length + 1 });
    done(error, `Created ${draft.title}.`);
    if (!error) setDraft({ title: '', eyebrow: 'STAFF PICKS', subtitle: '' });
    load();
  };

  return (
    <>
      <h1>Collections</h1>
      <p className="muted">Each collection shows as a banner on Deals home with its live deals. Add products; their current deals appear automatically.</p>
      {message && <div className={`notice ${message.error ? 'error' : ''}`}>{message.text}</div>}
      <div style={{ display: 'grid', gap: 12, marginTop: 12 }}>
        {rows.map((c) => (
          <CollectionCard key={c.id} c={c} onChange={(e, t) => (done(e, t), load())} />
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

      <h2>Sponsored placements</h2>
      <p className="muted">Shown in the second slot of the trending row, labelled with the campaign. Never affects best price or deal ranking.</p>
      <table>
        <tbody>
          {placements.map((p) => (
            <tr key={p.id}>
              <td>
                <strong>{p.campaign}</strong> <span className="pill">{p.label}</span>
                <div className="muted" style={{ fontSize: 12 }}>
                  {p.deal?.headline ?? '—'}
                </div>
              </td>
              <td>
                <label className="row">
                  <input
                    type="checkbox"
                    checked={p.is_active}
                    onChange={async (e) => {
                      const { error } = await supabase.from('placements').update({ is_active: e.target.checked }).eq('id', p.id);
                      done(error, e.target.checked ? 'Placement on.' : 'Placement paused.');
                      load();
                    }}
                  />{' '}
                  Active
                </label>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <NewPlacement deals={deals} onDone={(e, t) => (done(e, t), load())} />
    </>
  );
}

function CollectionCard({ c, onChange }: { c: Collection; onChange: (e: { message: string } | null, t: string) => void }) {
  const [picked, setPicked] = useState<PickedVariant | null>(null);
  const add = async () => {
    if (!picked) return;
    const { data: p } = await supabase.from('products').select('id').eq('slug', picked.productSlug).single();
    const { error } = await supabase.from('collection_items').insert({ collection_id: c.id, product_id: p!.id, sort: c.items.length + 1 });
    setPicked(null);
    onChange(error, `Added ${picked.productName}.`);
  };
  return (
    <div className="card">
      <div className="row">
        <div className="grow">
          <div className="muted" style={{ fontSize: 12 }}>
            {c.eyebrow}
          </div>
          <strong>{c.title}</strong> <span className="muted">· {c.slug}</span>
        </div>
        <label className="row">
          <input
            type="checkbox"
            checked={c.is_active}
            onChange={async (e) => {
              const { error } = await supabase.from('collections').update({ is_active: e.target.checked }).eq('id', c.id);
              onChange(error, e.target.checked ? 'Collection visible.' : 'Collection hidden.');
            }}
          />{' '}
          Visible
        </label>
      </div>
      <div className="row">
        {c.items.map((i) => (
          <span key={i.id} className="pill">
            {i.product?.name}{' '}
            <a
              href="#"
              onClick={async (e) => {
                e.preventDefault();
                const { error } = await supabase.from('collection_items').delete().eq('id', i.id);
                onChange(error, 'Removed.');
              }}>
              ×
            </a>
          </span>
        ))}
      </div>
      <div className="row">
        <div className="grow">
          <ProductPicker value={picked} onChange={setPicked} />
        </div>
        <button className="btn" disabled={!picked} onClick={add}>
          Add product
        </button>
      </div>
    </div>
  );
}

function NewPlacement({ deals, onDone }: { deals: DealOption[]; onDone: (e: { message: string } | null, t: string) => void }) {
  const [deal, setDeal] = useState('');
  const [campaign, setCampaign] = useState('');
  const [ends, setEnds] = useState('');
  return (
    <div className="card" style={{ marginTop: 12 }}>
      <strong>New sponsored placement</strong>
      <div className="grid3">
        <select value={deal} onChange={(e) => setDeal(e.target.value)}>
          <option value="">Choose a live deal…</option>
          {deals.map((d) => (
            <option key={d.deal_id} value={d.deal_id}>
              {d.brand_name} {d.product_name} {d.variant_label} — {d.headline}
            </option>
          ))}
        </select>
        <input placeholder="Campaign (shown as Sponsored · …)" value={campaign} onChange={(e) => setCampaign(e.target.value)} />
        <input type="date" value={ends} onChange={(e) => setEnds(e.target.value)} />
      </div>
      <div className="row">
        <span className="grow" />
        <button
          className="btn primary"
          disabled={!deal || campaign.trim().length < 2}
          onClick={async () => {
            const { data: user } = await supabase.auth.getUser();
            const { error } = await supabase.from('placements').insert({
              kind: 'sponsored_deal',
              deal_id: deal,
              campaign: campaign.trim(),
              ends_at: ends ? new Date(`${ends}T23:59:59`).toISOString() : null,
              created_by: user.user?.id ?? null,
            });
            onDone(error, `Placement for ${campaign} created.`);
            if (!error) {
              setDeal('');
              setCampaign('');
            }
          }}>
          Create
        </button>
      </div>
    </div>
  );
}
