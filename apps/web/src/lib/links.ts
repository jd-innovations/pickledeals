import type { Feed } from '@/data/deals';

/** Clean page addresses (approved plan). Short share links /p /d /l /b redirect to these. */

export const productHref = (slug: string) => `/product/${slug}`;
export const dealHref = (offerId: string) => `/deal/${offerId}`;
export const brandHref = (slug: string) => `/brand/${slug}`;
export const categoryHref = (slug: string) => `/category/${slug}`;
export const collectionHref = (slug: string) => `/collection/${slug}`;
export const listingHref = (id: string) => `/listing/${id}`;
export const sellerHref = (id: string) => `/seller/${id}`;

/** Deal feeds by address segment. "today" is /deals. */
export const FEED_PATHS: Record<Feed, string> = {
  today: '/deals',
  price_drops: '/deals/price-drops',
  ending_soon: '/deals/ending-soon',
  promo_codes: '/deals/promo-codes',
  under_50: '/deals/under-50',
  under_100: '/deals/under-100',
  new: '/deals/new',
  staff_picks: '/deals/staff-picks',
};

export const FEED_TITLES: Record<Feed, string> = {
  today: 'Today’s deals',
  price_drops: 'Price drops',
  ending_soon: 'Ending soon',
  promo_codes: 'Deals with a promo code',
  under_50: 'Deals under $50',
  under_100: 'Deals under $100',
  new: 'New deals',
  staff_picks: 'Staff picks',
};

export const FEED_SUBTITLES: Record<Feed, string> = {
  today: 'Every live deal from pickleball stores, best first.',
  price_drops: 'Deals that got cheaper this week. Amazon prices aren’t tracked.',
  ending_soon: 'Sales and codes that end in the next few days.',
  promo_codes: 'Products with a working code, priced after the code.',
  under_50: 'Grips, balls, bags and more for under $50.',
  under_100: 'Gear for under $100.',
  new: 'Deals added in the last few days.',
  staff_picks: 'Hand-picked by the PickleDeals team.',
};

export function feedFromSegment(segment: string): Feed | null {
  const entry = Object.entries(FEED_PATHS).find(([, path]) => path === `/deals/${segment}`);
  return (entry?.[0] as Feed | undefined) ?? null;
}
