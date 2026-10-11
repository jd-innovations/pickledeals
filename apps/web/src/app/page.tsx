import { formatAgo, formatPrice, pickDealBadge } from '@pickledeals/shared';
import Link from 'next/link';

import { BrandChip, DealCard, DropRow, PromoRow } from '@/components/Cards';
import { Nearby } from '@/components/client/Nearby';
import { GetDealButton } from '@/components/client/Actions';
import { SaveButton } from '@/components/client/SaveInApp';
import { ProductArt } from '@/components/ProductArt';
import { ProductTile } from '@/components/Tile';
import { fetchBrands } from '@/data/catalog';
import { fetchHome } from '@/data/deals';
import { categoryArt } from '@/lib/art';
import { dealButtonLabel, dealPercent, dealReference } from '@/lib/copy';
import { categoryHref, collectionHref, dealHref, FEED_PATHS, productHref } from '@/lib/links';
import { goUrl } from '@/lib/urls';

export const revalidate = 300;

const CHIPS = [
  ['Today', '/'],
  ['Price drops', FEED_PATHS.price_drops],
  ['Ending soon', FEED_PATHS.ending_soon],
  ['Promo codes', '/promo-codes'],
  ['Under $50', FEED_PATHS.under_50],
  ['New', FEED_PATHS.new],
  ['Paddles', categoryHref('paddles')],
  ['Shoes', categoryHref('shoes')],
] as const;

export default async function HomePage() {
  const [home, brands] = await Promise.all([fetchHome(), fetchBrands()]);
  const hero = home.hero;
  const heroName = hero ? (hero.variant.hasSiblings ? `${hero.product.name} ${hero.variant.label}` : hero.product.name) : '';
  const heroPct = hero ? dealPercent(hero) : null;
  const heroRef = hero ? dealReference(hero) : null;
  const heroBadge = hero ? pickDealBadge(hero.badges) : null;
  const staff = home.collections[0];

  return (
    <main className="page wrap">
      <section className="section" style={{ gap: 14 }}>
        <div className="inline-title">
          <h1 style={{ fontSize: 'clamp(30px, 4vw, 40px)', fontWeight: 800, letterSpacing: '-0.03em' }}>Today’s pickleball deals</h1>
          <span className="muted num" style={{ fontSize: 15 }}>
            {home.liveCount} live {home.liveCount === 1 ? 'deal' : 'deals'}
            {home.checkedAt ? ` · prices checked ${formatAgo(home.checkedAt)}` : ''}
          </span>
        </div>
        <nav className="chips noscroll" aria-label="Deal lists">
          {CHIPS.map(([label, href], i) => (
            <Link key={href} href={href} className={`chip${i === 0 ? ' on' : ''}`}>
              {label}
            </Link>
          ))}
        </nav>
      </section>

      {!hero && !home.priceDrops.length ? (
        <div className="empty">
          <h2>No live deals right now</h2>
          <p>We re-check prices through the day. Browse the catalog in the meantime.</p>
          <Link href="/categories" className="btn btn-primary btn-sm">
            Browse categories
          </Link>
        </div>
      ) : (
        <section className="home-top">
          {hero && (
            <div className="section" style={{ gap: 14 }}>
              <div className="section-head">
                <h2>Today’s best deal</h2>
                <span className="note">{hero.isStaffPick ? 'Staff pick' : 'Organic pick'}</span>
              </div>
              <div className="hero">
                <Link href={dealHref(hero.offerId)} scroll={false} aria-label={`${hero.brand.name} ${heroName}`}>
                  <ProductTile image={hero.image} productSlug={hero.product.slug} categorySlug={hero.category.slug} alt={`${hero.brand.name} ${heroName}`} priority>
                    {heroBadge && <span className="badge solid corner">{heroBadge}</span>}
                    <span className="fav">
                      <SaveButton title={`${hero.brand.name} ${heroName}`} path={dealHref(hero.offerId)} className="fav-btn glass" size={20} />
                    </span>
                  </ProductTile>
                </Link>
                <div className="info">
                  <span className="eyebrow">
                    {hero.brand.name} · {hero.category.name}
                  </span>
                  <h3>{heroName}</h3>
                  {hero.priceDisplay === 'show' && hero.priceCents != null ? (
                    <div className="bigprice num">
                      <span className="p">{formatPrice(hero.priceCents)}</span>
                      {heroPct != null && heroRef != null && <span className="w">{formatPrice(heroRef)}</span>}
                      {heroPct != null && <span className="pill">−{heroPct}%</span>}
                    </div>
                  ) : (
                    <div className="bigprice">
                      <span className="p" style={{ fontSize: 28 }}>
                        Check price at {hero.retailer.name}
                      </span>
                    </div>
                  )}
                  <span className="detail num">
                    {[
                      heroRef != null && hero.priceCents != null && heroPct != null ? `Save ${formatPrice(heroRef - hero.priceCents)} at ${hero.retailer.name}` : `At ${hero.retailer.name}`,
                      hero.promo ? `with code ${hero.promo.code}` : null,
                    ]
                      .filter(Boolean)
                      .join(' ')}
                    {hero.offerCount > 1 ? ` · ${hero.offerCount - 1} other ${hero.offerCount - 1 === 1 ? 'offer' : 'offers'}` : ''}
                  </span>
                  <div className="actions">
                    <GetDealButton href={goUrl(hero.offerId, 'home_hero', hero.promo?.id)} code={hero.promo?.code}>
                      {hero.promo ? 'Get deal' : dealButtonLabel({ promo: null, codeAutoApplied: false, retailer: hero.retailer })}
                    </GetDealButton>
                    <Link href={productHref(hero.product.slug)} className="btn btn-plain">
                      Compare
                    </Link>
                  </div>
                </div>
              </div>
            </div>
          )}
          {home.priceDrops.length > 0 ? (
            <div className="section" style={{ gap: 6 }}>
              <div className="section-head" style={{ paddingBottom: 8 }}>
                <h2>Biggest price drops</h2>
                <Link href={FEED_PATHS.price_drops} className="action">
                  See all
                </Link>
              </div>
              {home.priceDrops.slice(0, 5).map((d, i) => (
                <DropRow key={d.id} deal={d} n={i + 1} />
              ))}
            </div>
          ) : (
            home.promos.length > 0 && (
              <div className="section" style={{ gap: 10 }}>
                <div className="section-head" style={{ paddingBottom: 4 }}>
                  <h2>Promo codes</h2>
                  <Link href="/promo-codes" className="action">
                    See all
                  </Link>
                </div>
                {home.promos.slice(0, 4).map((p) => (
                  <PromoRow key={p.id} promo={p} />
                ))}
              </div>
            )
          )}
        </section>
      )}

      {home.trending && home.trending.items.length > 0 && (
        <section className="section">
          <div className="section-head">
            <h2>Trending {home.trending.category.name.toLowerCase()}</h2>
            <Link href={categoryHref(home.trending.category.slug)} className="action">
              See all
            </Link>
          </div>
          <div className="rail noscroll">
            {home.trending.items.slice(0, 10).map((d, i) => (
              <DealCard key={d.id} deal={d} rank={i + 1} />
            ))}
          </div>
        </section>
      )}

      {(staff || (home.priceDrops.length > 0 && home.promos.length > 0)) && (
        <section className="two-col" style={{ gap: 32 }}>
          {staff ? (
            <Link href={collectionHref(staff.slug)} className="staff-card">
              <span className="ey">{staff.eyebrow ?? 'Staff picks · updated daily'}</span>
              <h3>{staff.title}</h3>
              <span className="sub num">
                {staff.dealCount} {staff.dealCount === 1 ? 'deal' : 'deals'}
                {staff.fromCents != null ? ` · from ${formatPrice(staff.fromCents)}` : ''}
              </span>
              <span className="float a tile" aria-hidden="true">
                <ProductArt {...categoryArt('shoes')} />
              </span>
              <span className="float b tile" aria-hidden="true">
                <ProductArt {...categoryArt('paddles')} />
              </span>
              <span className="go">Shop {staff.title.split(' ')[0]?.toLowerCase()}</span>
            </Link>
          ) : (
            <span />
          )}
          {home.priceDrops.length > 0 && home.promos.length > 0 && (
            <div className="section" style={{ gap: 10 }}>
              <div className="section-head" style={{ paddingBottom: 4 }}>
                <h2>Promo codes</h2>
                <Link href="/promo-codes" className="action">
                  See all
                </Link>
              </div>
              {home.promos.slice(0, 3).map((p) => (
                <PromoRow key={p.id} promo={p} />
              ))}
            </div>
          )}
        </section>
      )}

      {home.under100.length > 0 && (
        <section className="section">
          <div className="section-head">
            <h2>Under $100</h2>
            <Link href={FEED_PATHS.under_100} className="action">
              See all
            </Link>
          </div>
          <div className="grid">
            {home.under100.slice(0, 10).map((d) => (
              <DealCard key={d.id} deal={d} />
            ))}
          </div>
        </section>
      )}

      <Nearby />

      {brands.length > 0 && (
        <section className="section">
          <div className="section-head">
            <h2>Popular brands</h2>
            <Link href="/brands" className="action">
              All brands
            </Link>
          </div>
          <div className="brands-row noscroll">
            {brands.slice(0, 10).map((b) => (
              <BrandChip key={b.slug} brand={b} count={`${b.productCount} ${b.productCount === 1 ? 'product' : 'products'}`} />
            ))}
          </div>
        </section>
      )}
    </main>
  );
}
