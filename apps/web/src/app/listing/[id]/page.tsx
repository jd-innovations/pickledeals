import { formatAgo, formatPrice } from '@pickledeals/shared';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { ShareButton } from '@/components/client/Actions';
import { Gallery } from '@/components/client/Gallery';
import { InAppButton, SaveButton } from '@/components/client/SaveInApp';
import { Avatar } from '@/components/Avatar';
import { Icon } from '@/components/Icon';
import { ratingLine } from '@/components/Reviews';
import { fetchListing, fetchSellerReviews } from '@/data/market';
import { productArt } from '@/lib/art';
import { conditionLabel } from '@/lib/copy';
import { listingHref, productHref, sellerHref } from '@/lib/links';
import { storageUrl } from '@/lib/urls';

export const revalidate = 120;

type Props = { params: Promise<{ id: string }> };

const valid = (id: string) => /^[0-9a-f-]{36}$/i.test(id);

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const l = valid(id) ? await fetchListing(id) : null;
  if (!l) return { title: 'Listing not found', robots: { index: false } };
  const title = [l.brand, l.title, l.variantLabel].filter(Boolean).join(' ');
  return {
    title: `${title} — pre-owned, ${formatPrice(l.priceCents)}`,
    description: `${conditionLabel(l.condition)} · ${l.areaLabel ?? 'ships'}. Message the seller in the PickleDeals app.`,
    alternates: { canonical: listingHref(l.id) },
    openGraph: { images: l.images[0] ? [storageUrl('listing-images', l.images[0])] : undefined },
    robots: l.status === 'active' ? undefined : { index: false },
  };
}

/** Pre-owned listing, view only (approved): messages and offers happen in the app. D2: area only. */
export default async function ListingPage({ params }: Props) {
  const { id } = await params;
  const l = valid(id) ? await fetchListing(id) : null;
  if (!l) notFound();
  const sellerReviews = await fetchSellerReviews(l.seller.id, 1);
  const title = [l.brand, l.title, l.variantLabel].filter(Boolean).join(' ');
  const save = l.bestNewCents != null && l.bestNewCents > l.priceCents ? l.bestNewCents - l.priceCents : null;
  const path = listingHref(l.id);
  return (
    <main className="page tight wrap">
      <nav className="crumbs" aria-label="Breadcrumb">
        <Link href="/marketplace">Pre-owned</Link>
        <span aria-hidden="true">›</span>
        <Link href={`/marketplace?category=${l.category.slug}`}>{l.category.name}</Link>
        <span aria-hidden="true">›</span>
        <span aria-current="page">{title}</span>
      </nav>
      <div className="detail">
        <Gallery images={l.images.map((p) => ({ src: storageUrl('listing-images', p), cutout: false }))} art={productArt(l.id, l.category.slug)} alt={title} />
        <div className="detail-info">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <span className="eyebrow">
              Pre-owned · {l.category.name}
              {l.publishedAt ? ` · listed ${formatAgo(l.publishedAt)}` : ''}
            </span>
            <h1>{title}</h1>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap', marginTop: 4 }} className="num">
              <span style={{ fontSize: 40, fontWeight: 800, letterSpacing: '-0.03em' }}>{formatPrice(l.priceCents)}</span>
              {l.bestNewCents != null && (
                <span className="muted" style={{ fontSize: 15 }}>
                  New from {formatPrice(l.bestNewCents)}
                  {save ? ` · save ${formatPrice(save)}` : ''}
                </span>
              )}
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 4 }}>
              <span className="tag">{l.status === 'sold' ? 'Sold' : l.status === 'pending' ? 'Pending' : conditionLabel(l.condition)}</span>
              {l.pickup && l.areaLabel && <span className="tag">Pickup · {l.areaLabel}</span>}
              {l.ships && <span className="tag">Ships</span>}
              {l.acceptsOffers && l.status === 'active' && <span className="tag">Accepts offers</span>}
            </div>
          </div>
          <div className="price-panel">
            <div style={{ display: 'flex', gap: 10 }}>
              <InAppButton title={title} path={path} action="message" className="btn btn-primary" style={{ flex: 1 }}>
                <Icon name="chat" size={18} />
                Message seller in the app
              </InAppButton>
              <SaveButton title={title} path={path} className="icon-btn lg" size={22} />
              <ShareButton path={path} title={title} className="icon-btn lg" />
            </div>
            {l.acceptsOffers && l.status === 'active' && (
              <InAppButton title={title} path={path} action="offer" className="btn btn-plain btn-sm btn-block">
                Make an offer in the app
              </InAppButton>
            )}
            <span className="muted" style={{ fontSize: 12, textAlign: 'center' }}>
              Chat, offers and meet-up spots happen in the PickleDeals app, so your contact details stay private.
            </span>
          </div>
          <Link href={sellerHref(l.seller.id)} className="seller-card">
            <Avatar name={l.seller.name} path={l.seller.avatarPath} />
            <span style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 2 }}>
              <b style={{ fontSize: 16 }}>{l.seller.name}</b>
              <span className="muted num" style={{ fontSize: 13 }}>
                {[ratingLine(sellerReviews), `Member since ${new Date(l.seller.memberSince).getFullYear()}`, l.seller.areaLabel].filter(Boolean).join(' · ')}
              </span>
            </span>
            <Icon name="chevronRight" size={16} stroke={2.2} />
          </Link>
          {l.description && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <h2 style={{ fontSize: 20 }}>About this item</h2>
              <p className="prose" style={{ whiteSpace: 'pre-line' }}>
                {l.description}
              </p>
            </div>
          )}
          {l.product && (
            <Link href={productHref(l.product.slug)} className="link-card">
              <span className="l">
                <b>Compare new prices</b>
                <span>
                  {l.product.name} at the stores we check{l.bestNewCents != null ? `, from ${formatPrice(l.bestNewCents)}` : ''}
                </span>
              </span>
              <Icon name="chevronRight" size={16} stroke={2.2} />
            </Link>
          )}
          {l.areaLabel && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <h2 style={{ fontSize: 20 }}>Area</h2>
              <span className="muted" style={{ fontSize: 13 }}>
                {l.areaLabel} · shown to about 1 km. The exact spot is shared privately in chat.
              </span>
            </div>
          )}
          <InAppButton title={title} path={path} action="report" className="text-btn">
            Report this listing in the app
          </InAppButton>
        </div>
      </div>
    </main>
  );
}
