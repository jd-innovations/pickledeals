/**
 * Domain vocabularies shared by mobile, admin and (mirrored as Postgres enums) the database.
 * Keep values in sync with supabase/migrations when the matching tables land.
 */

export const LISTING_CONDITIONS = [
  { value: 'new_sealed', label: 'New / Sealed', description: 'Never used, in the original packaging with tags or wrap.' },
  { value: 'like_new', label: 'Like New', description: 'Played fewer than 5 times. No visible wear on face, edge or grip.' },
  { value: 'excellent', label: 'Excellent', description: 'Light use. Minor surface marks only; edge guard intact; grip clean.' },
  { value: 'good', label: 'Good', description: 'Regular use. Scuffs or face wear; grip may need replacing. Fully playable.' },
  { value: 'fair', label: 'Fair', description: 'Heavy wear or cosmetic damage. Playable — every flaw shown in photos.' },
] as const;
export type ListingCondition = (typeof LISTING_CONDITIONS)[number]['value'];

export const LISTING_STATUSES = ['draft', 'active', 'pending', 'sold', 'removed'] as const;
export type ListingStatus = (typeof LISTING_STATUSES)[number];

export const OFFER_STATUSES = ['pending', 'accepted', 'declined', 'countered', 'withdrawn', 'expired'] as const;
export type OfferStatus = (typeof OFFER_STATUSES)[number];

/** D1: Amazon (and any offer without compliant live pricing) renders a CTA instead of a price. */
export const PRICE_DISPLAY_MODES = ['show', 'check_price'] as const;
export type PriceDisplayMode = (typeof PRICE_DISPLAY_MODES)[number];

export const PRICE_SOURCES = ['manual', 'feed', 'api'] as const;
export type PriceSource = (typeof PRICE_SOURCES)[number];

/** D8: catalog image provenance. */
export const IMAGE_SOURCES = ['brand_supplied', 'manufacturer_site', 'retailer_feed', 'affiliate_feed', 'owned'] as const;
export type ImageSource = (typeof IMAGE_SOURCES)[number];

/** One badge per card; when several apply, the first in this order wins. */
export const DEAL_BADGES = ['LOWEST PRICE', 'PRICE DROP', 'ENDING SOON', 'PROMO CODE', 'HOT DEAL', 'NEW DEAL'] as const;
export type DealBadge = (typeof DEAL_BADGES)[number];

export function pickDealBadge(applicable: readonly DealBadge[]): DealBadge | null {
  return DEAL_BADGES.find((b) => applicable.includes(b)) ?? null;
}

export const DEAL_QUALITY = ['above_typical', 'typical', 'good', 'excellent', 'all_time_low'] as const;
export type DealQuality = (typeof DEAL_QUALITY)[number];

/** D5 tabs. */
export const TABS = ['deals', 'market', 'sell', 'alerts', 'profile'] as const;
export type Tab = (typeof TABS)[number];

/** D6: identity-dependent actions that trigger the auth sheet for guests. */
export const AUTH_INTENTS = [
  'save_product',
  'save_deal',
  'save_listing',
  'create_price_alert',
  'follow_brand',
  'save_search',
  'message_seller',
  'make_offer',
  'create_listing',
  'manage_listings',
  'report',
  'view_saved',
] as const;
export type AuthIntent = (typeof AUTH_INTENTS)[number];

/** Intents that put the user's name in front of other people; they need a chosen display name. */
export const PUBLIC_IDENTITY_INTENTS: readonly AuthIntent[] = ['message_seller', 'make_offer', 'create_listing'];
export const requiresPublicName = (intent: AuthIntent) => PUBLIC_IDENTITY_INTENTS.includes(intent);
