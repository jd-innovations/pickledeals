import { router } from 'expo-router';
import { useWindowDimensions, View } from 'react-native';

import { ProductCard } from '@/commerce';
import { CardSkeleton, ErrorState } from '@/ui';

import type { ProductSummary } from './api';
import { productImage } from './hooks';

const GUTTER = 16;
const GAP = 12;

/** Two-column card width for the current window. */
export function useGridCardWidth() {
  const { width } = useWindowDimensions();
  return Math.floor((Math.min(width, 600) - GUTTER * 2 - GAP) / 2);
}

export const openProduct = (slug: string) => router.push({ pathname: '/deals/product/[slug]', params: { slug } });
export const openCategory = (slug: string) => router.push({ pathname: '/deals/category/[slug]', params: { slug } });
export const openBrand = (slug: string) => router.push({ pathname: '/deals/brand/[slug]', params: { slug } });

export function ProductGrid({ products, showBrand = true }: { products: ProductSummary[]; showBrand?: boolean }) {
  const cardW = useGridCardWidth();
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: GAP, rowGap: 20, paddingHorizontal: GUTTER }}>
      {products.map((p) => (
        <ProductCard
          key={p.id}
          width={cardW}
          product={{ slug: p.slug, brand: showBrand ? p.brand.name : p.category.name, name: p.name, image: productImage(p), msrpCents: p.msrpCents }}
          onPress={() => openProduct(p.slug)}
        />
      ))}
    </View>
  );
}

export function GridSkeleton({ count = 4 }: { count?: number }) {
  const cardW = useGridCardWidth();
  return (
    <View accessibilityLabel="Loading" style={{ flexDirection: 'row', flexWrap: 'wrap', gap: GAP, rowGap: 20, paddingHorizontal: GUTTER }}>
      {Array.from({ length: count }, (_, i) => (
        <CardSkeleton key={i} width={cardW} />
      ))}
    </View>
  );
}

export function LoadError({ onRetry }: { onRetry: () => void }) {
  return <ErrorState title="Couldn’t load the catalog" message="Check your connection and try again." onRetry={onRetry} />;
}
