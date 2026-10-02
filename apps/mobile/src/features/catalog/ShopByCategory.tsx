import { router } from 'expo-router';
import { ScrollView, View } from 'react-native';

import { categoryArt, CategoryTile } from '@/commerce';
import { SectionHeader, Skeleton } from '@/ui';

import { openCategory } from './components';
import { useCategories } from './hooks';

const TILE_W = 148;

/** Deals home: horizontal category tiles with "See all" → Browse. */
export function ShopByCategory() {
  const { data, isError } = useCategories();
  if (isError) return null;
  return (
    <View style={{ gap: 12 }}>
      <SectionHeader title="Shop by category" actionLabel="See all" onAction={() => router.push('/deals/browse')} />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10, paddingHorizontal: 16 }}>
        {data
          ? data.map((c) => (
              <CategoryTile
                key={c.slug}
                name={c.name}
                count={`${c.productCount} ${c.productCount === 1 ? 'product' : 'products'}`}
                image={categoryArt(c.slug, c.name)}
                width={TILE_W}
                onPress={() => openCategory(c.slug)}
              />
            ))
          : [0, 1, 2].map((i) => <Skeleton key={i} width={TILE_W} height={104} round={18} />)}
      </ScrollView>
    </View>
  );
}
