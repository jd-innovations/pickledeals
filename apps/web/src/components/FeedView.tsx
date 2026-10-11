import Link from 'next/link';

import { fetchBrands, fetchCategories } from '@/data/catalog';
import type { Feed, Sort } from '@/data/deals';
import { FEED_PATHS, FEED_SUBTITLES, FEED_TITLES } from '@/lib/links';

import { DealList, type SearchParams } from './DealList';

const DEFAULT_SORT: Partial<Record<Feed, Sort>> = { price_drops: 'drop', ending_soon: 'ending', new: 'newest', under_50: 'price_asc', under_100: 'price_asc' };

export async function FeedView({ feed, sp }: { feed: Feed; sp: SearchParams }) {
  const [categories, brands] = await Promise.all([fetchCategories(), fetchBrands()]);
  return (
    <main className="page tight wrap">
      <nav className="crumbs" aria-label="Breadcrumb">
        <Link href="/">Deals</Link>
        <span aria-hidden="true">›</span>
        <span aria-current="page">{FEED_TITLES[feed]}</span>
      </nav>
      <div className="page-title">
        <h1>{FEED_TITLES[feed]}</h1>
        <p className="sub">{FEED_SUBTITLES[feed]}</p>
      </div>
      <DealList base={{ feed }} basePath={FEED_PATHS[feed]} sp={sp} categories={categories} brands={brands} defaultSort={DEFAULT_SORT[feed] ?? 'best'} />
    </main>
  );
}
