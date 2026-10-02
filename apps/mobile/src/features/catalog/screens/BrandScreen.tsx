import { Stack, useLocalSearchParams } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useMemo, useState } from 'react';
import { ScrollView, View } from 'react-native';

import { BrandMark } from '@/commerce';
import { Button, Chip, ChipRow, Skeleton, Text } from '@/ui';

import { brandLogoUrl } from '../api';
import { GridSkeleton, LoadError, ProductGrid } from '../components';
import { useBrand } from '../hooks';

/** Brand detail (design): mark, name, counts, category filter and the brand's products. */
export default function BrandScreen() {
  const { slug = '' } = useLocalSearchParams<{ slug: string }>();
  const { data, isError, refetch } = useBrand(slug);
  const [category, setCategory] = useState<string | null>(null);

  const categories = useMemo(() => {
    const counts = new Map<string, { slug: string; name: string; n: number }>();
    for (const p of data?.products ?? []) {
      const c = counts.get(p.category.slug) ?? { ...p.category, n: 0 };
      c.n++;
      counts.set(p.category.slug, c);
    }
    return [...counts.values()].sort((a, b) => b.n - a.n);
  }, [data]);

  // The brand's biggest categories first (paddles before accessories), then by name.
  const rank = new Map(categories.map((c, i) => [c.slug, i]));
  const products = (data?.products ?? [])
    .filter((p) => !category || p.category.slug === category)
    .sort((a, b) => (rank.get(a.category.slug) ?? 0) - (rank.get(b.category.slug) ?? 0) || a.name.localeCompare(b.name));
  const website = data?.brand.websiteUrl;

  return (
    <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={{ paddingBottom: 120, gap: 16 }}>
      <Stack.Screen options={{ title: '', headerLargeTitle: false }} />
      {isError ? (
        <LoadError onRetry={refetch} />
      ) : (
        <>
          <View style={{ paddingHorizontal: 16, gap: 10 }}>
            {data ? (
              <BrandMark name={data.brand.name} logoUri={data.brand.logoPath ? brandLogoUrl(data.brand.logoPath) : null} size={72} />
            ) : (
              <Skeleton width={72} height={72} round={36} />
            )}
            <Text variant="largeTitle">{data?.brand.name ?? ' '}</Text>
            <Text variant="subhead" weight="400" tone="secondary" numeric>
              {data ? `${data.products.length} ${data.products.length === 1 ? 'product' : 'products'}` : ' '}
            </Text>
            {website ? (
              <View style={{ alignItems: 'flex-start' }}>
                <Button
                  label={`Visit ${website.replace(/^https:\/\/(www\.)?/, '').replace(/\/$/, '')}`}
                  variant="secondary"
                  size="sm"
                  icon="external"
                  iconPosition="trailing"
                  onPress={() => WebBrowser.openBrowserAsync(website)}
                />
              </View>
            ) : null}
          </View>

          {categories.length > 1 && (
            <ChipRow>
              <Chip label="All" selected={!category} onPress={() => setCategory(null)} />
              {categories.map((c) => (
                <Chip key={c.slug} label={`${c.name} ${c.n}`} selected={category === c.slug} onPress={() => setCategory(category === c.slug ? null : c.slug)} />
              ))}
            </ChipRow>
          )}
          {data ? <ProductGrid products={products} showBrand={false} /> : <GridSkeleton />}
        </>
      )}
    </ScrollView>
  );
}
