import { formatPrice } from '@pickledeals/shared';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { ProductImage } from '@/commerce';
import { useTheme } from '@/design/theme';
import { useProduct } from '@/features/catalog/hooks';
import { Button, EmptyState, Text } from '@/ui';

import { conditionLabel, formatDistance, ListingGrid, ListingGridSkeleton, MarketLoadError, radiusLabel, useMarketNav } from './components';
import { listingImage, useMarket, useMarketFilters, useViewer } from './hooks';

/** Product page "Pre-owned" block (design: ProductDetail). Lists nearest first, or newest without a location. */
export function PreOwnedSection({ productId, slug }: { productId: string; slug: string }) {
  const { colors } = useTheme();
  const { openListing } = useMarketNav();
  const { data } = useMarket({ productId, radiusM: null, sort: 'nearest', limit: 3 });
  const total = data?.total ?? 0;
  const prices = (data?.items ?? []).map((i) => i.priceCents);
  const sellYours = () => router.push({ pathname: '/sell', params: { product: slug } });

  return (
    <View style={{ paddingHorizontal: 16, gap: 4 }}>
      <View style={{ gap: 2, paddingBottom: 8 }}>
        <Text variant="title2">Pre-owned</Text>
        <Text variant="footnote" tone="secondary" numeric>
          {total === 0
            ? 'No listings yet — be the first to sell one'
            : `${total} ${total === 1 ? 'listing' : 'listings'}${prices.length > 1 ? ` · from ${formatPrice(Math.min(...prices))}` : ''}`}
        </Text>
      </View>
      {(data?.items ?? []).map((l) => (
        <Pressable
          key={l.id}
          accessibilityRole="button"
          accessibilityLabel={`${conditionLabel(l.condition)}, ${formatPrice(l.priceCents)}, ${l.areaLabel}`}
          onPress={() => openListing(l.id)}
          style={[styles.row, { borderBottomColor: colors.separator }]}>
          <ProductImage source={listingImage(l)} width={56} round={12} padding={5} />
          <View style={{ flex: 1, gap: 2 }}>
            <Text variant="subhead" weight="600">
              {conditionLabel(l.condition)}
              {l.hasVariants && l.variantLabel ? ` · ${l.variantLabel}` : ''}
            </Text>
            <Text variant="footnote" tone="secondary" numeric>
              {[l.areaLabel, formatDistance(l.distanceM), l.ships ? 'ships' : null, l.status === 'pending' ? 'pending' : null].filter(Boolean).join(' · ')}
            </Text>
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            <Text variant="priceCard" numeric>
              {formatPrice(l.priceCents)}
            </Text>
            {l.bestNewCents != null && l.bestNewCents > l.priceCents && (
              <Text variant="caption" weight="400" tone="secondary" numeric>
                Save {formatPrice(l.bestNewCents - l.priceCents)} vs new
              </Text>
            )}
          </View>
        </Pressable>
      ))}
      <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
        {total > 0 && (
          <Button
            label="View all pre-owned"
            variant="secondary"
            size="md"
            style={{ flex: 1.35, paddingHorizontal: 12 }}
            onPress={() => router.push({ pathname: '/deals/product/[slug]/pre-owned', params: { slug } })}
          />
        )}
        <Button label="Sell yours" variant="outline" size="md" style={{ flex: 1, paddingHorizontal: 12 }} onPress={sellYours} />
      </View>
    </View>
  );
}

/** Deals home "Pre-owned near you" (design: DealsHome). Hidden until there's something to show. */
export function NearbyPreOwned() {
  const radiusM = useMarketFilters((s) => s.f.radiusM);
  const label = useViewer((s) => s.label);
  const { data } = useMarket({ radiusM, includeShipping: false, sort: 'nearest', limit: 4 });
  if (!data?.items.length) return null;
  return (
    <View style={{ gap: 14 }}>
      <View style={{ paddingHorizontal: 16, flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between' }}>
        <View style={{ gap: 2 }}>
          <Text variant="title2">{data.hasOrigin ? 'Pre-owned near you' : 'Fresh pre-owned'}</Text>
          <Text variant="footnote" tone="secondary" numeric>
            {data.hasOrigin ? `${label ?? 'Your area'} · within ${radiusLabel(radiusM)}` : 'Set your area in Marketplace to see what’s close'}
          </Text>
        </View>
        <Button label="See all" variant="link" size="sm" onPress={() => router.navigate('/market')} />
      </View>
      <ListingGrid items={data.items.slice(0, 4)} />
    </View>
  );
}

/** "View all pre-owned" for one product. */
export function ProductPreOwnedScreen() {
  const { slug = '' } = useLocalSearchParams<{ slug: string }>();
  const product = useProduct(slug).data;
  const feed = useMarket({ productId: product?.id, radiusM: null, sort: 'nearest', limit: 60 }, !!product);
  return (
    <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={{ paddingBottom: 120, gap: 16, paddingTop: 8 }}>
      <Stack.Screen options={{ title: product ? `Pre-owned ${product.name}` : 'Pre-owned' }} />
      {feed.isError ? (
        <MarketLoadError onRetry={() => feed.refetch()} />
      ) : !feed.data ? (
        <ListingGridSkeleton />
      ) : feed.data.items.length ? (
        <ListingGrid items={feed.data.items} />
      ) : (
        <EmptyState icon="tag" title="None listed right now" message="Set a price alert with pre-owned on to hear when one appears." />
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, borderBottomWidth: 1 },
});
