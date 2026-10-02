import { keepPreviousData, useQuery } from '@tanstack/react-query';
import * as Haptics from 'expo-haptics';
import * as WebBrowser from 'expo-web-browser';

import { fetchLivePromos, fetchOffer, fetchPriceHistory, fetchProductOffers, fetchRecentChanges, goUrl } from './api';

// Prices move; keep them fresher than catalog data.
const OFFER_STALE = 60_000;

export const offerKeys = {
  product: (productId: string) => ['offers', 'product', productId] as const,
  offer: (offerId: string) => ['offers', 'offer', offerId] as const,
  promos: (slugs: string[]) => ['offers', 'promos', ...slugs] as const,
  history: (variantId: string, days: number, retailer?: string) => ['offers', 'history', variantId, days, retailer ?? 'all'] as const,
  changes: (variantId: string) => ['offers', 'changes', variantId] as const,
};

export const useProductOffers = (productId: string | undefined) =>
  useQuery({ queryKey: offerKeys.product(productId ?? ''), queryFn: () => fetchProductOffers(productId!), enabled: !!productId, staleTime: OFFER_STALE });

export const useOffer = (offerId: string) =>
  useQuery({ queryKey: offerKeys.offer(offerId), queryFn: () => fetchOffer(offerId), enabled: !!offerId, staleTime: OFFER_STALE });

export const useLivePromos = (retailerSlugs: string[]) =>
  useQuery({ queryKey: offerKeys.promos(retailerSlugs), queryFn: () => fetchLivePromos(retailerSlugs), enabled: retailerSlugs.length > 0, staleTime: OFFER_STALE });

export const usePriceHistory = (variantId: string | undefined, days: number, retailerSlug?: string) =>
  useQuery({
    queryKey: offerKeys.history(variantId ?? '', days, retailerSlug),
    queryFn: () => fetchPriceHistory(variantId!, days, retailerSlug),
    enabled: !!variantId,
    staleTime: 5 * 60_000,
    placeholderData: keepPreviousData,
  });

export const useRecentChanges = (variantId: string | undefined) =>
  useQuery({ queryKey: offerKeys.changes(variantId ?? ''), queryFn: () => fetchRecentChanges(variantId!), enabled: !!variantId, staleTime: 5 * 60_000 });

/** Opens the retailer in the in-app browser (SFSafariViewController on iOS) via the go redirect. */
export function openDeal(offerId: string, placement: string, promoId?: string) {
  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
  return WebBrowser.openBrowserAsync(goUrl(offerId, placement, promoId), { dismissButtonStyle: 'close', readerMode: false });
}
