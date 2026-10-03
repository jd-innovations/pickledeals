import { formatPrice, pickDealBadge } from '@pickledeals/shared';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { create } from 'zustand';

import type { DealCardData } from '@/commerce';
import { productImage } from '@/features/catalog/hooks';

import { fetchCollection, fetchDeals, fetchHome, type Deal, type FeedQuery, type Sort } from './api';

const DEALS_STALE = 60_000;

export const dealKeys = {
  home: ['deals', 'home'] as const,
  feed: (q: FeedQuery) => ['deals', 'feed', q] as const,
  collection: (slug: string) => ['deals', 'collection', slug] as const,
};

export const useDealsHome = () => useQuery({ queryKey: dealKeys.home, queryFn: fetchHome, staleTime: DEALS_STALE });
export const useDeals = (q: FeedQuery, enabled = true) =>
  useQuery({ queryKey: dealKeys.feed(q), queryFn: () => fetchDeals(q), staleTime: DEALS_STALE, enabled, placeholderData: keepPreviousData });
export const useCollection = (slug: string) =>
  useQuery({ queryKey: dealKeys.collection(slug), queryFn: () => fetchCollection(slug), staleTime: 5 * 60_000, enabled: !!slug });

export const dealTitle = (d: Deal) => (d.variant.hasSiblings ? `${d.product.name} ${d.variant.label}` : d.product.name);

/** Deal → card data. D1: check-price deals show "Check price", never a number. */
export function toCard(d: Deal, sponsoredBy?: string): DealCardData {
  const meta = d.promo
    ? `Code ${d.promo.code} · ${d.retailer.name}`
    : d.wasCents && d.priceCents && d.wasCents > d.priceCents
      ? `${d.retailer.name} · Save ${formatPrice(d.wasCents - d.priceCents)}`
      : d.retailer.name;
  return {
    id: d.id,
    brand: d.brand.name,
    name: dealTitle(d),
    image: productImage({ slug: d.product.slug, name: d.product.name, brand: d.brand, category: d.category, image: d.image }),
    retailer: d.retailer.name,
    priceDisplay: d.priceDisplay,
    priceCents: d.priceCents,
    referenceCents: d.wasCents,
    badge: pickDealBadge(d.badges),
    meta,
    sponsoredBy,
  };
}

/** Filters for a deal list (category, brand, feed), kept per scope while the app is open. */
export type DealFilters = { sort?: Sort; minCents?: number; maxCents?: number; brands: string[]; kinds: Deal['kind'][]; inStockOnly: boolean };
export const EMPTY_FILTERS: DealFilters = { brands: [], kinds: [], inStockOnly: false };

export const activeFilterCount = (f: DealFilters) =>
  (f.minCents != null || f.maxCents != null ? 1 : 0) + (f.brands.length ? 1 : 0) + (f.kinds.length ? 1 : 0) + (f.inStockOnly ? 1 : 0);

type FilterStore = { byScope: Record<string, DealFilters>; set: (scope: string, f: DealFilters) => void };
export const useDealFilterStore = create<FilterStore>((set) => ({
  byScope: {},
  set: (scope, f) => set((s) => ({ byScope: { ...s.byScope, [scope]: f } })),
}));
export const useDealFilters = (scope: string) => useDealFilterStore((s) => s.byScope[scope] ?? EMPTY_FILTERS);
