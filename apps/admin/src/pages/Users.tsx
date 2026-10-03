import { formatAgo } from '@pickledeals/shared';
import { useCallback, useEffect, useState } from 'react';

import { ActivityList, useNotice } from '../lib/ops';
import { supabase } from '../lib/supabase';

type Row = {
  id: string;
  display_name: string;
  email: string | null;
  joined_at: string;
  last_sign_in_at: string | null;
  role: string | null;
  suspended: boolean;
  suspension_reason: string | null;
  suspended_at: string | null;
  active_listings: number;
  total_listings: number;
  open_reports: number;
  filed_reports: number;
  blocked_by: number;
  total: number;
};

const PAGE = 50;

/**
 * Accounts. Admins can suspend: a suspended user can't publish, message or make offers, and
 * (by default) their live listings are hidden until the suspension is lifted. Emails are admin-only.
 */
export function UsersPage({ role, focus }: { role: 'admin' | 'editor'; focus: string | null }) {
  const [q, setQ] = useState(focus ?? '');
  const [onlySuspended, setOnlySuspended] = useState(false);
  const [page, setPage] = useState(0);
  const [rows, setRows] = useState<Row[]>([]);
  const [open, setOpen] = useState<string | null>(focus);
  const { report, view } = useNotice();

  const load = useCallback(async () => {
    const { data, error } = await supabase.rpc('staff_users', { q: q.trim() || undefined, only_suspended: onlySuspended, max_rows: PAGE, skip: page * PAGE });
    if (error) report(error, '');
    setRows((data ?? []) as Row[]);
  }, [q, onlySuspended, page, report]);
  useEffect(() => {
    const t = setTimeout(load, 200);
    return () => clearTimeout(t);
  }, [load]);

  const total = rows[0]?.total ?? 0;
  return (
    <>
      <h1>Users</h1>
      <p className="muted">Search by name{role === 'admin' ? ', email' : ''} or user ID.</p>
      <div className="row" style={{ margin: '12px 0' }}>
        <input
          className="grow"
          placeholder={role === 'admin' ? 'Name, email or ID' : 'Name or ID'}
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setPage(0);
          }}
        />
        <label className="row" style={{ fontSize: 13 }}>
          <input
            type="checkbox"
            checked={onlySuspended}
            onChange={(e) => {
              setOnlySuspended(e.target.checked);
              setPage(0);
            }}
          />{' '}
          Suspended only
        </label>
      </div>
      {view}
      <table style={{ marginTop: 12 }}>
        <thead>
          <tr>
            <th>User</th>
            <th>Joined</th>
            <th>Listings</th>
            <th>Open reports</th>
            <th>Blocked by</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((u) => (
            <UserRow key={u.id} u={u} role={role} open={open === u.id} onToggle={() => setOpen(open === u.id ? null : u.id)} report={report} reload={load} />
          ))}
        </tbody>
      </table>
      {rows.length === 0 && <p className="muted">No users match.</p>}
      <div className="row" style={{ marginTop: 12 }}>
        <span className="muted grow num">{total ? `${page * PAGE + 1}–${page * PAGE + rows.length} of ${total}` : ''}</span>
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

function UserRow({
  u,
  role,
  open,
  onToggle,
  report,
  reload,
}: {
  u: Row;
  role: 'admin' | 'editor';
  open: boolean;
  onToggle: () => void;
  report: (e: { message: string } | null, t: string) => void;
  reload: () => void;
}) {
  const [reason, setReason] = useState('');
  const [hide, setHide] = useState(true);
  const [restore, setRestore] = useState(true);

  const suspend = async () => {
    const { data, error } = await supabase.rpc('staff_suspend_user', { target: u.id, reason: reason.trim(), hide_listings: hide });
    report(error, `Suspended ${u.display_name}${data ? ` and hid ${data} listing${data === 1 ? '' : 's'}` : ''}.`);
    setReason('');
    reload();
  };
  const unsuspend = async () => {
    const { data, error } = await supabase.rpc('staff_unsuspend_user', { target: u.id, restore_listings: restore });
    report(error, `Lifted ${u.display_name}’s suspension${data ? ` and restored ${data} listing${data === 1 ? '' : 's'}` : ''}.`);
    reload();
  };

  return (
    <>
      <tr className="link" onClick={onToggle}>
        <td>
          <strong>{u.display_name}</strong> {u.role && <span className="pill dark">{u.role}</span>}
          <div className="muted" style={{ fontSize: 12 }}>
            {u.email ?? u.id}
          </div>
        </td>
        <td className="muted num">
          {formatAgo(u.joined_at)}
          {u.last_sign_in_at && <div style={{ fontSize: 12 }}>seen {formatAgo(u.last_sign_in_at)}</div>}
        </td>
        <td className="num">
          {u.active_listings} live <span className="muted">/ {u.total_listings}</span>
        </td>
        <td className="num">{u.open_reports ? <strong>{u.open_reports}</strong> : <span className="muted">—</span>}</td>
        <td className="num">{u.blocked_by || <span className="muted">—</span>}</td>
        <td>{u.suspended ? <span className="pill dark">suspended</span> : <span className="muted">active</span>}</td>
      </tr>
      {open && (
        <tr>
          <td colSpan={6}>
            <div className="card">
              <div className="row">
                <span className="muted grow" style={{ fontSize: 12 }}>
                  ID {u.id} · filed {u.filed_reports} report{u.filed_reports === 1 ? '' : 's'}
                </span>
                <a className="btn" href={`#/listings/${u.id}`} style={{ display: 'inline-flex', alignItems: 'center', textDecoration: 'none' }}>
                  See listings
                </a>
              </div>
              {u.suspended && (
                <div className="notice">
                  Suspended {u.suspended_at ? formatAgo(u.suspended_at) : ''}: “{u.suspension_reason}”
                </div>
              )}
              {role === 'admin' && !u.role && !u.suspended && (
                <div className="row">
                  <input className="grow" placeholder="Reason (internal; the user is told they’re suspended)" value={reason} maxLength={500} onChange={(e) => setReason(e.target.value)} />
                  <label className="row" style={{ fontSize: 13 }}>
                    <input type="checkbox" checked={hide} onChange={(e) => setHide(e.target.checked)} /> Hide their live listings
                  </label>
                  <button className="btn primary" disabled={reason.trim().length < 3} onClick={suspend}>
                    Suspend
                  </button>
                </div>
              )}
              {role === 'admin' && u.suspended && (
                <div className="row">
                  <label className="row grow" style={{ fontSize: 13 }}>
                    <input type="checkbox" checked={restore} onChange={(e) => setRestore(e.target.checked)} /> Restore listings hidden by the suspension
                  </label>
                  <button className="btn primary" onClick={unsuspend}>
                    Lift suspension
                  </button>
                </div>
              )}
              {role !== 'admin' && <span className="muted">Only admins can suspend accounts.</span>}
              <strong>History</strong>
              <ActivityList key={`${u.suspended}:${u.suspended_at}`} targetType="user" targetId={u.id} limit={10} empty="No staff actions on this account." />
            </div>
          </td>
        </tr>
      )}
    </>
  );
}
