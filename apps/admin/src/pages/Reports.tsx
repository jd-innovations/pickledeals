import { formatAgo } from '@pickledeals/shared';
import { useCallback, useEffect, useState } from 'react';

import { supabase } from '../lib/supabase';

type Row = {
  id: string;
  target_type: 'listing' | 'user' | 'conversation';
  target_id: string;
  reason: string;
  details: string | null;
  status: string;
  created_at: string;
  reporter_name: string | null;
  open_reports: number;
  target_label: string | null;
  target_owner: string | null;
  target_owner_name: string | null;
  listing_status: string | null;
  transcript: { at: string; from: string; kind: string; body: string | null }[] | null;
};

const REASON: Record<string, string> = {
  scam: 'Scam or fraud',
  counterfeit: 'Counterfeit',
  prohibited: 'Not allowed',
  offensive: 'Harassment or hate',
  spam: 'Spam',
  other: 'Other',
};

/**
 * Reports (App Store Guideline 1.2). Every open report on the same target closes together.
 * Conversation reports show the last 50 messages; chats are otherwise private to participants.
 */
export function ReportsPage({ role }: { role: 'admin' | 'editor' }) {
  const [rows, setRows] = useState<Row[]>([]);
  const [closed, setClosed] = useState(false);
  const [message, setMessage] = useState<{ error: boolean; text: string } | null>(null);

  const load = useCallback(async () => {
    const { data, error } = await supabase.rpc('staff_reports', { include_closed: closed });
    if (error) setMessage({ error: true, text: error.message });
    setRows((data ?? []) as unknown as Row[]);
  }, [closed]);
  useEffect(() => {
    load();
  }, [load]);

  const resolve = async (r: Row, decision: 'actioned' | 'dismissed', note: string, removeListing = false) => {
    const { error } = await supabase.rpc('resolve_report', { report: r.id, decision, note: note || undefined, remove_listing: removeListing });
    setMessage(
      error
        ? { error: true, text: error.message }
        : { error: false, text: removeListing ? `Removed “${r.target_label}” and closed its reports.` : decision === 'dismissed' ? 'Dismissed.' : 'Marked as actioned.' },
    );
    load();
  };

  // One card per target: the newest report leads, with a count of the others.
  const seen = new Set<string>();
  const cards = rows.filter((r) => {
    const k = `${r.target_type}:${r.target_id}:${r.status}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });

  return (
    <>
      <h1>Reports</h1>
      <p className="muted">Listings, people and conversations reported from the app. Act within 24 hours.</p>
      <div className="row" style={{ margin: '12px 0' }}>
        <label className="row" style={{ fontSize: 13 }}>
          <input type="checkbox" checked={closed} onChange={(e) => setClosed(e.target.checked)} /> Include closed
        </label>
      </div>
      {message && <div className={`notice ${message.error ? 'error' : ''}`}>{message.text}</div>}
      {cards.length === 0 && <p className="muted">No open reports.</p>}
      <div style={{ display: 'grid', gap: 12, marginTop: 12 }}>
        {cards.map((r) => (
          <ReportCard key={r.id} r={r} role={role} onResolve={resolve} />
        ))}
      </div>
    </>
  );
}

function ReportCard({ r, role, onResolve }: { r: Row; role: 'admin' | 'editor'; onResolve: (r: Row, d: 'actioned' | 'dismissed', note: string, remove?: boolean) => void }) {
  const [note, setNote] = useState('');
  const open = r.status === 'open';
  return (
    <div className="card">
      <div className="row">
        <span className="pill dark">{r.target_type}</span>
        <strong className="grow">{r.target_label ?? 'Unavailable'}</strong>
        <span className="pill">{REASON[r.reason] ?? r.reason}</span>
        {r.open_reports > 1 && <span className="pill num">{r.open_reports} reports</span>}
        {!open && <span className="pill">{r.status}</span>}
      </div>
      <div className="muted" style={{ fontSize: 12 }}>
        Reported by {r.reporter_name ?? 'a deleted account'} · {formatAgo(r.created_at)}
        {r.target_owner_name ? ` · ${r.target_type === 'conversation' ? 'other party' : 'owner'}: ${r.target_owner_name}` : ''}
        {r.listing_status ? ` · listing ${r.listing_status}` : ''}
        {r.target_owner && (
          <>
            {' · '}
            <a href={`#/users/${r.target_owner}`}>{role === 'admin' ? 'Review or suspend this user' : 'Review this user'}</a>
          </>
        )}
      </div>
      {r.details && <div>“{r.details}”</div>}
      {r.transcript && r.transcript.length > 0 && (
        <div style={{ maxHeight: 220, overflow: 'auto', background: 'var(--surface-elevated)', borderRadius: 10, padding: 10, fontSize: 13 }}>
          {r.transcript.map((m, i) => (
            <div key={i}>
              <span className="muted num">{new Date(m.at).toLocaleString()} · </span>
              <strong>{m.from}</strong>: {m.body ?? `[${m.kind.replace('_', ' ')}]`}
            </div>
          ))}
        </div>
      )}
      {open && (
        <div className="row">
          <input className="grow" placeholder="Note (optional, internal)" value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} />
          <button className="btn" onClick={() => onResolve(r, 'dismissed', note)}>
            Dismiss
          </button>
          <button className="btn" onClick={() => onResolve(r, 'actioned', note)}>
            Mark actioned
          </button>
          {r.target_type === 'listing' && r.listing_status !== 'removed' && (
            <button className="btn primary" onClick={() => onResolve(r, 'actioned', note, true)}>
              Remove listing
            </button>
          )}
        </div>
      )}
    </div>
  );
}
