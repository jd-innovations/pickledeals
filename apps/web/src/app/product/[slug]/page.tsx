import { formatPrice, percentOff } from '@pickledeals/shared';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { DealCard, ListingCard } from '@/components/Cards';
import { Description } from '@/components/Description';
import { PriceChart } from '@/components/PriceChart';
import { GetDealButton, ShareButton } from '@/components/client/Actions';
import { Gallery } from '@/components/client/Gallery';
import { SaveButton } from '@/components/client/SaveInApp';
import { fetchProduct } from '@/data/catalog';
import { fetchDeals } from '@/data/deals';
import { fetchMarket } from '@/data/market';
import { fetchLivePromos, fetchPriceHistory, fetchProductOffers } from '@/data/offers';
import { productArt } from '@/lib/art';
import { AFFILIATE_DISCLOSURE, dealButtonLabel, deltaLabel, monogram, offerDetail, ownershipDisclosure, QUALITY_LABEL, qualityDetail, UNTRACKED_NOTE } from '@/lib/copy';
import { brandHref, categoryHref, productHref } from '@/lib/links';
import { goUrl, SITE_URL, storageUrl } from '@/lib/urls';

export const revalidate = 300;

type Props = { params: Promise<{ slug: string }>; searchParams: Promise<{ v?: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const p = await fetchProduct((await params).slug);
  if (!p) return {};
  const title = `${p.brand.name} ${p.name}`;
  const image = p.images[0] ? storageUrl('catalog', p.images[0].path) : undefined;
  return {
    title: `${title} — best price and deals`,
    description: `Compare ${title} prices across pickleball stores, with promo codes applied, price history and pre-owned listings.`,
    alternates: { canonical: productHref(p.slug) },
    openGraph: { title, type: 'website', images: image ? [image] : undefined },
  };
}

export default async function ProductPage({ params, searchParams }: Props) {
  const [{ slug }, { v }] = await Promise.all([params, searchParams]);
  const p = await fetchProduct(slug);
  if (!p) notFound();
  const name = `${p.brand.name} ${p.name}`;

  const [{ offers, stats }, used, similar] = await Promise.all([
    fetchProductOffers(p.id),
    fetchMarket({ productId: p.id, origin: null, radiusM: null, statuses: ['active'], sort: 'price_asc', limit: 3 }),
    fetchDeals({ feed: 'today', category: p.category.slug, limit: 12 }),
  ]);

  // Variant: the one asked for, else the one with the best price, else the default.
  const priced = (vid: string) => stats.find((s) => s.variantId === vid)?.bestDeliveredCents ?? Number.MAX_SAFE_INTEGER;
  const variant =
    p.variants.find((x) => x.id === v) ??
    [...p.variants].sort((a, b) => priced(a.id) - priced(b.id))[0] ??
    null;
  const vOffers = offers.filter((o) => !variant || o.variantId === variant.id);
  const stat = stats.find((s) => s.variantId === variant?.id) ?? null;
  const best = vOffers.find((o) => o.rank === 1 && o.priceDisplay === 'show' && o.priceSource !== 'api') ?? null;
  const bestCents = best?.deliveredCents ?? null;
  const msrp = variant?.msrpCents ?? p.msrpCents;
  const pct = bestCents != null && msrp ? percentOff(bestCents, msrp) : null;
  const [history, promos] = await Promise.all([variant ? fetchPriceHistory(variant.id, 90) : Promise.resolve([]), fetchLivePromos(best ? [best.retailer.slug] : [])]);
  const bestPromo = best?.promo ? promos.find((x) => x.id === best.promo!.id) : undefined;
  const untracked = vOffers.some((o) => o.trackingExcluded);
  const disclosure = ownershipDisclosure(vOffers);
  const specs = Object.entries(p.specs);
  const similarDeals = similar.items.filter((d) => d.product.id !== p.id).slice(0, 5);
  const images = p.images.map((i) => ({ src: storageUrl('catalog', i.path), cutout: i.isCutout }));

  // Structured data for search engines: only prices we show (D1: never Amazon or check-price offers).
  const shown = vOffers.filter((o) => o.priceDisplay === 'show' && o.priceSource !== 'api' && o.deliveredCents != null);
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name,
    brand: { '@type': 'Brand', name: p.brand.name },
    category: p.category.name,
    url: `${SITE_URL}${productHref(p.slug)}`,
    image: images.map((i) => i.src),
    ...(shown.length
      ? {
          offers: {
            '@type': 'AggregateOffer',
            priceCurrency: 'USD',
            lowPrice: (Math.min(...shown.map((o) => o.deliveredCents!)) / 100).toFixed(2),
            highPrice: (Math.max(...shown.map((o) => o.deliveredCents!)) / 100).toFixed(2),
            offerCount: shown.length,
          },
        }
      : {}),
  };

  return (
    <main className="page tight wrap" style={{ gap: 48 }}>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, '\\u003c') }} />
      <div className="section" style={{ gap: 20 }}>
        <nav className="crumbs" aria-label="Breadcrumb">
          <Link href={categoryHref(p.category.slug)}>{p.category.name}</Link>
          <span aria-hidden="true">›</span>
          <Link href={brandHref(p.brand.slug)}>{p.brand.name}</Link>
          <span aria-hidden="true">›</span>
          <span aria-current="page">{p.name}</span>
        </nav>
        <div className="detail">
          <Gallery images={images} art={productArt(p.slug, p.category.slug)} alt={name} />
          <div className="detail-info">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <Link href={brandHref(p.brand.slug)} className="eyebrow">
                {p.brand.name} · {p.category.name}
              </Link>
              <h1>{variant && p.variants.length > 1 ? `${p.name} ${variant.label}` : p.name}</h1>
              {(p.modelYear || specs.length > 0) && (
                <span className="muted num" style={{ fontSize: 14 }}>
                  {[...specs.slice(0, 2).map(([, val]) => val), p.modelYear ? `${p.modelYear} model` : null].filter(Boolean).join(' · ')}
                </span>
              )}
            </div>
            {p.variants.length > 1 && (
              <nav className="variants" aria-label="Options">
                {p.variants.map((x) => {
                  const c = stats.find((s) => s.variantId === x.id)?.bestDeliveredCents;
                  return (
                    <Link key={x.id} href={`${productHref(p.slug)}?v=${x.id}`} className="variant num" aria-current={x.id === variant?.id} scroll={false}>
                      <b>{x.label}</b>
                      <span>{c != null ? `from ${formatPrice(c)}` : 'Compare'}</span>
                    </Link>
                  );
                })}
              </nav>
            )}
            <div className="price-panel">
              {best && bestCents != null ? (
                <>
                  <span className="ey">
                    Best new price · {best.retailer.name}
                    {best.promo ? ' with code' : ''}
                  </span>
                  <div className="bp num">
                    <span className="p">{formatPrice(bestCents)}</span>
                    {pct != null && msrp != null && <span className="w">MSRP {formatPrice(msrp)}</span>}
                    {pct != null && <span className="pill">−{pct}%</span>}
                  </div>
                  <span className="muted num" style={{ fontSize: 15 }}>
                    {[pct != null && msrp != null ? `You save ${formatPrice(msrp - bestCents)}` : null, best.inStock ? 'in stock' : 'out of stock', best.shippingCents === 0 ? 'free shipping' : 'shipping at checkout']
                      .filter(Boolean)
                      .join(' · ')}
                  </span>
                  {stat?.quality && (
                    <div className="quality num">
                      <span className="pill">{QUALITY_LABEL[stat.quality]}</span>
                      <span>{qualityDetail(stat)}</span>
                    </div>
                  )}
                  {best.promo && !best.codeAutoApplied && (
                    <div className="code-row">
                      <span className="l">
                        <b>Promo code</b>
                        <span>{['Copied when you click Get deal', bestPromo?.terms].filter(Boolean).join(' · ')}</span>
                      </span>
                      <code>{best.promo.code}</code>
                    </div>
                  )}
                </>
              ) : (
                <>
                  <span className="ey">Prices</span>
                  <span style={{ fontSize: 22, fontWeight: 700 }}>{vOffers.length ? 'Check the price at the store' : 'No store has this in stock right now'}</span>
                </>
              )}
              <div className="actions">
                {best ? (
                  <GetDealButton href={goUrl(best.offerId, 'product', best.promo?.id)} code={best.promo && !best.codeAutoApplied ? best.promo.code : null}>
                    {dealButtonLabel(best)}
                  </GetDealButton>
                ) : (
                  vOffers[0] && (
                    <GetDealButton href={goUrl(vOffers[0].offerId, 'product')}>{`Check price at ${vOffers[0].retailer.name}`}</GetDealButton>
                  )
                )}
                <SaveButton title={name} path={productHref(p.slug)} className="icon-btn lg" size={22} />
                <SaveButton title={name} path={productHref(p.slug)} className="icon-btn lg" size={20} action="alert" />
                <ShareButton path={productHref(p.slug)} title={name} className="icon-btn lg" />
              </div>
              <span className="muted" style={{ fontSize: 12 }}>
                {AFFILIATE_DISCLOSURE}
              </span>
            </div>
          </div>
        </div>
      </div>

      <section className="two-col">
        <div className="section" style={{ gap: 6 }}>
          <div className="section-head" style={{ paddingBottom: 8 }}>
            <h2>All new offers</h2>
            {variant && p.variants.length > 1 && <span className="note">{variant.label}</span>}
          </div>
          {vOffers.length ? (
            vOffers.map((o) => (
              <div key={o.offerId} className="offer-row">
                <span className="mono" aria-hidden="true">
                  {monogram(o.retailer.name)}
                </span>
                <span className="mid">
                  <b>{o.retailer.name}</b>
                  <span className="num">{offerDetail(o)}</span>
                </span>
                {o.priceDisplay === 'show' && o.deliveredCents != null ? (
                  <span className="end num">
                    <b>{formatPrice(o.deliveredCents)}</b>
                    <span>{deltaLabel(o, bestCents)}</span>
                  </span>
                ) : (
                  <span className="end">
                    <b>—</b>
                  </span>
                )}
                <GetDealButton href={goUrl(o.offerId, 'product_offers', o.promo?.id)} code={o.promo && !o.codeAutoApplied ? o.promo.code : null} className={`btn btn-xs ${o.offerId === best?.offerId ? 'btn-primary' : 'btn-secondary'}`}>
                  {o.priceDisplay === 'show' ? 'Get deal' : 'Check price'}
                </GetDealButton>
              </div>
            ))
          ) : (
            <p className="muted">No store lists this right now. Check back soon, or see pre-owned below.</p>
          )}
          {disclosure && <p className="note-line" style={{ marginTop: 10 }}>{disclosure}</p>}
        </div>
        <div className="section" style={{ gap: 14 }}>
          <div className="section-head">
            <h2>Price history</h2>
            <span className="note">90 days</span>
          </div>
          <PriceChart
            points={history}
            typicalCents={stat?.typicalCents ?? null}
            label={`Lowest daily price over 90 days${bestCents != null ? `, now ${formatPrice(bestCents)}` : ''}${stat?.typicalCents != null ? `, typical ${formatPrice(stat.typicalCents)}` : ''}`}
          />
          {stat && (
            <div className="stats4 num">
              <div>
                <span>Now</span>
                <b>{bestCents != null ? formatPrice(bestCents) : '—'}</b>
              </div>
              <div>
                <span>Typical</span>
                <b>{stat.typicalCents != null ? formatPrice(stat.typicalCents) : '—'}</b>
              </div>
              <div>
                <span>90-day low</span>
                <b>{stat.low90dCents != null ? formatPrice(stat.low90dCents) : '—'}</b>
              </div>
              <div>
                <span>All-time low</span>
                <b>{stat.lowAllTimeCents != null ? formatPrice(stat.lowAllTimeCents) : '—'}</b>
              </div>
            </div>
          )}
          <span className="note-line">Tracked across the stores we check.{untracked ? ` ${UNTRACKED_NOTE}` : ''}</span>
        </div>
      </section>

      {(used.items.length > 0 || specs.length > 0) && (
        <section className="two-col">
          <div className="section" style={{ gap: 12 }}>
            <div className="section-head">
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                <h2>Pre-owned</h2>
                <span className="note num">
                  {used.total ? `${used.total} ${used.total === 1 ? 'listing' : 'listings'} from players` : 'No pre-owned listings right now'}
                </span>
              </div>
              {used.total > 0 && (
                <Link href={`/marketplace?product=${p.id}`} className="action">
                  View all
                </Link>
              )}
            </div>
            {used.items.length > 0 && (
              <div className="grid g3">
                {used.items.map((l) => (
                  <ListingCard key={l.id} listing={l} />
                ))}
              </div>
            )}
          </div>
          {specs.length > 0 && (
            <div className="section" style={{ gap: 12 }}>
              <h2 style={{ fontSize: 24, fontWeight: 700, letterSpacing: '-0.015em' }}>Specs</h2>
              <div className="specs">
                {specs.map(([k, val]) => (
                  <div key={k} className="r">
                    <span>{k}</span>
                    <b>{val}</b>
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>
      )}

      {p.description && p.description.length > 0 && (
        <section className="section">
          <div className="section-head">
            <h2>About this product</h2>
            <span className="note">From the store</span>
          </div>
          <Description blocks={p.description} />
        </section>
      )}

      {similarDeals.length > 0 && (
        <section className="section">
          <div className="section-head">
            <h2>Similar {p.category.name.toLowerCase()}</h2>
            <Link href={categoryHref(p.category.slug)} className="action">
              See all
            </Link>
          </div>
          <div className="grid">
            {similarDeals.map((d) => (
              <DealCard key={d.id} deal={d} />
            ))}
          </div>
        </section>
      )}
    </main>
  );
}
