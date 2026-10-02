import { Stack, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { ScrollView, View } from 'react-native';

import { Chip, ChipRow, EmptyState, Text } from '@/ui';

import { GridSkeleton, LoadError, ProductGrid } from '../components';
import { useCategory } from '../hooks';

/** Category detail: every active product in the category, filterable by brand. Deals join in Phase 4. */
export default function CategoryScreen() {
  const { slug = '' } = useLocalSearchParams<{ slug: string }>();
  const { data, isError, refetch } = useCategory(slug);
  const [brand, setBrand] = useState<string | null>(null);

  const brands = useMemo(() => {
    const counts = new Map<string, { slug: string; name: string; n: number }>();
    for (const p of data?.products ?? []) {
      const b = counts.get(p.brand.slug) ?? { ...p.brand, n: 0 };
      b.n++;
      counts.set(p.brand.slug, b);
    }
    return [...counts.values()].sort((a, b) => b.n - a.n || a.name.localeCompare(b.name));
  }, [data]);

  const products = (data?.products ?? []).filter((p) => !brand || p.brand.slug === brand);

  return (
    <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={{ paddingBottom: 120, gap: 16 }}>
      <Stack.Screen options={{ title: data?.category.name ?? '' }} />
      {isError ? (
        <LoadError onRetry={refetch} />
      ) : !data ? (
        <GridSkeleton />
      ) : data.products.length === 0 ? (
        <EmptyState icon="grid" title="Nothing here yet" message="Products in this category will appear as the catalog grows." />
      ) : (
        <>
          <Text variant="subhead" weight="400" tone="secondary" style={{ paddingHorizontal: 16 }} numeric>
            {products.length} {products.length === 1 ? 'product' : 'products'}
          </Text>
          {brands.length > 1 && (
            <ChipRow>
              <Chip label="All brands" selected={!brand} onPress={() => setBrand(null)} />
              {brands.map((b) => (
                <Chip key={b.slug} label={b.name} selected={brand === b.slug} onPress={() => setBrand(brand === b.slug ? null : b.slug)} />
              ))}
            </ChipRow>
          )}
          <View>
            <ProductGrid products={products} />
          </View>
        </>
      )}
    </ScrollView>
  );
}
