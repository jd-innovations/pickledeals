import { formatAgo } from '@pickledeals/shared';
import { useCallback, useEffect, useState } from 'react';

import { useNotice } from '../lib/ops';
import { supabase } from '../lib/supabase';

type Status = 'new' | 'contacted' | 'connected' | 'declined';

type Inquiry = {
  id: string;
  company: string;
  contact_name: string;
  email: string;
  store_host: string;
  myshopify_domain: string | null;
  shop_name: string | null;
  interests: string[];
  message: string | null;
  status: Status;
  staff_note: string | null;
  created_at: string;
};

const INTEREST: Record<string, string> = { store: 'Connect store', promo_code: 'Exclusive code', sponsored: 'Sponsored' };
const STATUSES: Status[] = ['new', 'contacted', 'connected', 'declined'];

/**
 * Applications from the website's "Partner with PickleDeals" page (Shopify stores only; the store was
 * checked before saving). Staff move each one along; every change is logged.
 */
export function PartnersPage() {
  const [rows, setRows] = useState<Inquiry[]>([]);
  const [filter, setFilter] = useState<Status | 'all'>('new');
  const [notes, setNotes] = useState<Record<string, string>>({});
  const { report, view } = useNotice();

  const load = useCallback(async () => {
    let q = supabase
      .from('partner_inquiries')
      .select('id, company, contact_name, email, store_host, myshopify_domain, shop_name, interests, message, status, staff_note, created_at')
      .order('created_at', { ascending: false })
      .limit(200);
    if (filter !== 'all') q = q.eq('status', filter);
    const { data, error } = await q;
    if (error) report(error, '');
    setRows((data ?? []) as Inquiry[]);
  }, [filter, report]);
  useEffect(() => {
    load();
  }, [load]);

  const setStatus = async (r: Inquiry, status: Status) => {
    const note = notes[r.id]?.trim() || null;
    const { error } = await supabase.rpc('staff_set_partner_status', { inquiry: r.id, new_status: status, note: note ?? undefined });
    report(error, `${r.company}: ${status}.`);
    if (!error) setNotes({ ...notes, [r.id]: '' });
    load();
  };

  return (
    <>
      <h1>Partner applications</h1>
      <p className="muted">
        From pickledeals.app/partners. Every application was checked as a Shopify store before it was saved, and emailed to the team. Reply from your inbox, then record where it stands here.
      </p>
      {view}
      <div className="row" style={{ marginTop: 12 }}>
        {(['new', 'contacted', 'connected', 'declined', 'all'] as const).map((s) => (
          <button key={s} className={`btn${filter === s ? ' primary' : ''}`} onClick={() => setFilter(s)}>
            {s === 'all' ? 'All' : s[0]!.toUpperCase() + s.slice(1)}
          </button>
        ))}
      </div>
      {rows.length === 0 ? (
        <p className="muted" style={{ marginTop: 16 }}>
          {filter === 'new' ? 'No new applications.' : 'Nothing here.'}
        </p>
      ) : (
        <table style={{ marginTop: 12 }}>
          <thead>
            <tr>
              <th>Brand or store</th>
              <th>Contact</th>
              <th>Interested in</th>
              <th>Message</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td>
                  <strong>{r.company}</strong>
                  <div>
                    <a href={`https://${r.store_host}`} target="_blank" rel="noopener noreferrer">
                      {r.store_host}
                    </a>
                  </div>
                  <div className="muted" style={{ fontSize: 12 }}>
                    {[r.shop_name && r.shop_name !== r.company ? r.shop_name : null, r.myshopify_domain].filter(Boolean).join(' · ') || 'Shopify (checked by headers)'}
                  </div>
                  <div className="muted" style={{ fontSize: 12 }}>
                    {formatAgo(r.created_at)}
                  </div>
                </td>
                <td>
                  {r.contact_name}
                  <div>
                    <a href={`mailto:${r.email}`}>{r.email}</a>
                  </div>
                </td>
                <td>{r.interests.map((i) => INTEREST[i] ?? i).join(', ')}</td>
                <td style={{ maxWidth: 320, whiteSpace: 'pre-line' }}>{r.message ?? <span className="muted">—</span>}</td>
                <td style={{ minWidth: 220 }}>
                  <div className="row" style={{ flexWrap: 'wrap', gap: 6 }}>
                    {STATUSES.map((s) => (
                      <button key={s} className={`btn${r.status === s ? ' primary' : ''}`} disabled={r.status === s} onClick={() => setStatus(r, s)}>
                        {s}
                      </button>
                    ))}
                  </div>
                  <input
                    style={{ marginTop: 6, width: '100%' }}
                    placeholder={r.staff_note ?? 'Note (saved with the next status change)'}
                    value={notes[r.id] ?? ''}
                    onChange={(e) => setNotes({ ...notes, [r.id]: e.target.value })}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}
