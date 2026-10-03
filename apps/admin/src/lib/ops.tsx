import { formatAgo } from '@pickledeals/shared';
import { useCallback, useEffect, useState } from 'react';

import { supabase } from './supabase';

export type Notice = { error: boolean; text: string } | null;

/** One status line per page: a success message, or the error that came back from Supabase. */
export function useNotice() {
  const [notice, setNotice] = useState<Notice>(null);
  const report = useCallback((error: { message: string } | null, text: string) => setNotice(error ? { error: true, text: error.message } : { error: false, text }), []);
  const view = notice ? <div className={`notice ${notice.error ? 'error' : ''}`}>{notice.text}</div> : null;
  return { report, setNotice, view };
}

export const listingImageUrl = (path: string) => supabase.storage.from('listing-images').getPublicUrl(path).data.publicUrl;

type Action = { id: number; actor_name: string; action: string; target_type: string; target_id: string; note: string | null; data: Record<string, unknown>; created_at: string };

const TABLES: Record<string, string> = {
  promo_codes: 'promo code',
  promo_code_targets: 'promo target',
  collections: 'collection',
  collection_items: 'collection item',
  placements: 'placement',
  prohibited_terms: 'prohibited term',
  raw_offer_records: 'import record',
  listing_catalog_reviews: 'custom listing review',
  ingestion_sources: 'integration',
  affiliate_programs: 'affiliate program',
};

/** Plain-English line for an audit entry. */
export function describeAction(a: Action): string {
  const d = a.data as Record<string, string | number | boolean | null>;
  switch (a.action) {
    case 'listing.remove':
      return `took down a listing${a.note ? `: “${a.note}”` : ''}`;
    case 'listing.restore':
      return 'restored a listing';
    case 'user.suspend':
      return `suspended a user${a.note ? `: “${a.note}”` : ''}${d.hidden_listings ? ` (hid ${d.hidden_listings} listings)` : ''}`;
    case 'user.unsuspend':
      return `lifted a suspension${d.restored_listings ? ` (restored ${d.restored_listings} listings)` : ''}`;
    case 'report.actioned':
    case 'report.dismissed':
      return `${a.action === 'report.actioned' ? 'actioned' : 'dismissed'} a ${d.target_type} report${d.remove_listing ? ' and removed the listing' : ''}`;
    case 'integration.run':
      return `ran the ${d.slug} integration`;
    case 'listing_review.promote':
      return `promoted a custom listing to draft product ${d.slug}`;
  }
  const what = TABLES[a.target_type] ?? a.target_type;
  const name = d.code ?? d.title ?? d.campaign ?? d.term ?? null;
  if (a.action === 'update') {
    if (a.target_type === 'raw_offer_records') return `marked an import record ${d.match_status}`;
    if (a.target_type === 'listing_catalog_reviews') return `marked a custom listing ${d.decision}`;
    if ('verified_at' in d && Object.keys(d).every((k) => k === 'verified_at' || k === 'verified_by')) return `verified a ${what}`;
    return `edited a ${what} (${Object.keys(d).filter((k) => k !== 'verified_by').join(', ')})`;
  }
  return `${a.action === 'insert' ? 'added' : 'deleted'} a ${what}${name ? ` “${name}”` : ''}`;
}

/** Recent staff actions, optionally for one target. */
export function ActivityList({ targetType, targetId, limit = 20, empty = 'No staff actions yet.' }: { targetType?: string; targetId?: string; limit?: number; empty?: string }) {
  const [rows, setRows] = useState<Action[]>([]);
  useEffect(() => {
    supabase.rpc('staff_activity', { for_type: targetType, for_id: targetId, max_rows: limit }).then(({ data }) => setRows((data ?? []) as Action[]));
  }, [targetType, targetId, limit]);
  if (rows.length === 0) return <p className="muted">{empty}</p>;
  return (
    <table>
      <tbody>
        {rows.map((a) => (
          <tr key={a.id}>
            <td className="muted num" style={{ width: 110, fontSize: 12 }}>
              {formatAgo(a.created_at)}
            </td>
            <td>
              <strong>{a.actor_name}</strong> {describeAction(a)}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
