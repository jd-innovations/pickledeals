import { formatPrice, radius } from '@pickledeals/shared';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { BrandRow, ProductImage } from '@/commerce';
import { useTheme } from '@/design/theme';
import { Button, Chip, ChipRow, EmptyState, SectionHeader, Text } from '@/ui';

import type { SearchResults } from '../api';
import { GridSkeleton, LoadError, openBrand, openCategory, openProduct, ProductGrid } from '../components';
import { productImage, useCatalogSearch } from '../hooks';

type Filter = 'all' | 'products' | 'brands';

/** Search results (grouped). Deals and pre-owned groups join in Phases 3–6. */
export default function ResultsScreen() {
  const { q = '' } = useLocalSearchParams<{ q?: string }>();
  const search = useCatalogSearch(q, { limit: 50, debounceMs: 0 });
  const [filter, setFilter] = useState<Filter>('all');
  const data = search.data;

  return (
    <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={{ paddingBottom: 120, gap: 20 }}>
      <Stack.Screen options={{ title: q }} />
      {search.isError ? (
        <LoadError onRetry={() => search.refetch()} />
      ) : !data ? (
        <GridSkeleton />
      ) : data.totalProducts === 0 && data.brands.length === 0 ? (
        <EmptyState icon="search" title={`No matches for “${q}”`} message="Try a shorter search, a brand, or a category." actionLabel="Browse categories" onAction={() => router.push('/deals/browse')} />
      ) : (
        <>
          <ChipRow>
            <Chip label="All" selected={filter === 'all'} onPress={() => setFilter('all')} />
            <Chip label={`Products ${data.totalProducts}`} selected={filter === 'products'} onPress={() => setFilter('products')} />
            <Chip label="Brands & categories" selected={filter === 'brands'} onPress={() => setFilter('brands')} />
          </ChipRow>
          {filter !== 'brands' && <ProductsSection data={data} filter={filter} />}
          {filter !== 'products' && <BrandsAndCategories data={data} />}
        </>
      )}
    </ScrollView>
  );
}

/** A clear winner gets the design's "Best match" card; ties are shown as a plain grid. */
function bestMatch(data: SearchResults) {
  const [first, second] = data.products;
  if (!first || first.score < 1) return null;
  return !second || first.score - second.score >= 0.2 ? first : null;
}

function ProductsSection({ data, filter }: { data: SearchResults; filter: Filter }) {
  const best = filter === 'all' ? bestMatch(data) : null;
  const rest = best ? data.products.slice(1) : data.products;
  return (
    <View style={{ gap: 20 }}>
      {best && <BestMatchCard product={best} />}
      {rest.length > 0 && (
        <View style={{ gap: 12 }}>
          <SectionHeader title={best ? 'More products' : 'Products'} trailing={String(rest.length)} />
          <ProductGrid products={rest} />
        </View>
      )}
    </View>
  );
}

function BestMatchCard({ product }: { product: SearchResults['products'][number] }) {
  const { colors } = useTheme();
  return (
    <View style={[styles.card, { borderColor: colors.border }]}>
      <View style={{ flexDirection: 'row', gap: 14 }}>
        <ProductImage source={productImage(product)} width={96} round={radius.tile} padding={8} />
        <View style={{ flex: 1, gap: 4, justifyContent: 'center' }}>
          <Text variant="badge" tone="secondary">
            BEST MATCH · PRODUCT
          </Text>
          <Text variant="title3" weight="700" numberOfLines={3}>
            {product.brand.name} {product.name}
          </Text>
          <Text variant="footnote" tone="secondary" numeric>
            {[product.category.name, product.msrpCents != null ? `MSRP ${formatPrice(product.msrpCents)}` : null].filter(Boolean).join(' · ')}
          </Text>
        </View>
      </View>
      <Button label="View product" onPress={() => openProduct(product.slug)} fullWidth size="md" />
    </View>
  );
}

function BrandsAndCategories({ data }: { data: SearchResults }) {
  if (data.brands.length === 0 && data.categories.length === 0) return null;
  return (
    <View style={{ gap: 12 }}>
      <SectionHeader title="Brands & categories" />
      {data.brands.map((b, i) => (
        <BrandRow
          key={b.slug}
          name={b.name}
          meta={`${b.matchedProducts} matching ${b.matchedProducts === 1 ? 'product' : 'products'}`}
          onPress={() => openBrand(b.slug)}
          last={i === data.brands.length - 1}
        />
      ))}
      {data.categories.length > 0 && (
        <View style={styles.chips}>
          {data.categories.map((c) => (
            <Chip key={c.slug} label={c.name} outlined onPress={() => openCategory(c.slug)} />
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { marginHorizontal: 16, padding: 14, borderRadius: radius.hero, borderWidth: StyleSheet.hairlineWidth * 2, gap: 14 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingHorizontal: 16 },
});
