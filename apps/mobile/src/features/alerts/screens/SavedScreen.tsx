import { router } from 'expo-router';
import { ScrollView, View } from 'react-native';

import { BrandRow, ProductCard } from '@/commerce';
import { brandLogoUrl } from '@/features/catalog/api';
import { useGridCardWidth } from '@/features/catalog/components';
import { productImage } from '@/features/catalog/hooks';
import { DealGrid } from '@/features/deals/components';
import { ListingGrid } from '@/features/market/components';
import { useSavedListings } from '@/features/market/hooks';
import { EmptyState, SectionHeader, Skeleton, Text } from '@/ui';

import { useFollowedBrands, useSavedDeals, useSavedProducts } from '../hooks';

/** Profile › Saved deals, pre-owned listings & products — the canonical Saved library (D5 revised). */
export default function SavedScreen() {
  const deals = useSavedDeals();
  const products = useSavedProducts();
  const listings = useSavedListings();
  const cardW = useGridCardWidth();

  if (deals.isPending || products.isPending || listings.isPending) {
    return (
      <View style={{ padding: 16, gap: 12 }}>
        <Skeleton height={200} round={16} />
      </View>
    );
  }
  const nothing = !deals.data?.live.length && !deals.data?.endedCount && !products.data?.length && !listings.data?.length;

  return (
    <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={{ paddingBottom: 120, gap: 20 }}>
      {nothing ? (
        <EmptyState icon="heart" title="Nothing saved yet" message="Tap the heart on any deal, product or listing to keep it here." actionLabel="Browse deals" onAction={() => router.push('/deals')} />
      ) : (
        <>
          {(deals.data?.live.length ?? 0) > 0 && (
            <View style={{ gap: 12 }}>
              <SectionHeader title="Deals" trailing={String(deals.data!.live.length)} />
              <DealGrid deals={deals.data!.live} />
            </View>
          )}
          {(deals.data?.endedCount ?? 0) > 0 && (
            <Text variant="footnote" tone="secondary" style={{ paddingHorizontal: 16 }}>
              {deals.data!.endedCount} saved {deals.data!.endedCount === 1 ? 'deal has' : 'deals have'} ended. Save the product to keep an eye on it.
            </Text>
          )}
          {(listings.data?.length ?? 0) > 0 && (
            <View style={{ gap: 12 }}>
              <SectionHeader title="Pre-owned" trailing={String(listings.data!.length)} />
              <ListingGrid items={listings.data!} />
            </View>
          )}
          {(products.data?.length ?? 0) > 0 && (
            <View style={{ gap: 12 }}>
              <SectionHeader title="Products" trailing={String(products.data!.length)} />
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12, rowGap: 20, paddingHorizontal: 16 }}>
                {products.data!.map((p) => (
                  <ProductCard
                    key={p.productId}
                    width={cardW}
                    product={{ slug: p.slug, brand: p.brand.name, name: p.name, image: productImage(p), msrpCents: null }}
                    onPress={() => router.push({ pathname: '/deals/product/[slug]', params: { slug: p.slug } })}
                  />
                ))}
              </View>
            </View>
          )}
        </>
      )}
    </ScrollView>
  );
}

/** Profile › Followed brands. */
export function FollowedBrandsScreen() {
  const { data } = useFollowedBrands();
  if (!data) return <Skeleton height={60} round={12} />;
  return (
    <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={{ paddingBottom: 120 }}>
      {data.length === 0 ? (
        <EmptyState icon="heart" title="No brands followed" message="Follow a brand to hear about its new deals." actionLabel="Browse brands" onAction={() => router.push({ pathname: '/deals/browse', params: { tab: 'brands' } })} />
      ) : (
        data.map((b, i) => (
          <BrandRow
            key={b.id}
            name={b.name}
            meta="Notifying on new deals"
            logoUri={b.logoPath ? brandLogoUrl(b.logoPath) : null}
            onPress={() => router.push({ pathname: '/deals/brand/[slug]', params: { slug: b.slug } })}
            last={i === data.length - 1}
          />
        ))
      )}
    </ScrollView>
  );
}
