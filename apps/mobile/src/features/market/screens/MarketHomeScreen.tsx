import { radius } from '@pickledeals/shared';
import { router, Stack } from 'expo-router';
import { useDeferredValue, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, View } from 'react-native';

import { useTheme } from '@/design/theme';
import { ChipRow, EmptyState, Icon, IconButton, SearchField, SectionHeader, SegmentedControl, Text } from '@/ui';

import { ListingGrid, ListingGridSkeleton, ListingRail, MarketLoadError, MarketQuickChips, radiusLabel } from '../components';
import { DEFAULT_MARKET_FILTERS, filtersToQuery, useHomeArea, useMarket, useMarketFilters, useMarketSearch, useViewer } from '../hooks';

/** Marketplace home (design: "Pre-owned marketplace"). Browsing is open to guests. */
export default function MarketHomeScreen() {
  const { colors } = useTheme();
  const f = useMarketFilters((s) => s.f);
  const viewerLabel = useViewer((s) => s.label);
  const home = useHomeArea();
  const { text, setText } = useMarketSearch();
  const search = useDeferredValue(text.trim());
  const feed = useMarket({ ...filtersToQuery(f), text: search || undefined, limit: 60 });
  const [pulling, setPulling] = useState(false);

  const items = feed.data?.items ?? [];
  const hasOrigin = feed.data?.hasOrigin ?? false;
  const within = (d: number | null) => !hasOrigin || f.radiusM == null || (d != null && d <= f.radiusM);
  const near = items.filter((l) => within(l.distanceM));
  const shipping = items.filter((l) => !within(l.distanceM));
  const areaLabel = viewerLabel ?? home.data?.label ?? null;
  const filtered = JSON.stringify(f) !== JSON.stringify(DEFAULT_MARKET_FILTERS);

  const onRefresh = async () => {
    setPulling(true);
    await feed.refetch();
    setPulling(false);
  };

  return (
    <ScrollView
      contentInsetAdjustmentBehavior="automatic"
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={{ paddingBottom: 120, gap: 24 }}
      refreshControl={<RefreshControl refreshing={pulling && feed.isRefetching} onRefresh={onRefresh} />}>
      <Stack.Screen options={{ headerRight: () => <IconButton icon="plus" label="Sell an item" size={34} tone="solid" onPress={() => router.push('/sell')} /> }} />
      <View style={{ gap: 12 }}>
        <View style={{ paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={areaLabel ? `Location: ${areaLabel}, ${radiusLabel(f.radiusM)}. Change` : 'Set your location'}
            onPress={() => router.push('/market/location')}
            hitSlop={8}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexShrink: 1 }}>
            <Icon name="pin" size={16} color={colors.textPrimary} />
            <Text variant="subhead" weight="600" numberOfLines={1} style={{ flexShrink: 1 }} numeric>
              {areaLabel ? `${areaLabel} · ${radiusLabel(f.radiusM)}` : 'Set location'}
            </Text>
            <Icon name="chevronDown" size={14} color={colors.textPrimary} />
          </Pressable>
          <View style={{ width: 150 }}>
            <SegmentedControl
              options={[
                { value: 'grid', label: 'Grid' },
                { value: 'map', label: 'Map' },
              ]}
              value="grid"
              onChange={(v) => v === 'map' && router.push('/market/map')}
            />
          </View>
        </View>
        <View style={{ paddingHorizontal: 16 }}>
          <SearchField placeholder="Search pre-owned gear" value={text} onChangeText={setText} returnKeyType="search" clearButtonMode="while-editing" />
        </View>
        <ChipRow>
          <IconButton icon="sliders" label={filtered ? 'Filters (on)' : 'Filters'} size={36} tone={filtered ? 'solid' : 'surface'} onPress={() => router.push('/market/filters')} />
          <MarketQuickChips />
        </ChipRow>
      </View>

      {feed.isError ? (
        <MarketLoadError onRetry={() => feed.refetch()} />
      ) : feed.isPending ? (
        <ListingGridSkeleton count={6} />
      ) : (
        <>
          {!hasOrigin && (
            <Pressable
              accessibilityRole="button"
              onPress={() => router.push('/market/location')}
              style={{ marginHorizontal: 16, padding: 14, borderRadius: radius.card, backgroundColor: colors.surface, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <Icon name="pin" size={20} color={colors.textPrimary} />
              <View style={{ flex: 1, gap: 2 }}>
                <Text variant="subhead" weight="700">
                  See what’s near you
                </Text>
                <Text variant="footnote" tone="secondary">
                  Set an approximate area to sort by distance. We never share it.
                </Text>
              </View>
              <Icon name="chevronRight" size={14} color={colors.textTertiary} />
            </Pressable>
          )}

          <View style={{ gap: 14 }}>
            <SectionHeader
              title={search ? 'Results' : hasOrigin ? 'Near you' : 'Latest listings'}
              trailing={`${near.length} ${near.length === 1 ? 'listing' : 'listings'}${hasOrigin && f.sort === 'nearest' ? ' · nearest first' : ''}`}
            />
            {near.length > 0 ? (
              <ListingGrid items={near} />
            ) : (
              <EmptyState
                icon="tag"
                title={search || filtered ? 'Nothing matches yet' : 'No listings nearby yet'}
                message={search || filtered ? 'Try a wider distance or fewer filters.' : 'Be the first — listing takes about a minute.'}
              />
            )}
          </View>

          <Pressable
            accessibilityRole="button"
            onPress={() => router.push('/sell')}
            style={({ pressed }) => ({
              marginHorizontal: 16,
              padding: 16,
              borderRadius: 20,
              borderWidth: 1,
              borderColor: colors.border,
              flexDirection: 'row',
              alignItems: 'center',
              gap: 14,
              opacity: pressed ? 0.85 : 1,
            })}>
            <View style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: colors.interactive, alignItems: 'center', justifyContent: 'center' }}>
              <Icon name="plus" size={22} color={colors.onInteractive} weight="semibold" />
            </View>
            <View style={{ flex: 1, gap: 2 }}>
              <Text variant="headline" weight="700">
                Upgraded your paddle?
              </Text>
              <Text variant="footnote" tone="secondary">
                List the old one free in about a minute. No fees.
              </Text>
            </View>
          </Pressable>

          {shipping.length > 0 && (
            <View style={{ gap: 14 }}>
              <SectionHeader title="Ships nationwide" />
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 12, paddingHorizontal: 16 }}>
                <ListingRail items={shipping} />
              </ScrollView>
            </View>
          )}
        </>
      )}
    </ScrollView>
  );
}
