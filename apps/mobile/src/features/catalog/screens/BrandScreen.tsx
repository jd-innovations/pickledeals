import { formatEndsIn } from '@pickledeals/shared';
import { Stack, useLocalSearchParams } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useMemo, useState } from 'react';
import { ScrollView, View } from 'react-native';

import { BrandMark, PromoCodeRow } from '@/commerce';
import { DealGrid } from '@/features/deals/components';
import { useDeals } from '@/features/deals/hooks';
import { useLivePromos } from '@/features/offers/hooks';
import { Button, Chip, ChipRow, SectionHeader, Skeleton, Text } from '@/ui';

import { brandLogoUrl } from '../api';
import { GridSkeleton, LoadError, ProductGrid } from '../components';
import { useBrand } from '../hooks';

/** Brand detail (design): mark, name, counts, category filter and the brand's products. */
export default function BrandScreen() {
  const { slug = '' } = useLocalSearchParams<{ slug: string }>();
  const { data, isError, refetch } = useBrand(slug);
  const deals = useDeals({ brand: slug, sort: 'discount', limit: 40 });
  // The brand's codes: live codes at the retailers carrying its current deals.
  const codeRetailers = [...new Set((deals.data?.items ?? []).filter((d) => d.promo).map((d) => d.retailer.slug))];
  const promos = useLivePromos(codeRetailers);
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
              {data
                ? [
                    deals.data ? `${deals.data.total} live ${deals.data.total === 1 ? 'deal' : 'deals'}` : null,
                    promos.data?.length ? `${promos.data.length} promo ${promos.data.length === 1 ? 'code' : 'codes'}` : null,
                    `${data.products.length} ${data.products.length === 1 ? 'product' : 'products'}`,
                  ]
                    .filter(Boolean)
                    .join(' · ')
                : ' '}
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

          {(promos.data?.length ?? 0) > 0 && (
            <View style={{ gap: 10 }}>
              <SectionHeader title="Promo codes" />
              <View style={{ paddingHorizontal: 16, gap: 10 }}>
                {promos.data!.map((p) => (
                  <PromoCodeRow
                    key={p.id}
                    title={p.title}
                    detail={[p.retailerName, p.endsAt ? formatEndsIn(p.endsAt).replace('Ends in', 'ends in') : null, p.isExclusive ? 'exclusive' : null].filter(Boolean).join(' · ')}
                    code={p.code}
                  />
                ))}
              </View>
            </View>
          )}

          {(deals.data?.items.length ?? 0) > 0 && data && (
            <View style={{ gap: 12 }}>
              <SectionHeader title={`Best ${data.brand.name} deals`} trailing="By discount" />
              <DealGrid deals={deals.data!.items.slice(0, 4)} />
            </View>
          )}

          {data && <SectionHeader title={`All ${data.brand.name} products`} />}
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
