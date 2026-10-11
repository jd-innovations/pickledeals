import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { DealList, type SearchParams } from '@/components/DealList';
import { fetchBrands, fetchCategories } from '@/data/catalog';
import { fetchCollection } from '@/data/deals';
import { collectionHref } from '@/lib/links';

export const revalidate = 300;

type Props = { params: Promise<{ slug: string }>; searchParams: Promise<SearchParams> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const c = await fetchCollection((await params).slug);
  if (!c) return {};
  return { title: c.title, description: c.subtitle ?? `${c.title}: pickleball deals picked by the PickleDeals team.`, alternates: { canonical: collectionHref(c.slug) } };
}

export default async function CollectionPage({ params, searchParams }: Props) {
  const { slug } = await params;
  const [c, categories, brands, sp] = await Promise.all([fetchCollection(slug), fetchCategories(), fetchBrands(), searchParams]);
  if (!c) notFound();
  return (
    <main className="page tight wrap">
      <nav className="crumbs" aria-label="Breadcrumb">
        <Link href="/">Deals</Link>
        <span aria-hidden="true">›</span>
        <span aria-current="page">{c.title}</span>
      </nav>
      <div className="page-title">
        {c.eyebrow && (
          <span className="faint" style={{ fontSize: 12, fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase' }}>
            {c.eyebrow}
          </span>
        )}
        <h1>{c.title}</h1>
        {c.subtitle && <p className="sub">{c.subtitle}</p>}
      </div>
      <DealList base={{ feed: 'today', collection: slug }} basePath={collectionHref(slug)} sp={sp} categories={categories} brands={brands} />
    </main>
  );
}
