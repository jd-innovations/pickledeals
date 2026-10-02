import { Stack, router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ScrollView, useWindowDimensions, View } from 'react-native';

import { BrandRow, categoryArt, CategoryTile } from '@/commerce';
import { IconButton, SegmentedControl, Skeleton } from '@/ui';

import { brandLogoUrl } from '../api';
import { LoadError, openBrand, openCategory } from '../components';
import { useBrands, useCategories } from '../hooks';

type Tab = 'categories' | 'brands';
const count = (n: number) => `${n} ${n === 1 ? 'product' : 'products'}`;

/** Browse › Categories | Brands (design). Retailers join in Phase 3. */
export default function BrowseScreen() {
  const params = useLocalSearchParams<{ tab?: Tab }>();
  const [tab, setTab] = useState<Tab>(params.tab === 'brands' ? 'brands' : 'categories');

  return (
    <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={{ paddingBottom: 120, gap: 16 }}>
      <Stack.Screen
        options={{ headerRight: () => <IconButton icon="search" label="Search" size={34} onPress={() => router.push('/deals/search')} /> }}
      />
      <View style={{ paddingHorizontal: 16 }}>
        <SegmentedControl
          options={[
            { value: 'categories', label: 'Categories' },
            { value: 'brands', label: 'Brands' },
          ]}
          value={tab}
          onChange={setTab}
        />
      </View>
      {tab === 'categories' ? <Categories /> : <Brands />}
    </ScrollView>
  );
}

function Categories() {
  const { width } = useWindowDimensions();
  const tileW = Math.floor((Math.min(width, 600) - 32 - 10) / 2);
  const { data, isError, refetch } = useCategories();
  if (isError) return <LoadError onRetry={refetch} />;
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, paddingHorizontal: 16 }}>
      {data
        ? data.map((c) => (
            <CategoryTile key={c.slug} name={c.name} count={count(c.productCount)} image={categoryArt(c.slug, c.name)} width={tileW} onPress={() => openCategory(c.slug)} />
          ))
        : Array.from({ length: 8 }, (_, i) => <Skeleton key={i} width={tileW} height={104} round={18} />)}
    </View>
  );
}

function Brands() {
  const { data, isError, refetch } = useBrands();
  if (isError) return <LoadError onRetry={refetch} />;
  if (!data) return <View style={{ paddingHorizontal: 16, gap: 12 }}>{[0, 1, 2, 3].map((i) => <Skeleton key={i} height={48} round={12} />)}</View>;
  return (
    <View>
      {data.map((b, i) => (
        <BrandRow
          key={b.slug}
          name={b.name}
          meta={count(b.productCount)}
          logoUri={b.logoPath ? brandLogoUrl(b.logoPath) : null}
          onPress={() => openBrand(b.slug)}
          last={i === data.length - 1}
        />
      ))}
    </View>
  );
}
