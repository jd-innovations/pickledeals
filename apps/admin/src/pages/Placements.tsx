import { useCallback, useEffect, useState } from 'react';

import { useNotice } from '../lib/ops';
import { supabase } from '../lib/supabase';

type Patch = Partial<Pick<Placement, 'campaign' | 'label' | 'is_active' | 'starts_at' | 'ends_at'>>;
type Placement = {
  id: string;
  campaign: string;
  label: string;
  sort: number;
  is_active: boolean;
  starts_at: string;
  ends_at: string | null;
  deal_id: string | null;
  deal: { headline: string; status: string } | null;
};
type DealOption = { deal_id: string; product_name: string; brand_name: string; variant_label: string; headline: string };

const day = (iso: string | null) => (iso ? iso.slice(0, 10) : '');
const startOf = (d: string) => new Date(`${d}T00:00:00`).toISOString();
const endOf = (d: string) => new Date(`${d}T23:59:59`).toISOString();

function stateOf(p: Placement, live: Set<string>): { text: string; on: boolean } {
  const now = Date.now();
  if (!p.is_active) return { text: 'paused', on: false };
  if (new Date(p.starts_at).getTime() > now) return { text: `starts ${new Date(p.starts_at).toLocaleDateString()}`, on: false };
  if (p.ends_at && new Date(p.ends_at).getTime() <= now) return { text: 'ended', on: false };
  if (!p.deal_id || !live.has(p.deal_id)) return { text: 'deal not live — hidden', on: false };
  return { text: 'showing', on: true };
}

/**
 * Sponsored placements: a live deal in the trending row of Deals home, always labelled
 * ("Sponsored · campaign"). They never change best price or organic ranking. The app renders
 * sponsored deals only, so that's the one kind offered here.
 */
export function PlacementsPage({ role }: { role: 'admin' | 'editor' }) {
  const [rows, setRows] = useState<Placement[]>([]);
  const [deals, setDeals] = useState<DealOption[]>([]);
  const [clicks, setClicks] = useState<Map<string, number>>(new Map());
  const { report, view } = useNotice();

  const load = useCallback(async () => {
    const [p, d] = await Promise.all([
      supabase.from('placements').select('id, campaign, label, sort, is_active, starts_at, ends_at, deal_id, deal:deals(headline, status)').eq('kind', 'sponsored_deal').order('sort').order('created_at'),
      supabase.from('deal_feed').select('deal_id, product_name, brand_name, variant_label, headline').order('score', { ascending: false }),
    ]);
    if (p.error) report(p.error, '');
    setRows((p.data as Placement[]) ?? []);
    setDeals((d.data as DealOption[]) ?? []);
  }, [report]);
  useEffect(() => {
    load();
  }, [load]);
  useEffect(() => {
    if (role !== 'admin') return;
    supabase.rpc('staff_metrics', { days: 180 }).then(({ data }) => {
      const list = ((data as unknown as { placements?: { id: string; clicks: number }[] })?.placements ?? []).map((x) => [x.id, x.clicks] as const);
      setClicks(new Map(list));
    });
  }, [role, rows.length]);

  const live = new Set(deals.map((d) => d.deal_id));
  const save = async (p: Placement, patch: Patch, text: string) => {
    const { error } = await supabase.from('placements').update(patch).eq('id', p.id);
    report(error, text);
    load();
  };
  const move = async (i: number, dir: -1 | 1) => {
    const a = rows[i];
    const b = rows[i + dir];
    if (!a || !b) return;
    const [r1, r2] = await Promise.all([
      supabase.from('placements').update({ sort: i + dir }).eq('id', a.id),
      supabase.from('placements').update({ sort: i }).eq('id', b.id),
    ]);
    report(r1.error ?? r2.error, 'Reordered.');
    load();
  };

  return (
    <>
      <h1>Sponsored placements</h1>
      <p className="muted">
        Shown in the trending row of Deals home in this order, each labelled “{rows[0]?.label ?? 'Sponsored'} · campaign”. A placement only shows while its deal is live.
        {role === 'admin' && ' Clicks count Get deal taps on the promoted product while the placement ran.'}
      </p>
      {view}
      <table style={{ marginTop: 12 }}>
        <thead>
          <tr>
            <th>Order</th>
            <th>Campaign</th>
            <th>Runs</th>
            <th>State</th>
            {role === 'admin' && <th>Clicks</th>}
            <th />
          </tr>
        </thead>
        <tbody>
          {rows.map((p, i) => (
            <PlacementRow key={p.id} p={p} first={i === 0} last={i === rows.length - 1} state={stateOf(p, live)} clicks={role === 'admin' ? (clicks.get(p.id) ?? 0) : null} onMove={(dir) => move(i, dir)} onSave={save} onDelete={async () => {
              if (!confirm(`Delete the ${p.campaign} placement?`)) return;
              const { error } = await supabase.from('placements').delete().eq('id', p.id);
              report(error, `Deleted ${p.campaign}.`);
              load();
            }} />
          ))}
        </tbody>
      </table>
      {rows.length === 0 && <p className="muted">No placements yet.</p>}
      <NewPlacement deals={deals} sort={rows.length} onDone={(e, t) => (report(e, t), load())} />
    </>
  );
}

function PlacementRow({
  p,
  first,
  last,
  state,
  clicks,
  onMove,
  onSave,
  onDelete,
}: {
  p: Placement;
  first: boolean;
  last: boolean;
  state: { text: string; on: boolean };
  clicks: number | null;
  onMove: (dir: -1 | 1) => void;
  onSave: (p: Placement, patch: Patch, text: string) => void;
  onDelete: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [f, setF] = useState({ campaign: p.campaign, label: p.label, starts: day(p.starts_at), ends: day(p.ends_at) });
  return (
    <>
      <tr>
        <td>
          <div className="row" style={{ gap: 2 }}>
            <button className="btn" disabled={first} onClick={() => onMove(-1)} aria-label="Move up">
              ↑
            </button>
            <button className="btn" disabled={last} onClick={() => onMove(1)} aria-label="Move down">
              ↓
            </button>
          </div>
        </td>
        <td>
          <strong>{p.campaign}</strong> <span className="pill">{p.label}</span>
          <div className="muted" style={{ fontSize: 12 }}>
            {p.deal?.headline ?? 'deal deleted'}
          </div>
        </td>
        <td className="muted num" style={{ fontSize: 12 }}>
          {new Date(p.starts_at).toLocaleDateString()} – {p.ends_at ? new Date(p.ends_at).toLocaleDateString() : 'open-ended'}
        </td>
        <td>
          <span className={`pill ${state.on ? 'dark' : ''}`}>{state.text}</span>
        </td>
        {clicks !== null && <td className="num">{clicks}</td>}
        <td>
          <div className="row">
            <label className="row" style={{ fontSize: 13 }}>
              <input type="checkbox" checked={p.is_active} onChange={(e) => onSave(p, { is_active: e.target.checked }, e.target.checked ? 'Placement on.' : 'Placement paused.')} /> Active
            </label>
            <button className="btn" onClick={() => setEditing(!editing)}>
              Edit
            </button>
            <button className="btn danger" onClick={onDelete}>
              Delete
            </button>
          </div>
        </td>
      </tr>
      {editing && (
        <tr>
          <td colSpan={6}>
            <div className="card">
              <div className="grid2">
                <label className="field">
                  Campaign
                  <input value={f.campaign} maxLength={60} onChange={(e) => setF({ ...f, campaign: e.target.value })} />
                </label>
                <label className="field">
                  Label
                  <input value={f.label} maxLength={30} onChange={(e) => setF({ ...f, label: e.target.value })} />
                </label>
                <label className="field">
                  Starts
                  <input type="date" value={f.starts} onChange={(e) => setF({ ...f, starts: e.target.value })} />
                </label>
                <label className="field">
                  Ends (optional)
                  <input type="date" value={f.ends} onChange={(e) => setF({ ...f, ends: e.target.value })} />
                </label>
              </div>
              <div className="row">
                <span className="grow" />
                <button className="btn" onClick={() => setEditing(false)}>
                  Cancel
                </button>
                <button
                  className="btn primary"
                  disabled={f.campaign.trim().length < 2 || f.label.trim().length < 2 || !f.starts}
                  onClick={() => {
                    onSave(p, { campaign: f.campaign.trim(), label: f.label.trim(), starts_at: startOf(f.starts), ends_at: f.ends ? endOf(f.ends) : null }, `Saved ${f.campaign.trim()}.`);
                    setEditing(false);
                  }}>
                  Save
                </button>
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

function NewPlacement({ deals, sort, onDone }: { deals: DealOption[]; sort: number; onDone: (e: { message: string } | null, t: string) => void }) {
  const [deal, setDeal] = useState('');
  const [campaign, setCampaign] = useState('');
  const [starts, setStarts] = useState('');
  const [ends, setEnds] = useState('');
  return (
    <div className="card" style={{ marginTop: 12 }}>
      <strong>New sponsored placement</strong>
      <div className="grid2">
        <label className="field">
          Live deal
          <select value={deal} onChange={(e) => setDeal(e.target.value)}>
            <option value="">Choose…</option>
            {deals.map((d) => (
              <option key={d.deal_id} value={d.deal_id}>
                {d.brand_name} {d.product_name} {d.variant_label} — {d.headline}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          Campaign (shown as Sponsored · …)
          <input value={campaign} maxLength={60} onChange={(e) => setCampaign(e.target.value)} />
        </label>
        <label className="field">
          Starts (optional, default now)
          <input type="date" value={starts} onChange={(e) => setStarts(e.target.value)} />
        </label>
        <label className="field">
          Ends (optional)
          <input type="date" value={ends} onChange={(e) => setEnds(e.target.value)} />
        </label>
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
              sort,
              ...(starts ? { starts_at: startOf(starts) } : {}),
              ends_at: ends ? endOf(ends) : null,
              created_by: user.user?.id ?? null,
            });
            onDone(error, `Placement for ${campaign.trim()} created.`);
            if (!error) {
              setDeal('');
              setCampaign('');
              setStarts('');
              setEnds('');
            }
          }}>
          Create
        </button>
      </div>
    </div>
  );
}
