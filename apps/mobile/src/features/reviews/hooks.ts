import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useAuth } from '@/features/auth/authStore';

import { deleteReview, fetchBuyerCandidates, fetchMyReview, fetchSellerReviews, submitReview } from './api';

export const reviewKeys = {
  seller: (id: string) => ['reviews', 'seller', id] as const,
  mine: (uid: string, listingId: string) => ['me', uid, 'review', listingId] as const,
  buyers: (listingId: string) => ['me', 'buyer-candidates', listingId] as const,
};

export const useSellerReviews = (sellerId: string) =>
  useQuery({ queryKey: reviewKeys.seller(sellerId), queryFn: () => fetchSellerReviews(sellerId), enabled: !!sellerId, staleTime: 60_000 });

export function useMyReview(listingId: string) {
  const uid = useAuth((s) => s.user?.id);
  return useQuery({ queryKey: reviewKeys.mine(uid ?? '', listingId), queryFn: () => fetchMyReview(listingId), enabled: !!uid && !!listingId });
}

export const useBuyerCandidates = (listingId: string, enabled: boolean) =>
  useQuery({ queryKey: reviewKeys.buyers(listingId), queryFn: () => fetchBuyerCandidates(listingId), enabled: enabled && !!listingId });

export function useReviewMutations(listingId: string, sellerId: string | undefined) {
  const qc = useQueryClient();
  const refresh = () =>
    Promise.all([
      qc.invalidateQueries({ queryKey: ['me'] }),
      sellerId ? qc.invalidateQueries({ queryKey: reviewKeys.seller(sellerId) }) : null,
    ]);
  return {
    submit: useMutation({ mutationFn: ({ rating, body }: { rating: number; body: string }) => submitReview(listingId, rating, body), onSuccess: refresh }),
    remove: useMutation({ mutationFn: () => deleteReview(listingId), onSuccess: refresh }),
  };
}
