import { requireSupabase } from '@/lib/supabase';

/**
 * Seller reviews (owner decisions Oct 13): the linked buyer of a sold listing rates the seller 1–5
 * stars with an optional comment, for 30 days after the sale. Everything goes through RPCs; the
 * eligibility rules live in SQL (seller_reviews migration).
 */

export type SellerReview = {
  id: string;
  rating: number;
  body: string | null;
  createdAt: string;
  reviewerId: string | null;
  reviewerName: string;
  reviewerAvatar: string | null;
  item: string | null;
};

export type ReviewSummary = { average: number | null; count: number; items: SellerReview[] };

type ReviewRow = {
  id: string;
  rating: number;
  body: string | null;
  created_at: string;
  reviewer_id: string | null;
  reviewer_name: string;
  reviewer_avatar: string | null;
  item: string | null;
};

export async function fetchSellerReviews(sellerId: string, limit = 20): Promise<ReviewSummary> {
  const { data, error } = await requireSupabase().rpc('seller_reviews_for', { seller: sellerId, max_rows: limit });
  if (error) throw error;
  const d = data as { average: number | null; count: number; items: ReviewRow[] };
  return {
    average: d.average == null ? null : Number(d.average),
    count: d.count,
    items: d.items.map((r) => ({
      id: r.id,
      rating: r.rating,
      body: r.body,
      createdAt: r.created_at,
      reviewerId: r.reviewer_id,
      reviewerName: r.reviewer_name,
      reviewerAvatar: r.reviewer_avatar,
      item: r.item,
    })),
  };
}

export type MyReview = {
  listingId: string;
  title: string;
  sellerId: string;
  sellerName: string;
  closesAt: string;
  open: boolean;
  review: { rating: number; body: string | null; hidden: boolean } | null;
};

/** Null unless the signed-in user is the linked buyer of this sold listing. */
export async function fetchMyReview(listingId: string): Promise<MyReview | null> {
  const { data, error } = await requireSupabase().rpc('my_review', { listing: listingId });
  if (error) throw error;
  if (!data) return null;
  const d = data as {
    listing_id: string;
    title: string;
    seller_id: string;
    seller_name: string;
    closes_at: string;
    open: boolean;
    review: MyReview['review'];
  };
  return { listingId: d.listing_id, title: d.title, sellerId: d.seller_id, sellerName: d.seller_name, closesAt: d.closes_at, open: d.open, review: d.review };
}

export async function submitReview(listingId: string, rating: number, body: string) {
  const { error } = await requireSupabase().rpc('submit_review', { listing: listingId, rating, body: body.trim() || undefined });
  if (error) throw error;
}

export async function deleteReview(listingId: string) {
  const { error } = await requireSupabase().rpc('delete_review', { listing: listingId });
  if (error) throw error;
}

export type BuyerCandidate = { buyerId: string; name: string; avatarPath: string | null; detail: string; accepted: boolean };

/** Seller only: people who messaged about the listing, the accepted offer's buyer first. */
export async function fetchBuyerCandidates(listingId: string): Promise<BuyerCandidate[]> {
  const { data, error } = await requireSupabase().rpc('listing_buyer_candidates', { listing: listingId });
  if (error) throw error;
  return data.map((c) => ({ buyerId: c.buyer_id, name: c.name, avatarPath: c.avatar_path, detail: c.detail, accepted: c.accepted }));
}
