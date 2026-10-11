/** URL builders safe for the browser bundle (no Supabase client here). */

export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL ?? 'https://pickledeals.app').replace(/\/$/, '');

/** Public Storage URL for catalog, brand-logo and listing images. */
export function storageUrl(bucket: 'catalog' | 'brand-logos' | 'listing-images', path: string): string {
  return `${SUPABASE_URL}/storage/v1/object/public/${bucket}/${path.split('/').map(encodeURIComponent).join('/')}`;
}

/**
 * "Get deal" goes through the go redirect, which adds the affiliate tag and logs the click (§10).
 * The site never builds retailer or affiliate URLs itself.
 */
export function goUrl(offerId: string, placement: string, promoId?: string | null): string {
  const q = new URLSearchParams({ o: offerId, pl: `web_${placement}`.slice(0, 40) });
  if (promoId) q.set('p', promoId);
  return `${SUPABASE_URL}/functions/v1/go?${q.toString()}`;
}
