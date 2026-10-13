import { Avatar } from './Avatar';
import { Icon } from './Icon';

import type { SellerReviews } from '@/data/market';

const month = (iso: string) => new Date(iso).toLocaleDateString('en-US', { month: 'short', year: 'numeric', timeZone: 'UTC' });

/** "★ 4.8 (12)": the average with its count; null until there's a review (same as the app). */
export const ratingLine = (r: SellerReviews | null) => (r && r.count > 0 && r.average != null ? `★ ${r.average.toFixed(1)} (${r.count})` : null);

export function Stars({ rating, size = 14 }: { rating: number; size?: number }) {
  return (
    <span className="stars" role="img" aria-label={`${rating} out of 5 stars`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <span key={n} className={n <= rating ? 'on' : undefined}>
          <Icon name="star" size={size} filled={n <= rating} stroke={1.6} />
        </span>
      ))}
    </span>
  );
}

/** A seller's newest reviews (read-only; writing and reporting happen in the app). */
export function ReviewList({ reviews }: { reviews: SellerReviews }) {
  return (
    <ul className="reviews">
      {reviews.items.map((r) => (
        <li key={r.id}>
          <div className="who">
            <Avatar name={r.reviewerName} path={r.reviewerAvatar} size={32} />
            <span style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
              <b style={{ fontSize: 15 }}>{r.reviewerName}</b>
              <span className="muted num" style={{ fontSize: 13 }}>
                {[r.item, month(r.createdAt)].filter(Boolean).join(' · ')}
              </span>
            </span>
            <Stars rating={r.rating} />
          </div>
          {r.body && <p className="prose">{r.body}</p>}
        </li>
      ))}
    </ul>
  );
}
