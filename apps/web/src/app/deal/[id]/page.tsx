import { formatPrice } from '@pickledeals/shared';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { DealDetail, loadDeal } from '@/components/DealDetail';
import { categoryHref, dealHref, productHref } from '@/lib/links';
import { storageUrl } from '@/lib/urls';

export const revalidate = 300;

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const data = await loadDeal((await params).id);
  if (!data) return { title: 'Deal not found', robots: { index: false } };
  const { offer: o, product: p } = data;
  const name = `${p.brand.name} ${p.name}`;
  const price = o.priceDisplay === 'show' && o.priceSource !== 'api' && o.deliveredCents != null ? `${formatPrice(o.deliveredCents)}${o.promo ? ' with code' : ''} at ${o.retailer.name}` : `at ${o.retailer.name}`;
  const image = p.images[0] ? storageUrl('catalog', p.images[0].path) : undefined;
  return {
    title: `${name} deal: ${price}`,
    description: `${name} ${price}. Compare every store’s price and promo code on PickleDeals.`,
    // Deals come and go; the product page is the lasting address for search engines.
    alternates: { canonical: productHref(p.slug) },
    openGraph: { title: `${name} · ${price}`, url: dealHref(o.offerId), images: image ? [image] : undefined },
  };
}

/** Full deal page: opened from a shared link or a refresh. From a list, the pop-up shows instead. */
export default async function DealPage({ params }: Props) {
  const data = await loadDeal((await params).id);
  if (!data) notFound();
  const p = data.product;
  return (
    <main className="page tight wrap">
      <nav className="crumbs" aria-label="Breadcrumb">
        <Link href={categoryHref(p.category.slug)}>{p.category.name}</Link>
        <span aria-hidden="true">›</span>
        <Link href={productHref(p.slug)}>
          {p.brand.name} {p.name}
        </Link>
        <span aria-hidden="true">›</span>
        <span aria-current="page">Deal at {data.offer.retailer.name}</span>
      </nav>
      <DealDetail data={data} />
    </main>
  );
}
