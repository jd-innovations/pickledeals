import { formatAgo, formatPrice } from '@pickledeals/shared';
import { useCallback, useEffect, useState } from 'react';

import { ActivityList, listingImageUrl, useNotice } from '../lib/ops';
import { supabase } from '../lib/supabase';

type Row = {
  id: string;
  title: string;
  condition: string;
  price_cents: number;
  status: string;
  seller_id: string;
  seller_name: string;
  seller_suspended: boolean;
  area_label: string | null;
  image_path: string | null;
  published_at: string | null;
  created_at: string;
  removed_reason: string | null;
  removed_by_staff: boolean;
  removed_at: string | null;
  open_reports: number;
  total_reports: number;
  total: number;
};

const STATUSES = ['', 'active', 'pending', 'sold', 'removed', 'draft'];
const PAGE = 50;

/**
 * Every marketplace listing. Staff take listings down with a reason (the seller is notified and
 * sees it), and can restore their own takedowns. D2: area labels only.
 */
export function ListingsPage({ seller }: { seller: string | null }) {
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(0);
  const [rows, setRows] = useState<Row[]>([]);
  const [open, setOpen] = useState<string | null>(null);
  const { report, view } = useNotice();

  const load = useCallback(async () => {
    const { data, error } = await supabase.rpc('staff_listings', {
      q: q.trim() || undefined,
      with_status: status || undefined,
      by_seller: seller ?? undefined,
      max_rows: PAGE,
      skip: page * PAGE,
    });
    if (error) report(error, '');
    setRows((data ?? []) as Row[]);
  }, [q, status, seller, page, report]);
  useEffect(() => {
    const t = setTimeout(load, 200);
    return () => clearTimeout(t);
  }, [load]);

  const act = async (r: Row, action: 'remove' | 'restore', reason?: string) => {
    const { error } = await supabase.rpc('staff_set_listing_status', { listing: r.id, action, reason });
    report(error, action === 'remove' ? `Took down “${r.title}”. ${r.seller_name} has been notified.` : `Restored “${r.title}”.`);
    load();
  };

  const total = rows[0]?.total ?? 0;
  return (
    <>
      <h1>Listings</h1>
      <p className="muted">
        {seller ? (
          <>
            Listings by one seller. <a href="#/listings">Show all</a>
          </>
        ) : (
          'Every listing in the marketplace. Taking one down tells the seller why and closes its open offers.'
        )}
      </p>
      <div className="row" style={{ margin: '12px 0' }}>
        <input
          className="grow"
          placeholder="Search title, brand, seller or listing ID"
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setPage(0);
          }}
        />
        <select
          value={status}
          onChange={(e) => {
            setStatus(e.target.value);
            setPage(0);
          }}>
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {s ? s.charAt(0).toUpperCase() + s.slice(1) : 'Any status'}
            </option>
          ))}
        </select>
      </div>
      {view}
      <table style={{ marginTop: 12 }}>
        <thead>
          <tr>
            <th />
            <th>Listing</th>
            <th>Seller</th>
            <th>Price</th>
            <th>Status</th>
            <th>Reports</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <ListingRow key={r.id} r={r} open={open === r.id} onToggle={() => setOpen(open === r.id ? null : r.id)} onAct={act} />
          ))}
        </tbody>
      </table>
      {rows.length === 0 && <p className="muted">No listings match.</p>}
      <div className="row" style={{ marginTop: 12 }}>
        <span className="muted grow num">
          {total ? `${page * PAGE + 1}–${page * PAGE + rows.length} of ${total}` : ''}
        </span>
        <button className="btn" disabled={page === 0} onClick={() => setPage(page - 1)}>
          Previous
        </button>
        <button className="btn" disabled={(page + 1) * PAGE >= total} onClick={() => setPage(page + 1)}>
          Next
        </button>
      </div>
    </>
  );
}

function ListingRow({ r, open, onToggle, onAct }: { r: Row; open: boolean; onToggle: () => void; onAct: (r: Row, a: 'remove' | 'restore', reason?: string) => void }) {
  const [reason, setReason] = useState('');
  const removable = r.status === 'active' || r.status === 'pending' || r.status === 'sold';
  return (
    <>
      <tr className="link" onClick={onToggle}>
        <td style={{ width: 56 }}>{r.image_path && <img className="thumb" style={{ width: 44, height: 44, objectFit: 'cover' }} src={listingImageUrl(r.image_path)} alt="" />}</td>
        <td>
          <strong>{r.title}</strong>
          <div className="muted" style={{ fontSize: 12 }}>
            {r.condition.replace('_', ' ')} · {r.area_label ?? 'no area'} · {r.published_at ? `listed ${formatAgo(r.published_at)}` : `created ${formatAgo(r.created_at)}`}
          </div>
        </td>
        <td>
          <a href={`#/users/${r.seller_id}`} onClick={(e) => e.stopPropagation()}>
            {r.seller_name}
          </a>
          {r.seller_suspended && <span className="pill" style={{ marginLeft: 6 }}>suspended</span>}
        </td>
        <td className="num">{formatPrice(r.price_cents)}</td>
        <td>
          <span className={`pill ${r.status === 'removed' ? 'dark' : ''}`}>{r.status}</span>
          {r.status === 'removed' && (
            <div className="muted" style={{ fontSize: 12 }}>
              {r.removed_by_staff ? `by staff: ${r.removed_reason ?? ''}` : 'by the seller'}
            </div>
          )}
        </td>
        <td className="num">
          {r.open_reports > 0 ? (
            <a href="#/reports" onClick={(e) => e.stopPropagation()}>
              <strong>{r.open_reports} open</strong>
            </a>
          ) : (
            <span className="muted">{r.total_reports || '—'}</span>
          )}
        </td>
        <td className="muted">{open ? '▾' : '▸'}</td>
      </tr>
      {open && (
        <tr>
          <td colSpan={7}>
            <div className="card">
              <div className="muted" style={{ fontSize: 12 }}>
                ID {r.id}
              </div>
              {removable && (
                <div className="row">
                  <input className="grow" placeholder="Reason (the seller sees this)" value={reason} maxLength={300} onChange={(e) => setReason(e.target.value)} />
                  <button className="btn primary" disabled={reason.trim().length < 3} onClick={() => onAct(r, 'remove', reason.trim())}>
                    Take down
                  </button>
                </div>
              )}
              {r.status === 'removed' && r.removed_by_staff && (
                <div className="row">
                  <span className="grow muted">Removed {r.removed_at ? formatAgo(r.removed_at) : ''}. Restoring puts it back on sale and tells the seller.</span>
                  <button className="btn" onClick={() => onAct(r, 'restore')}>
                    Restore
                  </button>
                </div>
              )}
              <strong>History</strong>
              <ActivityList key={`${r.status}:${r.removed_at}`} targetType="listing" targetId={r.id} limit={10} empty="No staff actions on this listing." />
            </div>
          </td>
        </tr>
      )}
    </>
  );
}
