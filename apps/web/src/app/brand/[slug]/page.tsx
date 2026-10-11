import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { ProductCard, PromoRow } from '@/components/Cards';
import { DealList, type SearchParams } from '@/components/DealList';
import { Icon } from '@/components/Icon';
import { ShareButton } from '@/components/client/Actions';
import { InAppButton } from '@/components/client/SaveInApp';
import { fetchBestPrices, fetchBrand, fetchBrands, fetchCategories } from '@/data/catalog';
import { fetchDeals } from '@/data/deals';
import { fetchLivePromos } from '@/data/offers';
import { monogram } from '@/lib/copy';
import { brandHref } from '@/lib/links';
import { storageUrl } from '@/lib/urls';

export const revalidate = 300;

type Props = { params: Promise<{ slug: string }>; searchParams: Promise<SearchParams> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const data = await fetchBrand((await params).slug);
  if (!data) return {};
  return {
    title: `${data.brand.name} pickleball deals and promo codes`,
    description: `Live ${data.brand.name} deals, promo codes and prices compared across pickleball stores.`,
    alternates: { canonical: brandHref(data.brand.slug) },
    openGraph: data.brand.logoPath ? { images: [storageUrl('brand-logos', data.brand.logoPath)] } : undefined,
  };
}

export default async function BrandPage({ params, searchParams }: Props) {
  const { slug } = await params;
  const [data, categories, brands, sp, live, promos] = await Promise.all([
    fetchBrand(slug),
    fetchCategories(),
    fetchBrands(),
    searchParams,
    fetchDeals({ feed: 'today', brand: slug, limit: 1 }),
    fetchLivePromos(),
  ]);
  if (!data) notFound();
  const { brand, products } = data;
  const prices = await fetchBestPrices(products.map((p) => p.id));
  // A brand's own store codes (e.g. JOOLA.com for JOOLA).
  const key = brand.name.toLowerCase().replace(/\s+/g, '');
  const brandPromos = promos.filter((p) => p.retailerSlug.startsWith(brand.slug) || p.retailerName.toLowerCase().replace(/\s+/g, '').startsWith(key));

  return (
    <main className="page tight wrap">
      <nav className="crumbs" aria-label="Breadcrumb">
        <Link href="/brands">Brands</Link>
        <span aria-hidden="true">›</span>
        <span aria-current="page">{brand.name}</span>
      </nav>
      <section style={{ display: 'flex', alignItems: 'center', gap: 24, flexWrap: 'wrap' }}>
        <span className="brand-chip" style={{ width: 104 }}>
          <span className="m" style={{ width: 104, height: 104, borderRadius: 52, background: brand.logoPath ? 'var(--surface)' : 'var(--interactive)', color: 'var(--on-interactive)', fontSize: 20 }}>
            {brand.logoPath ? (
              <img src={storageUrl('brand-logos', brand.logoPath)} alt="" />
            ) : (
              monogram(brand.name)
            )}
          </span>
        </span>
        <div className="page-title" style={{ flex: 1, minWidth: 240 }}>
          <h1 style={{ fontSize: 44 }}>{brand.name}</h1>
          <p className="sub num">
            {[
              `${live.total} live ${live.total === 1 ? 'deal' : 'deals'}`,
              brandPromos.length ? `${brandPromos.length} promo ${brandPromos.length === 1 ? 'code' : 'codes'}` : null,
              `${products.length} ${products.length === 1 ? 'product' : 'products'}`,
            ]
              .filter(Boolean)
              .join(' · ')}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          {brand.websiteUrl && (
            <a href={brand.websiteUrl} target="_blank" rel="noopener" className="btn btn-secondary btn-sm">
              Visit {new URL(brand.websiteUrl).hostname.replace(/^www\./, '')}
              <Icon name="external" size={14} stroke={2.2} />
            </a>
          )}
          <InAppButton title={brand.name} path={brandHref(brand.slug)} action="follow" className="btn btn-primary btn-sm">
            <Icon name="plus" size={16} stroke={2.2} />
            Follow in the app
          </InAppButton>
          <ShareButton path={brandHref(brand.slug)} title={`${brand.name} deals on PickleDeals`} className="icon-btn surface" />
        </div>
      </section>

      {brandPromos.length > 0 && (
        <section className="promo-grid g3">
          {brandPromos.slice(0, 3).map((p) => (
            <PromoRow key={p.id} promo={p} />
          ))}
        </section>
      )}

      {live.total > 0 && (
        <section className="section">
          <div className="section-head">
            <h2>{brand.name} deals</h2>
          </div>
          <DealList base={{ feed: 'today', brand: slug }} basePath={brandHref(slug)} sp={sp} categories={categories} brands={brands} hide={['brand']} />
        </section>
      )}

      <p className="muted" style={{ fontSize: 14 }}>
        Is this your brand, and do you sell on Shopify?{' '}
        <Link href="/partners" style={{ fontWeight: 700, color: 'var(--text-primary)', textDecoration: 'underline' }}>
          Partner with PickleDeals
        </Link>
      </p>

      {products.length > 0 && (
        <section className="section" style={{ marginTop: live.total ? 32 : 0 }}>
          <div className="section-head">
            <h2>All {brand.name} products</h2>
            <span className="note">Best new price across the stores we check</span>
          </div>
          <div className="grid">
            {products.map((p) => (
              <ProductCard key={p.id} product={p} bestCents={prices.get(p.id) ?? null} />
            ))}
          </div>
        </section>
      )}
    </main>
  );
}
