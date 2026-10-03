import { formatPrice } from '@pickledeals/shared';
import { Stack, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { Alert, ScrollView, View } from 'react-native';

import { useMeMutations } from '@/features/alerts/hooks';
import { useAuth } from '@/features/auth/authStore';
import { DealList } from '@/features/deals/screens/FeedScreen';
import { useDealFilters, useDeals } from '@/features/deals/hooks';
import { Button, Chip, ChipRow, EmptyState, SegmentedControl, Text } from '@/ui';

import { GridSkeleton, LoadError, ProductGrid } from '../components';
import { useCategory } from '../hooks';

type Mode = 'deals' | 'products';

/** Category detail (design: "Paddles on sale"): live deals with filters, or every product. */
export default function CategoryScreen() {
  const { slug = '' } = useLocalSearchParams<{ slug: string }>();
  const { data } = useCategory(slug);
  const deals = useDeals({ category: slug, limit: 1 });
  const [mode, setMode] = useState<Mode | null>(null);
  // Default to deals when the category has any.
  const active: Mode = mode ?? (deals.data && deals.data.total === 0 ? 'products' : 'deals');
  const filters = useDealFilters(`category:${slug}`);
  const requireAuth = useAuth((s) => s.requireAuth);
  const { createSearch } = useMeMutations();

  const saveSearch = () =>
    data &&
    requireAuth('save_search', async () => {
      const label = `${data.category.name}${filters.maxCents ? ` under ${formatPrice(filters.maxCents)}` : ''}`;
      await createSearch.mutateAsync({ label, categorySlug: slug, maxCents: filters.maxCents });
      Alert.alert('Search saved', `We’ll tell you about new ${label.toLowerCase()} deals. Manage it in Alerts › Saved searches.`);
    });

  const switcher = (
    <View style={{ paddingHorizontal: 16, gap: 8 }}>
      {data && deals.data ? (
        <Text variant="subhead" weight="400" tone="secondary" numeric>
          {deals.data.total} live {deals.data.total === 1 ? 'deal' : 'deals'} · {data.products.length} {data.products.length === 1 ? 'product' : 'products'}
        </Text>
      ) : null}
      <SegmentedControl
        options={[
          { value: 'deals', label: 'Deals' },
          { value: 'products', label: 'All products' },
        ]}
        value={active}
        onChange={setMode}
      />
    </View>
  );

  return (
    <>
      <Stack.Screen
        options={{
          title: data?.category.name ?? '',
          headerRight: () => <Button label="Save search" variant="secondary" size="sm" icon="bell" onPress={saveSearch} />,
        }}
      />
      {active === 'deals' ? <DealList scope={`category:${slug}`} query={{ category: slug }} header={switcher} /> : <Products slug={slug} header={switcher} />}
    </>
  );
}

function Products({ slug, header }: { slug: string; header: React.ReactNode }) {
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
      {header}
      {isError ? (
        <LoadError onRetry={refetch} />
      ) : !data ? (
        <GridSkeleton />
      ) : data.products.length === 0 ? (
        <EmptyState icon="grid" title="Nothing here yet" message="Products in this category will appear as the catalog grows." />
      ) : (
        <>
          {brands.length > 1 && (
            <ChipRow>
              <Chip label="All brands" selected={!brand} onPress={() => setBrand(null)} />
              {brands.map((b) => (
                <Chip key={b.slug} label={b.name} selected={brand === b.slug} onPress={() => setBrand(brand === b.slug ? null : b.slug)} />
              ))}
            </ChipRow>
          )}
          <ProductGrid products={products} />
        </>
      )}
    </ScrollView>
  );
}
