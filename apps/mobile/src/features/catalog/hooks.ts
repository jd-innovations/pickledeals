import AsyncStorage from '@react-native-async-storage/async-storage';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import { productArt } from '@/commerce/catalogArt';
import type { ImageSource } from '@/commerce';

import {
  fetchBrand,
  fetchBrands,
  fetchCategories,
  fetchCategory,
  fetchProduct,
  fetchProductSlug,
  fetchProductsUnder,
  imageUrl,
  searchCatalog,
  type ProductDetail,
  type ProductSummary,
} from './api';

const CATALOG_STALE = 5 * 60_000;

export const catalogKeys = {
  search: (q: string) => ['catalog', 'search', q] as const,
  categories: ['catalog', 'categories'] as const,
  brands: ['catalog', 'brands'] as const,
  category: (slug: string) => ['catalog', 'category', slug] as const,
  brand: (slug: string) => ['catalog', 'brand', slug] as const,
  product: (slug: string) => ['catalog', 'product', slug] as const,
  under: (maxCents: number) => ['catalog', 'under', maxCents] as const,
};

function useDebounced<T>(value: T, ms: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return debounced;
}

/** Type-ahead search: debounced, keeps the previous results on screen while the next query loads. */
export function useCatalogSearch(query: string, { limit = 8, debounceMs = 160 } = {}) {
  const q = useDebounced(query.trim().toLowerCase(), debounceMs);
  return useQuery({
    queryKey: [...catalogKeys.search(q), limit],
    queryFn: () => searchCatalog(q, limit),
    enabled: q.length >= 2,
    placeholderData: keepPreviousData,
    staleTime: CATALOG_STALE,
  });
}

export const useCategories = () => useQuery({ queryKey: catalogKeys.categories, queryFn: fetchCategories, staleTime: CATALOG_STALE });
export const useBrands = () => useQuery({ queryKey: catalogKeys.brands, queryFn: fetchBrands, staleTime: CATALOG_STALE });
export const useCategory = (slug: string) =>
  useQuery({ queryKey: catalogKeys.category(slug), queryFn: () => fetchCategory(slug), staleTime: CATALOG_STALE, enabled: !!slug });
export const useBrand = (slug: string) =>
  useQuery({ queryKey: catalogKeys.brand(slug), queryFn: () => fetchBrand(slug), staleTime: CATALOG_STALE, enabled: !!slug });
export const useProduct = (slug: string) =>
  useQuery({ queryKey: catalogKeys.product(slug), queryFn: () => fetchProduct(slug), staleTime: CATALOG_STALE, enabled: !!slug });

export const useProductsUnder = (maxCents: number, enabled = true) =>
  useQuery({ queryKey: catalogKeys.under(maxCents), queryFn: () => fetchProductsUnder(maxCents), staleTime: CATALOG_STALE, enabled });
export const useProductSlug = (productId: string | undefined) =>
  useQuery({ queryKey: ['catalog', 'slug', productId ?? ''], queryFn: () => fetchProductSlug(productId!), enabled: !!productId, staleTime: Infinity });

/** Licensed catalog image when one exists (D8), otherwise the design's placeholder art. */
/** Every active image of a product, in order, for the product page gallery (placeholder art when none). */
export function galleryImages(p: Pick<ProductDetail, 'slug' | 'name' | 'brand' | 'category' | 'image' | 'images'>): ImageSource[] {
  const alt = `${p.brand.name} ${p.name}`;
  if (!p.images.length) return [productImage(p)];
  return p.images.map((img, i) => ({
    kind: 'remote',
    uri: imageUrl(img),
    isCutout: img.isCutout,
    blurhash: img.blurhash ?? undefined,
    alt: `${alt}, photo ${i + 1}`,
  }));
}

export function productImage(p: Pick<ProductSummary, 'slug' | 'name' | 'brand' | 'category' | 'image'>): ImageSource {
  const alt = `${p.brand.name} ${p.name}`;
  return p.image
    ? { kind: 'remote', uri: imageUrl(p.image), isCutout: p.image.isCutout, blurhash: p.image.blurhash ?? undefined, alt }
    : productArt(p.slug, p.category.slug, alt);
}

/** Recent searches stay on this device; they are never sent to the server. */
type RecentSearches = { items: string[]; add: (q: string) => void; clear: () => void };

export const useRecentSearches = create<RecentSearches>()(
  persist(
    (set) => ({
      items: [],
      add: (q) => {
        const query = q.trim();
        if (query.length < 2) return;
        set((s) => ({ items: [query, ...s.items.filter((i) => i.toLowerCase() !== query.toLowerCase())].slice(0, 8) }));
      },
      clear: () => set({ items: [] }),
    }),
    { name: 'pd.recent-searches.v1', storage: createJSONStorage(() => AsyncStorage) },
  ),
);
