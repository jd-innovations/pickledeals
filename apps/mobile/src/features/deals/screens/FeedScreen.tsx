import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, RefreshControl, ScrollView, View, type NativeScrollEvent, type NativeSyntheticEvent } from 'react-native';

import { haptic } from '@/lib/haptics';
import { GridSkeleton, LoadError, ProductGrid } from '@/features/catalog/components';
import { useProductsUnder } from '@/features/catalog/hooks';
import { Chip, ChipRow, SectionHeader, Text } from '@/ui';

import type { Feed, FeedQuery, Sort } from '../api';
import { DealGrid } from '../components';
import { activeFilterCount, useCollection, useDealFilters, useDealFilterStore, useDealsPaged } from '../hooks';

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

/** Price feeds also list regular-priced products under the cap, after the deals (clearly not deals). */
const FEED_MORE: Partial<Record<Feed, { maxCents: number; title: string }>> = {
  under_50: { maxCents: 5000, title: 'More under $50' },
  under_100: { maxCents: 10000, title: 'More under $100' },
};

/** Within this distance of the bottom (pt), the next page loads. */
const LOAD_AHEAD = 800;

/** Shared deal list: "See all" feeds and collections. Filters live in the filter sheet. */
export function DealList({
  scope,
  query,
  header,
  more,
}: {
  scope: string;
  query: FeedQuery;
  header?: React.ReactNode;
  more?: { maxCents: number; title: string };
}) {
  const filters = useDealFilters(scope);
  const defaultSort: Sort = query.sort ?? (query.feed && FEED_DEFAULT_SORT[query.feed]) ?? 'best';
  const sort = filters.sort ?? defaultSort;
  const sortChips = [...new Set<Sort>([defaultSort, 'best', 'discount', 'price_asc', 'newest'])];
  const merged: FeedQuery = { ...query, sort, minCents: filters.minCents, maxCents: filters.maxCents, brands: filters.brands, kinds: filters.kinds, inStockOnly: filters.inStockOnly };
  const { data, isPending, isError, refetch, isPlaceholderData, hasNextPage, fetchNextPage, isFetchingNextPage } = useDealsPaged(merged);
  const [pulling, setPulling] = useState(false);
  const count = activeFilterCount(filters);
  const items = data?.pages.flatMap((p) => p.items) ?? [];
  const total = data?.pages[0]?.total ?? 0;
  // "More under $50" once every deal is listed, and only unfiltered (filters apply to deals).
  const showMore = !!more && !!data && !hasNextPage && count === 0;
  const others = useProductsUnder(more?.maxCents ?? 0, showMore);
  const dealProducts = new Set(items.map((d) => d.product.id));
  const extra = (others.data ?? []).filter((p) => !dealProducts.has(p.id));

  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const { layoutMeasurement, contentOffset, contentSize } = e.nativeEvent;
    if (hasNextPage && !isFetchingNextPage && layoutMeasurement.height + contentOffset.y >= contentSize.height - LOAD_AHEAD) fetchNextPage();
  };

  return (
    <ScrollView
      contentInsetAdjustmentBehavior="automatic"
      contentContainerStyle={{ paddingBottom: 120, gap: 16 }}
      onScroll={onScroll}
      scrollEventThrottle={200}
      refreshControl={
        <RefreshControl
          refreshing={pulling}
          onRefresh={async () => {
            haptic.tap();
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
      {isError && !data ? (
        <LoadError onRetry={refetch} />
      ) : isPending ? (
        <GridSkeleton />
      ) : (
        <View style={{ gap: 12, opacity: isPlaceholderData ? 0.6 : 1 }}>
          <Text variant="subhead" weight="400" tone="secondary" style={{ paddingHorizontal: 16 }} numeric>
            {total} {total === 1 ? 'deal' : 'deals'}
          </Text>
          <DealGrid deals={items} />
          {isFetchingNextPage && <ActivityIndicator accessibilityLabel="Loading more deals" style={{ paddingVertical: 16 }} />}
        </View>
      )}
      {showMore && extra.length > 0 && (
        <View style={{ gap: 12, paddingTop: 8 }}>
          <SectionHeader title={more!.title} trailing={String(extra.length)} />
          <Text variant="subhead" weight="400" tone="secondary" style={{ paddingHorizontal: 16, marginTop: -6 }}>
            Regular prices, not deals.
          </Text>
          <ProductGrid products={extra} />
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
      <DealList scope={`feed:${feed}`} query={{ feed }} more={FEED_MORE[feed]} />
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
