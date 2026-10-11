import { formatApproxDistance, formatEndsIn, formatPrice, percentOff, pickDealBadge } from '@pickledeals/shared';
import Link from 'next/link';

import type { BrandSummary, ProductSummary } from '@/data/catalog';
import type { Deal } from '@/data/deals';
import type { ListingCardItem } from '@/data/market';
import type { LivePromo } from '@/data/offers';
import { conditionLabel, dealMeta, dealPercent, dealReference, monogram, promoValue } from '@/lib/copy';
import { brandHref, dealHref, listingHref, productHref } from '@/lib/links';
import { storageUrl } from '@/lib/urls';

import { Icon } from './Icon';
import { ListingTile, ProductTile } from './Tile';
import { CodeButton } from './client/Actions';
import { SaveButton } from './client/SaveInApp';

const dealName = (d: Deal) => (d.variant.hasSiblings ? `${d.product.name} ${d.variant.label}` : d.product.name);

/** Deal card (design: "Deal card"). Opens the deal pop-up; D1 check-price deals never show a number. */
export function DealCard({ deal, rank, priority }: { deal: Deal; rank?: number; priority?: boolean }) {
  const name = dealName(deal);
  const pct = dealPercent(deal);
  const ref = dealReference(deal);
  const badge = pickDealBadge(deal.badges);
  return (
    <article className="card">
      <Link href={dealHref(deal.offerId)} scroll={false}>
        <ProductTile image={deal.image} productSlug={deal.product.slug} categorySlug={deal.category.slug} alt={`${deal.brand.name} ${name}`} priority={priority}>
          {badge && <span className="badge corner">{badge}</span>}
          {rank != null && <span className="rank num corner-b">{rank}</span>}
        </ProductTile>
        <span className="brand">{deal.brand.name}</span>
        <span className="name clamp2">{name}</span>
        {deal.priceDisplay === 'show' && deal.priceCents != null ? (
          <span className="price-row num">
            <span className="price">{formatPrice(deal.priceCents)}</span>
            {pct != null && ref != null && <span className="was">{formatPrice(ref)}</span>}
            {pct != null && <span className="pill">−{pct}%</span>}
          </span>
        ) : (
          <span className="check">
            Check price <Icon name="external" size={12} stroke={2.2} />
          </span>
        )}
        <span className="meta num">{dealMeta(deal, formatEndsIn)}</span>
      </Link>
      <span className="fav">
        <SaveButton title={`${deal.brand.name} ${name}`} path={dealHref(deal.offerId)} />
      </span>
    </article>
  );
}

/** Product card for catalog lists (brand, category, search): best tracked price when there is one. */
export function ProductCard({ product, bestCents }: { product: ProductSummary; bestCents?: number | null }) {
  const pct = bestCents != null && product.msrpCents ? percentOff(bestCents, product.msrpCents) : null;
  return (
    <article className="card">
      <Link href={productHref(product.slug)}>
        <ProductTile image={product.image} productSlug={product.slug} categorySlug={product.category.slug} alt={`${product.brand.name} ${product.name}`} />
        <span className="brand">{product.brand.name}</span>
        <span className="name clamp2">{product.name}</span>
        {bestCents != null ? (
          <span className="price-row num">
            <span className="price">{formatPrice(bestCents)}</span>
            {pct != null && pct > 0 && <span className="was">{formatPrice(product.msrpCents!)}</span>}
            {pct != null && pct > 0 && <span className="pill">−{pct}%</span>}
          </span>
        ) : (
          <span className="check">Compare prices</span>
        )}
        <span className="meta">{product.category.name}</span>
      </Link>
      <span className="fav">
        <SaveButton title={`${product.brand.name} ${product.name}`} path={productHref(product.slug)} />
      </span>
    </article>
  );
}

export function listingTitle(l: Pick<ListingCardItem, 'brandName' | 'title' | 'variantLabel' | 'hasVariants'>) {
  return [l.brandName, l.title, l.hasVariants ? l.variantLabel : null].filter(Boolean).join(' ');
}

/** Pre-owned card. D2: area label and an approximate distance only. */
export function ListingCard({ listing, selected }: { listing: ListingCardItem; selected?: boolean }) {
  const title = listingTitle(listing);
  const where = [listing.areaLabel, listing.distanceM != null ? formatApproxDistance(listing.distanceM) : null, listing.ships && !listing.pickup ? 'ships' : listing.ships ? 'or ships' : null]
    .filter(Boolean)
    .join(' · ');
  return (
    <article className={`card${selected ? ' sel' : ''}`} data-listing={listing.id}>
      <Link href={listingHref(listing.id)}>
        <ListingTile path={listing.imagePath} categorySlug={listing.categorySlug} seed={listing.id} alt={title}>
          <span className="cond corner-b">{listing.status === 'pending' ? 'Pending' : conditionLabel(listing.condition)}</span>
        </ListingTile>
        <span className="price-row num">
          <span className="price">{formatPrice(listing.priceCents)}</span>
          {listing.bestNewCents != null && <span className="meta">New {formatPrice(listing.bestNewCents)}</span>}
        </span>
        <span className="name clamp2" style={{ minHeight: 0 }}>
          {title}
        </span>
        <span className="meta num">{where}</span>
      </Link>
      <span className="fav">
        <SaveButton title={title} path={listingHref(listing.id)} />
      </span>
    </article>
  );
}

/** Promo code row (design: dashed border, store monogram, the code as a copy button). */
export function PromoRow({ promo, big }: { promo: LivePromo; big?: boolean }) {
  const ends = promo.endsAt ? formatEndsIn(promo.endsAt).replace(/^E/, 'e') : null;
  return (
    <div className={`promo${big ? ' big' : ''}`}>
      <span className="mono" aria-hidden="true">
        {monogram(promo.retailerName)}
      </span>
      <span className="txt">
        <b>{promo.title || promoValue(promo)}</b>
        <span>{[promo.retailerName, promo.terms, ends, promo.isExclusive ? 'exclusive' : null].filter(Boolean).join(' · ')}</span>
      </span>
      <CodeButton code={promo.code} />
    </div>
  );
}

/** Numbered price-drop row (home "Biggest price drops"). */
export function DropRow({ deal, n }: { deal: Deal; n: number }) {
  const name = dealName(deal);
  const ref = dealReference(deal);
  const show = deal.priceDisplay === 'show' && deal.priceCents != null;
  return (
    <Link href={dealHref(deal.offerId)} scroll={false} className="row-link">
      <span className="n num">{n}</span>
      <span className="thumb">
        <ProductTile image={deal.image} productSlug={deal.product.slug} categorySlug={deal.category.slug} alt="" />
      </span>
      <span className="mid">
        <span className="b">{deal.brand.name}</span>
        <span className="t">{name}</span>
        <span className="s num">{deal.retailer.name}</span>
      </span>
      {show ? (
        <span className="end num">
          <span className="p">{formatPrice(deal.priceCents!)}</span>
          {ref != null && ref > deal.priceCents! && <span className="w">{formatPrice(ref)}</span>}
          {deal.drop7dCents >= 100 && (
            <span className="d">
              <Icon name="arrowDown" size={12} stroke={2.6} /> {formatPrice(deal.drop7dCents)} this week
            </span>
          )}
        </span>
      ) : (
        <span className="end">
          <span className="p">Check price</span>
        </span>
      )}
    </Link>
  );
}

export function BrandChip({ brand, count }: { brand: Pick<BrandSummary, 'slug' | 'name' | 'logoPath'>; count?: string }) {
  return (
    <Link href={brandHref(brand.slug)} className="brand-chip">
      <span className="m">
        {brand.logoPath ? (
          <img src={storageUrl('brand-logos', brand.logoPath)} alt="" loading="lazy" />
        ) : (
          monogram(brand.name)
        )}
      </span>
      <b>{brand.name}</b>
      {count && <span className="num">{count}</span>}
    </Link>
  );
}
