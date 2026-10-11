import type { Metadata } from 'next';

import type { SearchParams } from '@/components/DealList';
import { FeedView } from '@/components/FeedView';
import { FEED_SUBTITLES } from '@/lib/links';

export const revalidate = 300;

export const metadata: Metadata = {
  title: 'All pickleball deals',
  description: FEED_SUBTITLES.today,
  alternates: { canonical: '/deals' },
};

export default async function AllDealsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  return <FeedView feed="today" sp={await searchParams} />;
}
