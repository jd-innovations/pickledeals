import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import type { SearchParams } from '@/components/DealList';
import { FeedView } from '@/components/FeedView';
import { FEED_PATHS, FEED_SUBTITLES, FEED_TITLES, feedFromSegment } from '@/lib/links';

export const revalidate = 300;

export async function generateMetadata({ params }: { params: Promise<{ feed: string }> }): Promise<Metadata> {
  const feed = feedFromSegment((await params).feed);
  if (!feed) return {};
  return { title: `${FEED_TITLES[feed]} on pickleball gear`, description: FEED_SUBTITLES[feed], alternates: { canonical: FEED_PATHS[feed] } };
}

export default async function FeedPage({ params, searchParams }: { params: Promise<{ feed: string }>; searchParams: Promise<SearchParams> }) {
  const feed = feedFromSegment((await params).feed);
  if (!feed || feed === 'today') notFound();
  return <FeedView feed={feed} sp={await searchParams} />;
}
