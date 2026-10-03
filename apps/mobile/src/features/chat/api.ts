import type { Database, OfferStatus } from '@pickledeals/shared';

import { requireSupabase } from '@/lib/supabase';

/**
 * Chat (Phase 8, §7). Messages are rows; Realtime only accelerates delivery, so every screen can
 * rebuild itself from these reads (backfill on reconnect or foreground).
 */

export type MessageKind = Database['public']['Enums']['message_kind'];

export type ChatMessage = {
  id: number;
  conversationId: string;
  senderId: string | null;
  kind: MessageKind;
  body: string | null;
  imagePath: string | null;
  offerId: string | null;
  meta: Record<string, unknown>;
  clientId: string | null;
  createdAt: string;
  /** Client-only: optimistic sends. */
  status?: 'sending' | 'failed';
  error?: string;
  localUri?: string;
};

type MessageRow = {
  id: number;
  conversation_id: string;
  sender_id: string | null;
  kind: MessageKind;
  body: string | null;
  image_path: string | null;
  offer_id: string | null;
  meta: unknown;
  client_id: string | null;
  created_at: string;
};

export const toMessage = (r: MessageRow): ChatMessage => ({
  id: r.id,
  conversationId: r.conversation_id,
  senderId: r.sender_id,
  kind: r.kind,
  body: r.body,
  imagePath: r.image_path,
  offerId: r.offer_id,
  meta: (r.meta ?? {}) as Record<string, unknown>,
  clientId: r.client_id,
  createdAt: r.created_at,
});

const MESSAGE_COLUMNS = 'id, conversation_id, sender_id, kind, body, image_path, offer_id, meta, client_id, created_at';
export const PAGE = 40;

/** Newest page (or the page before `beforeId`), returned oldest-first. */
export async function fetchMessages(conversationId: string, beforeId?: number): Promise<ChatMessage[]> {
  let q = requireSupabase().from('messages').select(MESSAGE_COLUMNS).eq('conversation_id', conversationId).order('id', { ascending: false }).limit(PAGE);
  if (beforeId) q = q.lt('id', beforeId);
  const { data, error } = await q;
  if (error) throw error;
  return (data as MessageRow[]).map(toMessage).reverse();
}

/** Backfill after a reconnect: everything newer than what we have. */
export async function fetchMessagesAfter(conversationId: string, afterId: number): Promise<ChatMessage[]> {
  const { data, error } = await requireSupabase().from('messages').select(MESSAGE_COLUMNS).eq('conversation_id', conversationId).gt('id', afterId).order('id').limit(200);
  if (error) throw error;
  return (data as MessageRow[]).map(toMessage);
}

export type NewMessage = { kind: 'text'; body: string } | { kind: 'image'; imagePath: string; width: number; height: number } | { kind: 'location_share'; lat: number; lng: number; label?: string };

export async function sendMessage(conversationId: string, clientId: string, m: NewMessage): Promise<ChatMessage> {
  const client = requireSupabase();
  const row =
    m.kind === 'text'
      ? { body: m.body }
      : m.kind === 'image'
        ? { image_path: m.imagePath, meta: { width: m.width, height: m.height } }
        : { meta: { lat: m.lat, lng: m.lng, label: m.label ?? null } };
  const { data, error } = await client
    .from('messages')
    .insert({ conversation_id: conversationId, kind: m.kind, client_id: clientId, ...row })
    .select(MESSAGE_COLUMNS)
    .single();
  if (error?.code === '23505') {
    // A retry of something that already arrived: idempotent by client id.
    const again = await client.from('messages').select(MESSAGE_COLUMNS).eq('conversation_id', conversationId).eq('client_id', clientId).single();
    if (again.error) throw again.error;
    return toMessage(again.data as MessageRow);
  }
  if (error) throw error;
  return toMessage(data as MessageRow);
}

export type Thread = {
  id: string;
  listingId: string;
  listingTitle: string;
  listingStatus: 'draft' | 'active' | 'pending' | 'sold' | 'removed';
  listingPriceCents: number;
  listingImage: string | null;
  productSlug: string | null;
  categorySlug: string;
  role: 'buyer' | 'seller';
  otherId: string | null;
  otherName: string;
  lastMessageId: number | null;
  lastMessageAt: string | null;
  lastMessagePreview: string | null;
  lastMessageMine: boolean;
  unread: number;
  muted: boolean;
  archived: boolean;
  otherLastReadMessageId: number;
  otherLastReadAt: string | null;
  /** The thread's latest offer (Phase 9). */
  offer: { id: string; status: OfferStatus; amountCents: number; awaitingMe: boolean; mine: boolean } | null;
  acceptsOffers: boolean;
  variantId: string | null;
};

type ThreadRow = Database['public']['Functions']['my_conversations']['Returns'][number];

const toThread = (r: ThreadRow): Thread => ({
  id: r.id,
  listingId: r.listing_id,
  listingTitle: r.listing_title,
  listingStatus: r.listing_status as Thread['listingStatus'],
  listingPriceCents: r.listing_price_cents,
  listingImage: r.listing_image,
  productSlug: r.product_slug,
  categorySlug: r.category_slug,
  role: r.role as Thread['role'],
  otherId: r.other_id,
  otherName: r.other_name,
  lastMessageId: r.last_message_id,
  lastMessageAt: r.last_message_at,
  lastMessagePreview: r.last_message_preview,
  lastMessageMine: !!r.last_message_mine,
  unread: r.unread,
  muted: r.muted,
  archived: r.archived,
  otherLastReadMessageId: r.other_last_read_message_id ?? 0,
  otherLastReadAt: r.other_last_read_at,
  offer: r.offer_id
    ? { id: r.offer_id, status: r.offer_status as OfferStatus, amountCents: r.offer_amount_cents, awaitingMe: !!r.offer_awaiting_me, mine: !!r.offer_mine }
    : null,
  acceptsOffers: r.accepts_offers,
  variantId: r.variant_id,
});

export async function fetchInbox(): Promise<Thread[]> {
  const { data, error } = await requireSupabase().rpc('my_conversations');
  if (error) throw error;
  return data.map(toThread);
}

export async function fetchThread(id: string): Promise<Thread | null> {
  const { data, error } = await requireSupabase().rpc('my_conversations', { only_id: id });
  if (error) throw error;
  return data[0] ? toThread(data[0]) : null;
}

export async function fetchUnreadThreads(): Promise<number> {
  const { data, error } = await requireSupabase().rpc('unread_conversation_count');
  if (error) throw error;
  return data;
}

export async function startConversation(listingId: string): Promise<string> {
  const { data, error } = await requireSupabase().rpc('start_conversation', { listing: listingId });
  if (error) throw error;
  return data;
}

export async function markRead(conversationId: string, upTo: number) {
  const { error } = await requireSupabase().rpc('mark_conversation_read', { conversation: conversationId, up_to: upTo });
  if (error) throw error;
}

export async function setThreadState(conversationId: string, state: { muted?: boolean; archived?: boolean }) {
  const { error } = await requireSupabase().rpc('set_conversation_state', { conversation: conversationId, ...state });
  if (error) throw error;
}

export async function blockUser(userId: string) {
  const { error } = await requireSupabase().rpc('block_user', { target: userId });
  if (error) throw error;
}

export async function unblockUser(userId: string) {
  const { error } = await requireSupabase().rpc('unblock_user', { target: userId });
  if (error) throw error;
}

/** People the caller has blocked, with their public names (Account → Blocked people). */
export async function fetchBlocked(): Promise<{ id: string; name: string }[]> {
  const client = requireSupabase();
  const { data, error } = await client.from('user_blocks').select('blocked_id').order('created_at', { ascending: false });
  if (error) throw error;
  if (!data.length) return [];
  const names = await client.from('profiles').select('id, display_name').in('id', data.map((r) => r.blocked_id));
  if (names.error) throw names.error;
  const byId = new Map(names.data.map((p) => [p.id, p.display_name]));
  return data.map((r) => ({ id: r.blocked_id, name: byId.get(r.blocked_id) ?? 'Deleted user' }));
}

export type ReportTarget = 'listing' | 'user' | 'conversation';
export type ReportReason = 'prohibited' | 'scam' | 'offensive' | 'spam' | 'counterfeit' | 'other';

export async function fileReport(targetType: ReportTarget, targetId: string, reason: ReportReason, details?: string) {
  const { error } = await requireSupabase().rpc('file_report', { target_type: targetType, target_id: targetId, reason, details });
  if (error) throw error;
}

/** Chat photos are private: short-lived signed URLs, participants only (storage RLS). */
export async function chatImageUrl(path: string): Promise<string> {
  const { data, error } = await requireSupabase().storage.from('chat-images').createSignedUrl(path, 60 * 60);
  if (error) throw error;
  return data.signedUrl;
}

/** Friendly text for server errors raised by the chat triggers and RPCs. */
export function chatErrorText(e: unknown): string {
  const err = e as { message?: string; code?: string };
  if (err?.code === '42501' || err?.code === '54000' || err?.code === '22023') return err.message ?? 'Couldn’t send.';
  return 'Couldn’t send. Check your connection.';
}

// --- Offers (Phase 9) ----------------------------------------------------------------------------

export type Offer = {
  id: string;
  conversationId: string;
  listingId: string;
  buyerId: string | null;
  sellerId: string | null;
  proposedBy: string | null;
  parentOfferId: string | null;
  amountCents: number;
  message: string | null;
  status: OfferStatus;
  expiresAt: string;
  createdAt: string;
};

export async function fetchThreadOffers(conversationId: string): Promise<Offer[]> {
  const { data, error } = await requireSupabase()
    .from('marketplace_offers')
    .select('id, conversation_id, listing_id, buyer_id, seller_id, proposed_by, parent_offer_id, amount_cents, message, status, expires_at, created_at')
    .eq('conversation_id', conversationId)
    .order('created_at');
  if (error) throw error;
  return data.map((o) => ({
    id: o.id,
    conversationId: o.conversation_id,
    listingId: o.listing_id,
    buyerId: o.buyer_id,
    sellerId: o.seller_id,
    proposedBy: o.proposed_by,
    parentOfferId: o.parent_offer_id,
    amountCents: o.amount_cents,
    message: o.message,
    status: o.status as OfferStatus,
    expiresAt: o.expires_at,
    createdAt: o.created_at,
  }));
}

export async function makeOffer(listingId: string, amountCents: number, message?: string): Promise<{ offerId: string; conversationId: string; status: OfferStatus }> {
  const { data, error } = await requireSupabase().rpc('make_offer', { listing: listingId, amount_cents: amountCents, message: message || undefined });
  if (error) throw error;
  const r = data as { offer_id: string; conversation_id: string; status: OfferStatus };
  return { offerId: r.offer_id, conversationId: r.conversation_id, status: r.status };
}

export async function counterOffer(offerId: string, amountCents: number, message?: string) {
  const { error } = await requireSupabase().rpc('counter_offer', { offer: offerId, amount_cents: amountCents, message: message || undefined });
  if (error) throw error;
}

export async function respondToOffer(offerId: string, action: 'accept' | 'decline' | 'withdraw') {
  const client = requireSupabase();
  const { error } =
    action === 'accept'
      ? await client.rpc('accept_offer', { offer: offerId })
      : action === 'decline'
        ? await client.rpc('decline_offer', { offer: offerId })
        : await client.rpc('withdraw_offer', { offer: offerId });
  if (error) throw error;
}

export type MyOffer = {
  id: string;
  conversationId: string;
  listingId: string;
  listingTitle: string;
  listingImage: string | null;
  productSlug: string | null;
  categorySlug: string;
  role: 'buyer' | 'seller';
  otherName: string;
  amountCents: number;
  status: OfferStatus;
  awaitingMe: boolean;
  mine: boolean;
  expiresAt: string;
  createdAt: string;
};

export async function fetchMyOffers(): Promise<MyOffer[]> {
  const { data, error } = await requireSupabase().rpc('my_offers');
  if (error) throw error;
  return data.map((o) => ({
    id: o.id,
    conversationId: o.conversation_id,
    listingId: o.listing_id,
    listingTitle: o.listing_title,
    listingImage: o.listing_image,
    productSlug: o.product_slug,
    categorySlug: o.category_slug,
    role: o.role as MyOffer['role'],
    otherName: o.other_name,
    amountCents: o.amount_cents,
    status: o.status as OfferStatus,
    awaitingMe: o.awaiting_me,
    mine: o.mine,
    expiresAt: o.expires_at,
    createdAt: o.created_at,
  }));
}

export async function fetchListingActivity(): Promise<Map<string, { chats: number; openOffers: number }>> {
  const { data, error } = await requireSupabase().rpc('my_listing_activity');
  if (error) throw error;
  return new Map(data.map((r) => [r.listing_id, { chats: r.chats, openOffers: r.open_offers }]));
}
