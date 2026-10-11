// Smart-link preview pages: pickledeals.app/p|d|l|b/<key> (rewritten here by vercel.json).
// With the app installed iOS opens it directly (universal links, .well-known/apple-app-site-association);
// everyone else, and link-preview crawlers (iMessage, WhatsApp…), get this page with Open Graph tags.
// Reads only public data with the publishable key. Rules kept from the app:
//   D1  no number for check-price offers or live Amazon API prices
//   D2  listings show only their public area label, never a location
// Keep the paths in step with packages/shared/src/share.ts.

const SUPABASE_URL = 'https://tadxbjlhknukpyxbqrpt.supabase.co';
// Public publishable key (same as the app's; safe to ship).
const PUBLISHABLE_KEY = 'sb_publishable_gTRmKe2DsjR3g7xmj4XsEA_2EcRyVIw';
const SITE = 'https://pickledeals.app';
const FALLBACK_IMAGE = `${SITE}/brand/v2/pd-app-icon-1024.png`;

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const usd = (cents) => `$${(cents / 100).toLocaleString('en-US', { minimumFractionDigits: cents % 100 ? 2 : 0, maximumFractionDigits: 2 })}`;
const publicUrl = (bucket, path) => `${SUPABASE_URL}/storage/v1/object/public/${bucket}/${path.split('/').map(encodeURIComponent).join('/')}`;
const firstImage = (images) => [...(images ?? [])].sort((a, b) => a.sort - b.sort)[0]?.storage_path ?? null;

async function rest(path) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, { headers: { apikey: PUBLISHABLE_KEY, accept: 'application/json' } });
  if (!res.ok) throw new Error(`rest ${res.status}`);
  return res.json();
}

async function product(slug) {
  if (!SLUG.test(slug)) return null;
  const [p] = await rest(
    `products?slug=eq.${slug}&select=slug,name,brand:brands(name),images:product_images(storage_path,sort),variants:product_variants(id)`,
  );
  if (!p) return null;
  const ids = p.variants.map((v) => v.id);
  // Best tracked price: price stats already exclude Amazon (tracking_excluded), so D1 holds.
  const stats = ids.length ? await rest(`variant_price_stats?variant_id=in.(${ids.join(',')})&select=best_delivered_cents`) : [];
  const best = Math.min(...stats.map((s) => s.best_delivered_cents).filter((c) => c != null));
  const image = firstImage(p.images);
  return {
    eyebrow: p.brand.name,
    title: `${p.brand.name} ${p.name}`,
    price: Number.isFinite(best) ? `From ${usd(best)}` : null,
    detail: 'Compare prices and promo codes from pickleball stores.',
    image: image ? publicUrl('catalog', image) : null,
    route: `/deals/product/${p.slug}`,
  };
}

async function deal(offerId, dealId) {
  if (!UUID.test(offerId)) return null;
  const [o] = await rest(
    `variant_offer_ranking?offer_id=eq.${offerId}&select=product_id,retailer_name,price_display,price_source,delivered_cents,promo_code`,
  );
  if (!o) return null;
  const [p] = await rest(`products?id=eq.${o.product_id}&select=slug,name,brand:brands(name),images:product_images(storage_path,sort)`);
  if (!p) return null;
  const showPrice = o.price_display === 'show' && o.price_source !== 'api' && o.delivered_cents != null;
  const image = firstImage(p.images);
  return {
    eyebrow: `Deal at ${o.retailer_name}`,
    title: `${p.brand.name} ${p.name}`,
    price: showPrice ? `${usd(o.delivered_cents)}${o.promo_code ? ' with code' : ''} at ${o.retailer_name}` : `Check the price at ${o.retailer_name}`,
    detail: 'Prices can change. The price at the store’s checkout is the one that applies.',
    image: image ? publicUrl('catalog', image) : null,
    route: `/deals/offer/${offerId.toLowerCase()}${dealId && UUID.test(dealId) ? `?deal=${dealId.toLowerCase()}` : ''}`,
  };
}

async function listing(id) {
  if (!UUID.test(id)) return null;
  const [l] = await rest(
    `listings?id=eq.${id}&select=id,status,price_cents,custom_title,custom_brand_text,product:products(name,brand:brands(name)),images:listing_images(storage_path,sort),location:listing_locations(area_label)`,
  );
  if (!l || !['active', 'pending', 'sold'].includes(l.status)) return null;
  const brand = l.product?.brand?.name ?? l.custom_brand_text;
  const name = l.product?.name ?? l.custom_title;
  const image = firstImage(l.images);
  const status = l.status === 'sold' ? 'Sold' : l.status === 'pending' ? 'Pending' : null;
  return {
    eyebrow: ['Pre-owned', l.location?.area_label].filter(Boolean).join(' · '),
    title: [brand, name].filter(Boolean).join(' '),
    price: status ? `${status} · ${usd(l.price_cents)}` : usd(l.price_cents),
    detail: 'Message the seller and make an offer in the PickleDeals app.',
    image: image ? publicUrl('listing-images', image) : null,
    route: `/market/listing/${l.id}`,
  };
}

async function brand(slug) {
  if (!SLUG.test(slug)) return null;
  const [b] = await rest(`brands?slug=eq.${slug}&select=slug,name,logo_path`);
  if (!b) return null;
  return {
    eyebrow: 'Brand',
    title: b.name,
    price: null,
    detail: `${b.name} deals, promo codes and pre-owned gear on PickleDeals.`,
    image: b.logo_path ? publicUrl('brand-logos', b.logo_path) : null,
    route: `/deals/brand/${b.slug}`,
  };
}

function page(item, url, status) {
  const title = item ? `${item.title}${item.price ? ` · ${item.price}` : ''}` : 'Not found';
  const description = item ? item.detail : 'This item isn’t available anymore.';
  const image = item?.image ?? FALLBACK_IMAGE;
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${esc(title)} · PickleDeals</title>
  <meta name="description" content="${esc(description)}">
  ${status === 200 ? '' : '<meta name="robots" content="noindex">'}
  <meta property="og:site_name" content="PickleDeals">
  <meta property="og:type" content="website">
  <meta property="og:url" content="${esc(url)}">
  <meta property="og:title" content="${esc(title)}">
  <meta property="og:description" content="${esc(description)}">
  <meta property="og:image" content="${esc(image)}">
  <meta name="twitter:card" content="${item?.image ? 'summary_large_image' : 'summary'}">
  <link rel="stylesheet" href="/styles.css">
</head>
<body>
  <div class="wrap">
    <header class="site">
      <a class="brand" href="/" aria-label="PickleDeals home"><picture><source srcset="/brand/v2/pd-logo-white.svg" media="(prefers-color-scheme: dark)"><img src="/brand/v2/pd-logo-black.svg" alt="PickleDeals" width="135" height="36"></picture></a>
      <nav class="site"><a href="/support">Support</a><a href="/privacy">Privacy</a><a href="/terms">Terms</a></nav>
    </header>
    <main class="doc share">
      ${
        item
          ? `${item.image ? `<div class="share-image"><img src="${esc(item.image)}" alt=""></div>` : ''}
      <p class="meta share-eyebrow">${esc(item.eyebrow)}</p>
      <h1>${esc(item.title)}</h1>
      ${item.price ? `<p class="share-price">${esc(item.price)}</p>` : ''}
      <p class="meta">${esc(item.detail)}</p>
      <p><a class="pill" href="pickledeals:/${esc(item.route)}">Open in PickleDeals</a></p>
      <p class="meta">PickleDeals is an iPhone app for pickleball deals and pre-owned gear.</p>`
          : `<h1>Not found</h1>
      <p class="meta">This item isn’t available anymore. <a href="/">Go to PickleDeals</a>.</p>`
      }
    </main>
    <footer class="site">
      <a href="/support">Support</a><a href="/privacy">Privacy Policy</a><a href="/terms">Terms of Use</a>
      <p>© 2026 JD Innovations LLC</p>
    </footer>
  </div>
</body>
</html>`;
}

module.exports = async (req, res) => {
  const q = new URL(req.url, SITE).searchParams;
  const kind = q.get('kind');
  const key = q.get('key') ?? '';
  const url = `${SITE}/${kind}/${key}${kind === 'd' && q.get('deal') ? `?deal=${q.get('deal')}` : ''}`;
  let item = null;
  try {
    if (kind === 'p') item = await product(key);
    else if (kind === 'd') item = await deal(key, q.get('deal'));
    else if (kind === 'l') item = await listing(key);
    else if (kind === 'b') item = await brand(key);
  } catch {
    res.statusCode = 503;
    res.setHeader('content-type', 'text/html; charset=utf-8');
    res.setHeader('cache-control', 'no-store');
    return res.end(page(null, url, 503));
  }
  const status = item ? 200 : 404;
  res.statusCode = status;
  res.setHeader('content-type', 'text/html; charset=utf-8');
  // Short CDN cache: prices change; crawlers re-fetch rarely anyway.
  res.setHeader('cache-control', item ? 'public, s-maxage=300, stale-while-revalidate=600' : 'public, s-maxage=60');
  res.end(page(item, url, status));
};
