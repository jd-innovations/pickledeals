import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { Avatar } from '@/components/Avatar';
import { ListingCard } from '@/components/Cards';
import { InAppButton } from '@/components/client/SaveInApp';
import { ratingLine, ReviewList } from '@/components/Reviews';
import { fetchSeller, fetchSellerReviews } from '@/data/market';
import { sellerHref } from '@/lib/links';

export const revalidate = 300;

type Props = { params: Promise<{ id: string }> };

const valid = (id: string) => /^[0-9a-f-]{36}$/i.test(id);

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const s = valid(id) ? await fetchSeller(id) : null;
  if (!s) return { title: 'Seller not found', robots: { index: false } };
  return { title: `${s.name}’s pre-owned gear`, robots: { index: false } };
}

/** Seller's public profile: display name, rating, member since, area, live listings and reviews. */
export default async function SellerPage({ params }: Props) {
  const { id } = await params;
  const [s, reviews] = valid(id) ? await Promise.all([fetchSeller(id), fetchSellerReviews(id)]) : [null, null];
  if (!s) notFound();
  return (
    <main className="page tight wrap">
      <nav className="crumbs" aria-label="Breadcrumb">
        <Link href="/marketplace">Pre-owned</Link>
        <span aria-hidden="true">›</span>
        <span aria-current="page">{s.name}</span>
      </nav>
      <section style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
        <Avatar name={s.name} path={s.avatarPath} size={72} />
        <div className="page-title">
          <h1>{s.name}</h1>
          <p className="sub num">{[ratingLine(reviews), `Member since ${new Date(s.memberSince).getFullYear()}`, s.areaLabel, `${s.listings.length} ${s.listings.length === 1 ? 'listing' : 'listings'}`].filter(Boolean).join(' · ')}</p>
        </div>
      </section>
      {s.listings.length ? (
        <div className="grid">
          {s.listings.map((l) => (
            <ListingCard key={l.id} listing={l} />
          ))}
        </div>
      ) : (
        <div className="empty">
          <h2>No listings right now</h2>
          <p>{s.name} has nothing for sale at the moment.</p>
        </div>
      )}
      {reviews && reviews.count > 0 && (
        <section style={{ display: 'flex', flexDirection: 'column', gap: 4, maxWidth: 720 }}>
          <h2 style={{ fontSize: 22 }} className="num">
            Reviews · {ratingLine(reviews)}
          </h2>
          <ReviewList reviews={reviews} />
          {reviews.count > reviews.items.length && (
            <p className="faint num" style={{ fontSize: 13 }}>
              Showing the newest {reviews.items.length} of {reviews.count}.
            </p>
          )}
        </section>
      )}
      <InAppButton title={s.name} path={sellerHref(s.id)} action="report" className="text-btn">
        Report this seller in the app
      </InAppButton>
    </main>
  );
}
