/**
 * Smart links (§ deep links): one short pickledeals.app URL per shareable item. The website renders a
 * preview page (with Open Graph tags) for people without the app; with the app installed, iOS opens
 * it directly (universal links) and `appRouteForLink` maps it to the in-app route. The site's
 * `api/share.js` parses the same paths, so keep the two in step.
 *
 *   /p/<product slug>             product
 *   /d/<offer id>[?deal=<id>]     deal (the offer's detail page)
 *   /l/<listing id>               pre-owned listing
 *   /b/<brand slug>               brand
 *   /open?to=<in-app route>       links in notification emails
 *
 * The website's own page addresses (/product/<slug>, /deal/<id>, /listing/<id>, /brand/<slug>,
 * /category/<slug>, /seller/<id>) map to the same screens, so a link copied from the site opens the app too.
 */

export const SHARE_ORIGIN = 'https://pickledeals.app';

export type ShareTarget =
  | { kind: 'product'; slug: string }
  | { kind: 'deal'; offerId: string; dealId?: string | null }
  | { kind: 'listing'; id: string }
  | { kind: 'brand'; slug: string };

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const IN_APP_ROUTE = /^\/[A-Za-z0-9/_-]*$/;

export function shareUrl(t: ShareTarget): string {
  switch (t.kind) {
    case 'product':
      return `${SHARE_ORIGIN}/p/${t.slug}`;
    case 'deal':
      return `${SHARE_ORIGIN}/d/${t.offerId}${t.dealId ? `?deal=${t.dealId}` : ''}`;
    case 'listing':
      return `${SHARE_ORIGIN}/l/${t.id}`;
    case 'brand':
      return `${SHARE_ORIGIN}/b/${t.slug}`;
  }
}

/**
 * The in-app route for an incoming link (a full URL or a bare path), or null when it isn't one of
 * ours and should be left alone.
 */
export function appRouteForLink(link: string): string | null {
  let url: URL;
  try {
    url = new URL(link, SHARE_ORIGIN);
  } catch {
    return null;
  }
  // pickledeals://p/x parses with "p" as the host: fold it back into the path.
  const path = url.protocol === 'pickledeals:' && url.host ? `/${url.host}${url.pathname}` : url.pathname;
  const [, kind, key, extra] = path.split('/');
  if (extra) return null;

  if (kind === 'open' && !key) {
    const to = url.searchParams.get('to');
    return to && IN_APP_ROUTE.test(to) ? to : '/';
  }
  if (!key) return null;
  if ((kind === 'p' || kind === 'product') && SLUG.test(key)) return `/deals/product/${key}`;
  if ((kind === 'b' || kind === 'brand') && SLUG.test(key)) return `/deals/brand/${key}`;
  if (kind === 'category' && SLUG.test(key)) return `/deals/category/${key}`;
  if ((kind === 'l' || kind === 'listing') && UUID.test(key)) return `/market/listing/${key.toLowerCase()}`;
  if (kind === 'seller' && UUID.test(key)) return `/market/seller/${key.toLowerCase()}`;
  if ((kind === 'd' || kind === 'deal') && UUID.test(key)) {
    const deal = url.searchParams.get('deal');
    return `/deals/offer/${key.toLowerCase()}${deal && UUID.test(deal) ? `?deal=${deal.toLowerCase()}` : ''}`;
  }
  return null;
}
