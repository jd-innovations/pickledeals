import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { RefreshControl, ScrollView, View } from 'react-native';

import { GridSkeleton, LoadError } from '@/features/catalog/components';
import { Chip, ChipRow, Text } from '@/ui';

import type { Feed, FeedQuery, Sort } from '../api';
import { DealGrid } from '../components';
import { activeFilterCount, useCollection, useDealFilters, useDealFilterStore, useDeals } from '../hooks';

const FEED_TITLES: Record<Feed, string> = {
  today: 'Today’s deals',
  price_drops: 'Biggest price drops',
  ending_soon: 'Ending soon',
  promo_codes: 'Promo codes',
  under_50: 'Under $50',
  under_100: 'Under $100',
  new: 'New deals',
  staff_picks: 'Staff picks',
};

export const SORT_LABELS: Record<Sort, string> = {
  best: 'Best deals',
  discount: 'Biggest discount',
  drop: 'Biggest drop',
  price_asc: 'Lowest price',
  price_desc: 'Highest price',
  ending: 'Ending soon',
  newest: 'Newest',
};

const FEED_DEFAULT_SORT: Partial<Record<Feed, Sort>> = { price_drops: 'drop', ending_soon: 'ending', new: 'newest' };

/** Shared deal list: "See all" feeds and collections. Filters live in the filter sheet. */
export function DealList({ scope, query, header }: { scope: string; query: FeedQuery; header?: React.ReactNode }) {
  const filters = useDealFilters(scope);
  const defaultSort: Sort = query.sort ?? (query.feed && FEED_DEFAULT_SORT[query.feed]) ?? 'best';
  const sort = filters.sort ?? defaultSort;
  const sortChips = [...new Set<Sort>([defaultSort, 'best', 'discount', 'price_asc', 'newest'])];
  const merged: FeedQuery = { ...query, sort, minCents: filters.minCents, maxCents: filters.maxCents, brands: filters.brands, kinds: filters.kinds, inStockOnly: filters.inStockOnly };
  const { data, isPending, isError, refetch, isPlaceholderData } = useDeals(merged);
  const [pulling, setPulling] = useState(false);
  const count = activeFilterCount(filters);

  return (
    <ScrollView
      contentInsetAdjustmentBehavior="automatic"
      contentContainerStyle={{ paddingBottom: 120, gap: 16 }}
      refreshControl={
        <RefreshControl
          refreshing={pulling}
          onRefresh={async () => {
            setPulling(true);
            await refetch();
            setPulling(false);
          }}
        />
      }>
      {header}
      <ChipRow>
        <Chip label={count ? `Filters · ${count}` : 'Filters'} selected={count > 0} onPress={() => router.push({ pathname: '/deals/filters', params: { scope, category: query.category ?? '', brand: query.brand ?? '' } })} />
        {sortChips.map((s) => (
          <Chip
            key={s}
            label={SORT_LABELS[s]}
            outlined
            selected={sort === s}
            onPress={() => useDealFilterStore.getState().set(scope, { ...filters, sort: s })}
          />
        ))}
      </ChipRow>
      {isError ? (
        <LoadError onRetry={refetch} />
      ) : isPending ? (
        <GridSkeleton />
      ) : (
        <View style={{ gap: 12, opacity: isPlaceholderData ? 0.6 : 1 }}>
          <Text variant="subhead" weight="400" tone="secondary" style={{ paddingHorizontal: 16 }} numeric>
            {data.total} {data.total === 1 ? 'deal' : 'deals'}
          </Text>
          <DealGrid deals={data.items} />
        </View>
      )}
    </ScrollView>
  );
}

export default function FeedScreen() {
  const { feed = 'today' } = useLocalSearchParams<{ feed: Feed }>();
  return (
    <>
      <Stack.Screen options={{ title: FEED_TITLES[feed] ?? 'Deals' }} />
      <DealList scope={`feed:${feed}`} query={{ feed }} />
    </>
  );
}

export function CollectionScreen() {
  const { slug = '' } = useLocalSearchParams<{ slug: string }>();
  const { data: c } = useCollection(slug);
  return (
    <>
      <Stack.Screen options={{ title: c?.title ?? '' }} />
      <DealList
        scope={`collection:${slug}`}
        query={{ collection: slug }}
        header={
          c?.subtitle || c?.eyebrow ? (
            <View style={{ paddingHorizontal: 16, gap: 4 }}>
              {c.eyebrow ? (
                <Text variant="badge" tone="secondary">
                  {c.eyebrow}
                </Text>
              ) : null}
              {c.subtitle ? (
                <Text variant="subhead" weight="400" tone="secondary">
                  {c.subtitle}
                </Text>
              ) : null}
            </View>
          ) : undefined
        }
      />
    </>
  );
}
