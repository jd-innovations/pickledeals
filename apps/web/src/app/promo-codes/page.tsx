import { formatAgo, formatEndsIn } from '@pickledeals/shared';
import type { Metadata } from 'next';

import { DealCard } from '@/components/Cards';
import { Icon } from '@/components/Icon';
import { CodeButton } from '@/components/client/Actions';
import { fetchDeals } from '@/data/deals';
import { fetchLivePromos } from '@/data/offers';
import { monogram, promoValue } from '@/lib/copy';
import { FEED_PATHS } from '@/lib/links';

export const revalidate = 300;

export const metadata: Metadata = {
  title: 'Pickleball promo codes',
  description: 'Working promo codes from pickleball stores, each re-verified in the last 14 days, plus products priced after the code.',
  alternates: { canonical: '/promo-codes' },
};

export default async function PromoCodesPage() {
  const [promos, deals] = await Promise.all([fetchLivePromos(), fetchDeals({ feed: 'promo_codes', limit: 20, sort: 'best' })]);
  return (
    <main className="page tight wrap" style={{ gap: 36 }}>
      <div className="page-title">
        <h1>Promo codes</h1>
        <p className="sub num">
          {promos.length} {promos.length === 1 ? 'code' : 'codes'} from pickleball stores · each one re-verified in the last 14 days
        </p>
      </div>

      {promos.length ? (
        <section className="section" style={{ gap: 14 }}>
          <div className="section-head">
            <h2>Store-wide codes</h2>
          </div>
          <div className="promo-grid">
            {promos.map((p) => (
              <div key={p.id} className="promo big">
                <span className="mono" aria-hidden="true">
                  {monogram(p.retailerName)}
                </span>
                <span className="txt">
                  <b>{p.title || promoValue(p)}</b>
                  <span>{[p.retailerName, p.terms, p.isExclusive ? 'exclusive to PickleDeals' : null].filter(Boolean).join(' · ')}</span>
                  <span className="faint num" style={{ fontSize: 12 }}>
                    {[p.endsAt ? formatEndsIn(p.endsAt) : 'No end date', `verified ${formatAgo(p.verifiedAt)}`].join(' · ')}
                  </span>
                </span>
                <span className="side">
                  <CodeButton code={p.code} />
                </span>
              </div>
            ))}
          </div>
        </section>
      ) : (
        <div className="empty">
          <h2>No live codes right now</h2>
          <p>Codes appear here once we’ve checked they work. Check back soon.</p>
        </div>
      )}

      {deals.items.length > 0 && (
        <section className="section">
          <div className="section-head">
            <h2>Products with a code</h2>
            <a href={FEED_PATHS.promo_codes} className="action">
              See all {deals.total} <Icon name="chevronRight" size={12} stroke={2.4} />
            </a>
          </div>
          <p className="muted" style={{ fontSize: 13, marginTop: -8 }}>
            Prices shown after the code.
          </p>
          <div className="grid">
            {deals.items.slice(0, 10).map((d) => (
              <DealCard key={d.id} deal={d} />
            ))}
          </div>
        </section>
      )}
    </main>
  );
}
