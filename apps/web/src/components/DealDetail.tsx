import { formatAgo, formatEndsIn, formatPrice, percentOff } from '@pickledeals/shared';
import Link from 'next/link';

import { fetchProduct, fetchProductSlug, type ProductDetail } from '@/data/catalog';
import { fetchDeals } from '@/data/deals';
import { fetchMarket } from '@/data/market';
import { fetchLivePromos, fetchOffer, fetchProductOffers, type RankedOffer } from '@/data/offers';
import { productArt } from '@/lib/art';
import { AFFILIATE_DISCLOSURE, dealButtonLabel, ownershipDisclosure } from '@/lib/copy';
import { categoryHref, dealHref, productHref } from '@/lib/links';
import { goUrl, storageUrl } from '@/lib/urls';

import { DealCard } from './Cards';
import { Icon } from './Icon';
import { GetDealButton, ShareButton } from './client/Actions';
import { Gallery } from './client/Gallery';
import { SaveButton } from './client/SaveInApp';

export type DealData = {
  offer: RankedOffer;
  product: ProductDetail;
  variantLabel: string | null;
  msrpCents: number | null;
  offerCount: number;
  isLowest: boolean;
  usedCount: number;
  usedFromCents: number | null;
  promoTerms: string | null;
  promoEndsAt: string | null;
  promoVerifiedAt: string | null;
  disclosure: string | null;
};

export async function loadDeal(offerId: string): Promise<DealData | null> {
  if (!/^[0-9a-f-]{36}$/i.test(offerId)) return null;
  const offer = await fetchOffer(offerId);
  if (!offer) return null;
  const slug = await fetchProductSlug(offer.productId);
  const product = slug ? await fetchProduct(slug) : null;
  if (!product) return null;
  const [{ offers }, used, promos] = await Promise.all([
    fetchProductOffers(product.id),
    fetchMarket({ productId: product.id, origin: null, radiusM: null, statuses: ['active'], sort: 'price_asc', limit: 1 }),
    offer.promo ? fetchLivePromos([offer.retailer.slug]) : Promise.resolve([]),
  ]);
  const variant = product.variants.find((v) => v.id === offer.variantId) ?? null;
  const sameVariant = offers.filter((o) => o.variantId === offer.variantId);
  const promo = offer.promo ? promos.find((p) => p.id === offer.promo!.id) : undefined;
  return {
    offer,
    product,
    variantLabel: product.variants.length > 1 ? (variant?.label ?? null) : null,
    msrpCents: variant?.msrpCents ?? product.msrpCents,
    offerCount: sameVariant.length,
    isLowest: offer.rank === 1,
    usedCount: used.total,
    usedFromCents: used.items[0]?.priceCents ?? null,
    promoTerms: promo?.terms ?? null,
    promoEndsAt: promo?.endsAt ?? null,
    promoVerifiedAt: promo?.verifiedAt ?? null,
    disclosure: ownershipDisclosure([offer]),
  };
}

/** Deal detail (design: "Deal detail (promo code)"), used by the pop-up and the full page. */
export async function DealDetail({ data, headingLevel = 'h1' }: { data: DealData; headingLevel?: 'h1' | 'h2' }) {
  const { offer: o, product: p } = data;
  const name = data.variantLabel ? `${p.name} ${data.variantLabel}` : p.name;
  const H = headingLevel;
  const show = o.priceDisplay === 'show' && o.priceCents != null && o.deliveredCents != null;
  const youPay = o.deliveredCents;
  const ref = data.msrpCents;
  const pct = show && ref ? percentOff(youPay!, ref) : null;
  const images = p.images.map((i) => ({ src: storageUrl('catalog', i.path), cutout: i.isCutout }));
  const similar = (await fetchDeals({ feed: 'today', category: p.category.slug, limit: 8 })).items.filter((d) => d.product.id !== p.id).slice(0, 5);
  const status = [data.promoEndsAt ? formatEndsIn(data.promoEndsAt) : null, data.promoVerifiedAt ? `verified ${formatAgo(data.promoVerifiedAt)}` : `checked ${formatAgo(o.checkedAt)}`]
    .filter(Boolean)
    .join(' · ');

  return (
    <>
      <div className="detail">
        <Gallery images={images} art={productArt(p.slug, p.category.slug)} alt={`${p.brand.name} ${name}`} />
        <div className="detail-info" style={{ gap: 16 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <span className="eyebrow">
              {p.brand.name} · {p.category.name}
            </span>
            <H style={{ fontSize: 28, lineHeight: 1.15, fontWeight: 800, letterSpacing: '-0.02em', textWrap: 'balance' }}>
              {name}
              {o.promo ? ' — extra savings with code' : ''}
            </H>
            <span className="muted num" style={{ fontSize: 14 }}>
              {o.retailer.name} · {status}
              {o.inStock ? '' : ' · out of stock'}
            </span>
          </div>
          {show ? (
            <div className="breakdown num">
              {ref != null && ref > o.priceCents! && (
                <div className="r muted">
                  <span>List price</span>
                  <span style={{ textDecoration: 'line-through' }}>{formatPrice(ref)}</span>
                </div>
              )}
              <div className="r">
                <span>Price at {o.retailer.name}</span>
                <span>{formatPrice(o.priceCents!)}</span>
              </div>
              {o.promo && o.promo.discountCents > 0 && (
                <div className="r">
                  <span>Code {o.promo.code}</span>
                  <span>−{formatPrice(o.promo.discountCents)}</span>
                </div>
              )}
              <div className="r total">
                <b>You pay</b>
                <span className="v">
                  <b>{formatPrice(youPay!)}</b>
                  {pct != null && <span className="pill">−{pct}%</span>}
                </span>
              </div>
              <span className="foot">
                {pct != null && ref != null ? `Save ${formatPrice(ref - youPay!)} · ` : ''}shipping and tax at checkout
              </span>
            </div>
          ) : (
            <div className="breakdown">
              <b style={{ fontSize: 20 }}>Check the price at {o.retailer.name}</b>
              <span className="muted">The store shows the current price on its site.</span>
            </div>
          )}
          {o.promo && (
            <div className="code-row">
              <span className="l">
                <b>Promo code</b>
                <span>{[o.codeAutoApplied ? 'Applied at checkout' : 'Copied when you click Get deal', data.promoTerms].filter(Boolean).join(' · ')}</span>
              </span>
              <code>{o.promo.code}</code>
            </div>
          )}
          {o.sizes.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <span className="muted" style={{ fontSize: 13, fontWeight: 700 }}>
                Sizes in stock
              </span>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {o.sizes.slice(0, 16).map((s) => (
                  <span key={s} className="tag num">
                    {s}
                  </span>
                ))}
              </div>
            </div>
          )}
          <Link href={productHref(p.slug)} className="link-card">
            <span className="l">
              <b>Compare all offers</b>
              <span className="num">
                {[
                  data.offerCount > 1 ? (data.isLowest ? `This is the lowest of ${data.offerCount}` : `${data.offerCount} offers`) : 'Price history and specs',
                  data.usedCount ? `${data.usedCount} pre-owned${data.usedFromCents != null ? ` from ${formatPrice(data.usedFromCents)}` : ''}` : null,
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </span>
            </span>
            <Icon name="chevronRight" size={16} stroke={2.2} />
          </Link>
          <div style={{ display: 'flex', gap: 10 }}>
            <GetDealButton href={goUrl(o.offerId, 'deal', o.promo?.id)} code={o.promo && !o.codeAutoApplied ? o.promo.code : null} className="btn btn-primary">
              {show ? dealButtonLabel(o) : `Check price at ${o.retailer.name}`}
            </GetDealButton>
            <SaveButton title={`${p.brand.name} ${name}`} path={dealHref(o.offerId)} className="icon-btn lg" size={22} />
            <ShareButton path={dealHref(o.offerId)} title={`${p.brand.name} ${name}`} className="icon-btn lg" />
          </div>
          <p className="muted" style={{ fontSize: 12, lineHeight: 1.5 }}>
            Opens {o.retailer.name} in a new tab{o.promo && !o.codeAutoApplied ? '. The code is copied for you' : ''}. PickleDeals doesn’t handle checkout. {AFFILIATE_DISCLOSURE}
            {data.disclosure ? ` ${data.disclosure}` : ''}
          </p>
        </div>
      </div>
      {similar.length > 0 && (
        <section className="section" style={{ borderTop: '1px solid var(--separator)', paddingTop: 22 }}>
          <div className="section-head">
            <h2 style={{ fontSize: 20 }}>Similar deals</h2>
            <Link href={categoryHref(p.category.slug)} className="action">
              See all {p.category.name.toLowerCase()}
            </Link>
          </div>
          <div className="grid">
            {similar.map((d) => (
              <DealCard key={d.id} deal={d} />
            ))}
          </div>
        </section>
      )}
    </>
  );
}
