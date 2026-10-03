import { formatAgo } from '@pickledeals/shared';
import { useCallback, useEffect, useState } from 'react';

import { useNotice } from '../lib/ops';
import { supabase } from '../lib/supabase';

type Term = { term: string; reason: string; created_at: string };

/** Words a listing title or description can't contain. Publishing is refused with the reason shown. */
export function TermsPage() {
  const [rows, setRows] = useState<Term[]>([]);
  const [draft, setDraft] = useState({ term: '', reason: '' });
  const { report, view } = useNotice();

  const load = useCallback(async () => {
    const { data, error } = await supabase.from('prohibited_terms').select('term, reason, created_at').order('term');
    if (error) report(error, '');
    setRows(data ?? []);
  }, [report]);
  useEffect(() => {
    load();
  }, [load]);

  const add = async () => {
    const term = draft.term.trim().toLowerCase();
    const { error } = await supabase.from('prohibited_terms').insert({ term, reason: draft.reason.trim() });
    report(error, `Listings can no longer use “${term}”.`);
    if (!error) setDraft({ term: '', reason: '' });
    load();
  };
  const remove = async (t: Term) => {
    if (!confirm(`Allow “${t.term}” in listings again?`)) return;
    const { error } = await supabase.from('prohibited_terms').delete().eq('term', t.term);
    report(error, `Removed “${t.term}”.`);
    load();
  };

  return (
    <>
      <h1>Prohibited terms</h1>
      <p className="muted">Checked when a listing is published or edited. The seller sees the reason. Existing listings aren’t re-checked; take them down from Listings.</p>
      {view}
      <div className="card" style={{ marginTop: 12 }}>
        <div className="row">
          <input placeholder="Word or phrase (3+ letters)" value={draft.term} onChange={(e) => setDraft({ ...draft, term: e.target.value })} />
          <input className="grow" placeholder="Reason shown to the seller (Replicas aren’t allowed.)" value={draft.reason} onChange={(e) => setDraft({ ...draft, reason: e.target.value })} />
          <button className="btn primary" disabled={draft.term.trim().length < 3 || draft.reason.trim().length < 3} onClick={add}>
            Add
          </button>
        </div>
      </div>
      <table style={{ marginTop: 12 }}>
        <thead>
          <tr>
            <th>Term</th>
            <th>Reason</th>
            <th>Added</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {rows.map((t) => (
            <tr key={t.term}>
              <td>
                <strong>{t.term}</strong>
              </td>
              <td>{t.reason}</td>
              <td className="muted">{formatAgo(t.created_at)}</td>
              <td>
                <button className="btn danger" onClick={() => remove(t)}>
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
