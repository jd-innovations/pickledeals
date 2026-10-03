import AsyncStorage from '@react-native-async-storage/async-storage';
import type { ListingCondition } from '@pickledeals/shared';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import { productArt } from '@/commerce/catalogArt';
import type { ImageSource } from '@/commerce';
import { useAuth } from '@/features/auth/authStore';

import { fetchHomeArea, fetchListing, fetchMarket, fetchMyListings, fetchPriceGuide, fetchSavedListings, fetchSeller, listingImageUrl, setListingStatus, updateListing, type ListingCardItem, type MarketQuery, type MarketSort } from './api';

export const marketKeys = {
  feed: (q: MarketQuery) => ['market', 'feed', q] as const,
  listing: (id: string) => ['market', 'listing', id] as const,
  seller: (id: string) => ['market', 'seller', id] as const,
  mine: (uid: string) => ['me', uid, 'listings'] as const,
  home: (uid: string) => ['me', uid, 'home-area'] as const,
};

/**
 * Where "near you" is measured from. The device point stays in memory only (never persisted, never
 * sent anywhere but the feed RPC, which snaps it); signed-in users can fall back to their saved
 * home area, which the server reads directly.
 */
type Viewer = { point: { lat: number; lng: number } | null; label: string | null; set: (v: Partial<Omit<Viewer, 'set'>>) => void };
export const useViewer = create<Viewer>((set) => ({ point: null, label: null, set: (v) => set(v) }));

export function useMarket(q: Omit<MarketQuery, 'origin' | 'useHome'>, enabled = true) {
  const point = useViewer((s) => s.point);
  const signedIn = useAuth((s) => !!s.user);
  const query: MarketQuery = { ...q, origin: point, useHome: !point && signedIn };
  return useQuery({ queryKey: marketKeys.feed(query), queryFn: () => fetchMarket(query), enabled, placeholderData: keepPreviousData, staleTime: 60_000 });
}

export const useListing = (id: string) => useQuery({ queryKey: marketKeys.listing(id), queryFn: () => fetchListing(id), enabled: !!id, staleTime: 30_000 });
export const useSeller = (id: string) => useQuery({ queryKey: marketKeys.seller(id), queryFn: () => fetchSeller(id), enabled: !!id, staleTime: 60_000 });

export function useMyListings() {
  const uid = useAuth((s) => s.user?.id);
  return useQuery({ queryKey: marketKeys.mine(uid ?? ''), queryFn: () => fetchMyListings(uid!), enabled: !!uid });
}

export const usePriceGuide = (variantId: string | null | undefined) =>
  useQuery({ queryKey: ['market', 'price-guide', variantId], queryFn: () => fetchPriceGuide(variantId!), enabled: !!variantId, staleTime: 5 * 60_000 });

export function useSavedListings() {
  const uid = useAuth((s) => s.user?.id);
  return useQuery({ queryKey: ['me', uid ?? '', 'saved-listings'], queryFn: fetchSavedListings, enabled: !!uid });
}

/** Seller-side writes; everything market- or me-shaped is refetched afterwards. */
export function useListingMutations() {
  const qc = useQueryClient();
  const refresh = () => Promise.all([qc.invalidateQueries({ queryKey: ['market'] }), qc.invalidateQueries({ queryKey: ['me'] })]);
  return {
    setStatus: useMutation({
      mutationFn: ({ id, status, soldPriceCents }: { id: string; status: 'active' | 'pending' | 'sold' | 'removed'; soldPriceCents?: number }) => setListingStatus(id, status, soldPriceCents),
      onSuccess: refresh,
    }),
    update: useMutation({ mutationFn: ({ id, changes }: { id: string; changes: Parameters<typeof updateListing>[1] }) => updateListing(id, changes), onSuccess: refresh }),
  };
}

export function useHomeArea() {
  const uid = useAuth((s) => s.user?.id);
  return useQuery({ queryKey: marketKeys.home(uid ?? ''), queryFn: fetchHomeArea, enabled: !!uid });
}

/** Listing photo, or the design's placeholder art when the listing has none. */
export function listingImage(l: Pick<ListingCardItem, 'imagePath' | 'title' | 'productSlug' | 'categorySlug' | 'id'>): ImageSource {
  return l.imagePath
    ? { kind: 'remote', uri: listingImageUrl(l.imagePath), isCutout: false, alt: l.title }
    : productArt(l.productSlug ?? l.id, l.categorySlug, l.title);
}

export const listingTitle = (l: Pick<ListingCardItem, 'title' | 'variantLabel' | 'hasVariants' | 'brandName'>) =>
  [l.brandName, l.title, l.hasVariants && l.variantLabel ? l.variantLabel : null].filter(Boolean).join(' ');

/** Marketplace filters (shared by grid and, in Phase 7, the map). */
export type MarketFilters = { radiusM: number | null; conditions: ListingCondition[]; category: string | null; brands: string[]; minCents?: number; maxCents?: number; pickupOnly: boolean; includeShipping: boolean; sort: MarketSort };
export const DEFAULT_MARKET_FILTERS: MarketFilters = { radiusM: 40234, conditions: [], category: null, brands: [], pickupOnly: false, includeShipping: true, sort: 'nearest' };

export const filtersToQuery = (f: MarketFilters) => ({
  radiusM: f.radiusM,
  includeShipping: f.includeShipping,
  category: f.category ?? undefined,
  conditions: f.conditions,
  brands: f.brands,
  minCents: f.minCents,
  maxCents: f.maxCents,
  pickupOnly: f.pickupOnly,
  sort: f.sort,
});
export const useMarketFilters = create<{ f: MarketFilters; set: (f: MarketFilters) => void }>((set) => ({ f: DEFAULT_MARKET_FILTERS, set: (f) => set({ f }) }));

// --- Sell draft (persisted on this device so a half-finished listing survives a restart) -------

export type DraftPhoto = { localUri: string; width: number; height: number; path?: string; uploading?: boolean; error?: string };
export type SellDraft = {
  id: string;
  product: { id: string; slug: string; name: string; brand: string; categorySlug: string; variantId: string | null; variantLabel: string | null; msrpCents: number | null } | null;
  custom: { title: string; brand: string; categorySlug: string } | null;
  photos: DraftPhoto[];
  condition: ListingCondition | null;
  priceCents: number | null;
  acceptsOffers: boolean;
  hideBelowCents: number | null;
  description: string;
  location: { lat: number; lng: number; label: string; postalCode: string | null } | null;
  pickup: boolean;
  ships: boolean;
};

const newDraft = (): SellDraft => ({
  id: globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`,
  product: null,
  custom: null,
  photos: [],
  condition: null,
  priceCents: null,
  acceptsOffers: true,
  hideBelowCents: null,
  description: '',
  location: null,
  pickup: true,
  ships: false,
});

type DraftStore = { draft: SellDraft; update: (patch: Partial<SellDraft> | ((d: SellDraft) => Partial<SellDraft>)) => void; reset: () => void };
export const useSellDraft = create<DraftStore>()(
  persist(
    (set) => ({
      draft: newDraft(),
      update: (patch) => set((s) => ({ draft: { ...s.draft, ...(typeof patch === 'function' ? patch(s.draft) : patch) } })),
      reset: () => set({ draft: newDraft() }),
    }),
    {
      name: 'pd.sell-draft.v1',
      storage: createJSONStorage(() => AsyncStorage),
      // In-flight uploads don't survive a restart; keep only finished photos.
      partialize: (s) => ({ draft: { ...s.draft, photos: s.draft.photos.filter((p) => p.path) } }),
    },
  ),
);
