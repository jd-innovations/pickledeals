import { formatAgo } from '@pickledeals/shared';
import { useEffect, useState } from 'react';

import { ActivityList } from '../lib/ops';
import { supabase } from '../lib/supabase';

type Queues = {
  unmatched_offers: number;
  custom_listings: number;
  open_reports: number;
  oldest_report_at: string | null;
  promos_stale: number;
  promos_due: number;
  placements_ending: number;
  suspended_users: number;
};
type Day = { day: string; clicks: number; new_users: number; listings_published: number; listings_sold: number; messages: number; offers: number; reports_opened: number };
type Metrics = {
  days: number;
  now: { live_deals: number; active_listings: number; users: number; live_promos: number };
  totals: Record<string, number | null>;
  daily: Day[];
  clicks_by_retailer: { name: string; clicks: number }[];
  clicks_by_placement: { placement: string; clicks: number }[];
  top_products: { name: string; clicks: number }[];
};

const RANGES = [7, 30, 90];

/** What needs doing now (every staff member) and how the app is doing (admins). */
export function DashboardPage({ role }: { role: 'admin' | 'editor' }) {
  const [queues, setQueues] = useState<Queues | null>(null);
  const [days, setDays] = useState(30);
  const [m, setM] = useState<Metrics | null>(null);

  useEffect(() => {
    supabase.rpc('staff_queue_counts').then(({ data }) => setQueues(data as unknown as Queues));
  }, []);
  useEffect(() => {
    if (role !== 'admin') return;
    supabase.rpc('staff_metrics', { days }).then(({ data }) => setM(data as unknown as Metrics));
  }, [role, days]);

  return (
    <>
      <h1>Dashboard</h1>
      <h2>Needs attention</h2>
      {queues && (
        <div className="tiles">
          <Queue href="#/reports" n={queues.open_reports} label="Open reports" hint={queues.oldest_report_at ? `oldest ${formatAgo(queues.oldest_report_at)}` : 'Act within 24 hours'} />
          <Queue href="#/review" n={queues.unmatched_offers} label="Unmatched offers" hint="Not visible until matched" />
          <Queue href="#/custom-listings" n={queues.custom_listings} label="Custom listings" hint="Link to the catalog" />
          <Queue href="#/promos" n={queues.promos_stale} label="Promo codes hidden" hint={`${queues.promos_due} more go stale within 3 days`} />
          <Queue href="#/placements" n={queues.placements_ending} label="Placements ending" hint="Within 3 days" />
          <Queue href="#/users" n={queues.suspended_users} label="Suspended users" hint="Currently suspended" quiet />
        </div>
      )}

      {role === 'admin' && (
        <>
          <div className="row" style={{ marginTop: 24 }}>
            <h2 className="grow" style={{ margin: 0 }}>
              Metrics
            </h2>
            {RANGES.map((d) => (
              <button key={d} className={`btn ${d === days ? 'primary' : ''}`} onClick={() => setDays(d)}>
                {d} days
              </button>
            ))}
          </div>
          {m && <Metrics m={m} />}
        </>
      )}

      <h2>Recent staff actions</h2>
      <ActivityList limit={25} />
    </>
  );
}

function Queue({ href, n, label, hint, quiet }: { href: string; n: number; label: string; hint: string; quiet?: boolean }) {
  return (
    <a className={`tile ${n > 0 && !quiet ? 'alert' : ''}`} href={href}>
      <span className="tile-n num">{n}</span>
      <strong>{label}</strong>
      <span className="muted">{hint}</span>
    </a>
  );
}

function Stat({ n, label }: { n: number | null | undefined; label: string }) {
  return (
    <div className="tile">
      <span className="tile-n num">{n ?? '—'}</span>
      <span className="muted">{label}</span>
    </div>
  );
}

function Metrics({ m }: { m: Metrics }) {
  const t = m.totals;
  const max = Math.max(1, ...m.daily.map((d) => d.clicks));
  return (
    <>
      <p className="muted">Last {m.days} days (UTC). Right now: {m.now.live_deals} live deals, {m.now.live_promos} live codes, {m.now.active_listings} listings for sale, {m.now.users} accounts.</p>
      <div className="tiles">
        <Stat n={t.clicks} label="Get deal clicks" />
        <Stat n={t.new_users} label="New accounts" />
        <Stat n={t.listings_published} label="Listings published" />
        <Stat n={t.listings_sold} label="Listings sold" />
        <Stat n={t.messages} label="Messages sent" />
        <Stat n={t.offers} label="Offers made" />
        <Stat n={t.reports_opened} label="Reports filed" />
        <Stat n={t.report_median_hours} label="Median hours to resolve a report" />
        <Stat n={t.listings_removed_by_staff} label="Listings taken down" />
      </div>

      <h2>Get deal clicks per day</h2>
      <div className="bars" role="img" aria-label="Clicks per day; the table below has the values">
        {m.daily.map((d) => (
          <span key={d.day} title={`${d.day}: ${d.clicks} clicks`} style={{ height: `${Math.max(2, (d.clicks / max) * 100)}%` }} />
        ))}
      </div>

      <div className="grid3" style={{ marginTop: 16, alignItems: 'start' }}>
        <Breakdown title="Clicks by retailer" rows={m.clicks_by_retailer.map((r) => [r.name, r.clicks])} />
        <Breakdown title="Clicks by placement" rows={m.clicks_by_placement.map((r) => [r.placement.replace(/_/g, ' '), r.clicks])} />
        <Breakdown title="Most clicked products" rows={m.top_products.map((r) => [r.name, r.clicks])} />
      </div>

      <h2>Daily</h2>
      <table>
        <thead>
          <tr>
            <th>Day</th>
            <th>Clicks</th>
            <th>New accounts</th>
            <th>Published</th>
            <th>Sold</th>
            <th>Messages</th>
            <th>Offers</th>
            <th>Reports</th>
          </tr>
        </thead>
        <tbody>
          {[...m.daily].reverse().map((d) => (
            <tr key={d.day} className="num">
              <td>{d.day}</td>
              <td>{d.clicks}</td>
              <td>{d.new_users}</td>
              <td>{d.listings_published}</td>
              <td>{d.listings_sold}</td>
              <td>{d.messages}</td>
              <td>{d.offers}</td>
              <td>{d.reports_opened}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}

function Breakdown({ title, rows }: { title: string; rows: [string, number][] }) {
  return (
    <div className="card">
      <strong>{title}</strong>
      {rows.length === 0 ? (
        <span className="muted">No clicks yet.</span>
      ) : (
        <table>
          <tbody>
            {rows.map(([k, v]) => (
              <tr key={k}>
                <td>{k}</td>
                <td className="num" style={{ textAlign: 'right' }}>
                  {v}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
