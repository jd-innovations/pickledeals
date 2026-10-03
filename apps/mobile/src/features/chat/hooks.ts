import type { RealtimeChannel } from '@supabase/supabase-js';
import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import * as Crypto from 'expo-crypto';
import { useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';

import { useAuth } from '@/features/auth/authStore';
import { uploadChatPhoto, type PickedPhoto } from '@/features/market/device';
import { requireSupabase } from '@/lib/supabase';

import {
  blockUser,
  chatErrorText,
  counterOffer,
  fetchBlocked,
  fetchListingActivity,
  fetchMyOffers,
  fetchThreadOffers,
  makeOffer,
  respondToOffer,
  fetchInbox,
  fetchMessages,
  fetchMessagesAfter,
  fetchThread,
  fetchUnreadThreads,
  markRead,
  PAGE,
  sendMessage,
  setThreadState,
  toMessage,
  unblockUser,
  type ChatMessage,
  type NewMessage,
  type Thread,
} from './api';

export const chatKeys = {
  root: (uid: string) => ['chat', uid] as const,
  inbox: (uid: string) => ['chat', uid, 'inbox'] as const,
  thread: (uid: string, id: string) => ['chat', uid, 'thread', id] as const,
  messages: (uid: string, id: string) => ['chat', uid, 'messages', id] as const,
  unread: (uid: string) => ['chat', uid, 'unread'] as const,
  blocked: (uid: string) => ['chat', uid, 'blocked'] as const,
  offers: (uid: string, id: string) => ['chat', uid, 'offers', id] as const,
  myOffers: (uid: string) => ['chat', uid, 'my-offers'] as const,
  activity: (uid: string) => ['chat', uid, 'listing-activity'] as const,
};

type MessagesData = { items: ChatMessage[]; hasMore: boolean };

/** Merge by id, replacing optimistic copies by client id. Confirmed rows sort by id; pending ones last. */
export function mergeMessages(current: ChatMessage[], incoming: ChatMessage[]): ChatMessage[] {
  const confirmed = new Map<number, ChatMessage>();
  const pending = new Map<string, ChatMessage>();
  for (const m of [...current, ...incoming]) {
    if (m.status) {
      if (m.clientId) pending.set(m.clientId, m);
    } else {
      confirmed.set(m.id, m);
    }
  }
  for (const m of confirmed.values()) if (m.clientId) pending.delete(m.clientId);
  return [...[...confirmed.values()].sort((a, b) => a.id - b.id), ...pending.values()];
}

const useUid = () => useAuth((s) => s.user?.id ?? '');

export function useInbox() {
  const uid = useUid();
  return useQuery({ queryKey: chatKeys.inbox(uid), queryFn: fetchInbox, enabled: !!uid, staleTime: 30_000 });
}

export function useThread(id: string) {
  const uid = useUid();
  return useQuery({ queryKey: chatKeys.thread(uid, id), queryFn: () => fetchThread(id), enabled: !!uid && !!id, staleTime: 30_000 });
}

/** Threads with unread messages (Profile tab badge and the Messages row). */
export function useUnreadThreads() {
  const uid = useUid();
  return useQuery({ queryKey: chatKeys.unread(uid), queryFn: fetchUnreadThreads, enabled: !!uid, staleTime: 60_000 }).data ?? 0;
}

export function useBlocked() {
  const uid = useUid();
  return useQuery({ queryKey: chatKeys.blocked(uid), queryFn: fetchBlocked, enabled: !!uid });
}

/** The thread's messages, oldest first. The cache also holds optimistic sends and Realtime arrivals. */
export function useMessages(id: string) {
  const uid = useUid();
  const qc = useQueryClient();
  const key = chatKeys.messages(uid, id);
  const query = useQuery({
    queryKey: key,
    queryFn: async (): Promise<MessagesData> => {
      const page = await fetchMessages(id);
      const prev = qc.getQueryData<MessagesData>(key);
      return { items: mergeMessages(prev?.items ?? [], page), hasMore: prev ? prev.hasMore : page.length === PAGE };
    },
    enabled: !!uid && !!id,
    staleTime: Infinity,
    refetchOnWindowFocus: false,
  });
  const [loadingOlder, setLoadingOlder] = useState(false);
  const loadOlder = async () => {
    const data = qc.getQueryData<MessagesData>(key);
    const oldest = data?.items.find((m) => !m.status);
    if (!data?.hasMore || !oldest || loadingOlder) return;
    setLoadingOlder(true);
    try {
      const older = await fetchMessages(id, oldest.id);
      qc.setQueryData<MessagesData>(key, (d) => ({ items: mergeMessages(d?.items ?? [], older), hasMore: older.length === PAGE }));
    } finally {
      setLoadingOlder(false);
    }
  };
  return { ...query, loadOlder, loadingOlder };
}

function appendMessages(qc: QueryClient, uid: string, id: string, incoming: ChatMessage[]) {
  qc.setQueryData<MessagesData>(chatKeys.messages(uid, id), (d) => ({ items: mergeMessages(d?.items ?? [], incoming), hasMore: d?.hasMore ?? false }));
}

let tempId = Number.MAX_SAFE_INTEGER - 1_000_000;

/** Optimistic send (§7): render "sending", the insert's ack is "delivered"; failures can be retried. */
export function useSendMessage(id: string) {
  const uid = useUid();
  const qc = useQueryClient();

  const run = async (clientId: string, m: NewMessage | { kind: 'image'; photo: PickedPhoto }, localUri?: string) => {
    const base: ChatMessage = {
      id: tempId++,
      conversationId: id,
      senderId: uid,
      kind: m.kind,
      body: m.kind === 'text' ? m.body : null,
      imagePath: null,
      offerId: null,
      meta: m.kind === 'location_share' ? { lat: m.lat, lng: m.lng, label: m.label } : m.kind === 'image' && 'photo' in m ? { width: m.photo.width, height: m.photo.height } : {},
      clientId,
      createdAt: new Date().toISOString(),
      status: 'sending',
      localUri,
    };
    appendMessages(qc, uid, id, [base]);
    try {
      let payload: NewMessage;
      if (m.kind === 'image' && 'photo' in m) {
        const up = await uploadChatPhoto(id, m.photo);
        payload = { kind: 'image', imagePath: up.path, width: up.width, height: up.height };
      } else {
        payload = m as NewMessage;
      }
      const saved = await sendMessage(id, clientId, payload);
      appendMessages(qc, uid, id, [saved]);
      qc.invalidateQueries({ queryKey: chatKeys.inbox(uid) });
    } catch (e) {
      appendMessages(qc, uid, id, [{ ...base, status: 'failed', error: chatErrorText(e) }]);
    }
  };

  const retries = useRef(new Map<string, () => void>());
  return {
    send: (m: NewMessage) => {
      const clientId = Crypto.randomUUID();
      retries.current.set(clientId, () => run(clientId, m));
      return run(clientId, m);
    },
    sendPhoto: (photo: PickedPhoto) => {
      const clientId = Crypto.randomUUID();
      retries.current.set(clientId, () => run(clientId, { kind: 'image', photo }, photo.localUri));
      return run(clientId, { kind: 'image', photo }, photo.localUri);
    },
    retry: (clientId: string) => retries.current.get(clientId)?.(),
  };
}

const TYPING_EVERY_MS = 3000;
const TYPING_TTL_MS = 5000;

/**
 * The thread's private Realtime channel (§7): new messages, the other side's read state and typing.
 * Typing is Broadcast only (never stored), throttled to one event per 3 s and shown for 5 s.
 * On (re)subscribe and on foreground, missed messages are backfilled from the table.
 */
export function useConversationChannel(id: string) {
  const uid = useUid();
  const qc = useQueryClient();
  const [typing, setTyping] = useState(false);
  const channel = useRef<RealtimeChannel | null>(null);
  const lastTypingSent = useRef(0);

  useEffect(() => {
    if (!uid || !id) return;
    const client = requireSupabase();
    let cancelled = false;
    let typingTimer: ReturnType<typeof setTimeout> | undefined;

    const backfill = async () => {
      const items = qc.getQueryData<MessagesData>(chatKeys.messages(uid, id))?.items ?? [];
      const newest = items.filter((m) => !m.status).at(-1)?.id ?? 0;
      if (!newest) return;
      const missed = await fetchMessagesAfter(id, newest).catch(() => []);
      if (missed.length) appendMessages(qc, uid, id, missed);
      qc.invalidateQueries({ queryKey: chatKeys.thread(uid, id) });
    };

    (async () => {
      await client.realtime.setAuth();
      if (cancelled) return;
      channel.current = client
        .channel(`conversation:${id}`, { config: { private: true, broadcast: { self: false } } })
        .on('broadcast', { event: 'message' }, ({ payload }) => {
          const m = toMessage(payload as Parameters<typeof toMessage>[0]);
          appendMessages(qc, uid, id, [m]);
          // Status and offer lines change the listing strip and the offer cards.
          if (m.kind === 'status_event' || m.kind === 'offer_event') {
            qc.invalidateQueries({ queryKey: chatKeys.thread(uid, id) });
            qc.invalidateQueries({ queryKey: chatKeys.offers(uid, id) });
          }
          if (m.senderId && m.senderId !== uid) {
            clearTimeout(typingTimer);
            setTyping(false);
          }
        })
        .on('broadcast', { event: 'read' }, ({ payload }) => {
          const p = payload as { user_id: string; last_read_message_id: number; last_read_at: string };
          if (p.user_id === uid) return;
          qc.setQueryData<Thread | null>(chatKeys.thread(uid, id), (t) => (t ? { ...t, otherLastReadMessageId: p.last_read_message_id, otherLastReadAt: p.last_read_at } : t));
        })
        .on('broadcast', { event: 'typing' }, ({ payload }) => {
          if ((payload as { user_id?: string }).user_id === uid) return;
          setTyping(true);
          clearTimeout(typingTimer);
          typingTimer = setTimeout(() => setTyping(false), TYPING_TTL_MS);
        })
        .subscribe((status) => {
          if (status === 'SUBSCRIBED') backfill();
        });
    })();

    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') backfill();
    });
    return () => {
      cancelled = true;
      clearTimeout(typingTimer);
      sub.remove();
      if (channel.current) client.removeChannel(channel.current);
      channel.current = null;
    };
  }, [uid, id, qc]);

  const sendTyping = () => {
    const now = Date.now();
    if (!channel.current || now - lastTypingSent.current < TYPING_EVERY_MS) return;
    lastTypingSent.current = now;
    channel.current.send({ type: 'broadcast', event: 'typing', payload: { user_id: uid } });
  };

  return { typing, sendTyping };
}

/** App-wide: the signed-in user's inbox topic keeps the inbox, badge and open thread headers fresh. */
export function useInboxChannel() {
  const uid = useUid();
  const qc = useQueryClient();
  useEffect(() => {
    if (!uid) return;
    const client = requireSupabase();
    let ch: RealtimeChannel | null = null;
    let cancelled = false;
    (async () => {
      await client.realtime.setAuth();
      if (cancelled) return;
      ch = client
        .channel(`user:${uid}`, { config: { private: true } })
        .on('broadcast', { event: 'inbox' }, ({ payload }) => {
          const conversationId = (payload as { conversation_id?: string }).conversation_id;
          qc.invalidateQueries({ queryKey: chatKeys.inbox(uid) });
          qc.invalidateQueries({ queryKey: chatKeys.unread(uid) });
          if (conversationId) qc.invalidateQueries({ queryKey: chatKeys.thread(uid, conversationId) });
        })
        .subscribe();
    })();
    return () => {
      cancelled = true;
      if (ch) client.removeChannel(ch);
    };
  }, [uid, qc]);
}

/** Marks incoming messages read while the thread is on screen (once per newer incoming message). */
export function useMarkRead(id: string, latestIncomingId: number | null, active: boolean) {
  const uid = useUid();
  const qc = useQueryClient();
  const marked = useRef(0);
  useEffect(() => {
    if (!active || !latestIncomingId || latestIncomingId <= marked.current) return;
    marked.current = latestIncomingId;
    markRead(id, latestIncomingId)
      .then(() => {
        qc.invalidateQueries({ queryKey: chatKeys.unread(uid) });
        qc.invalidateQueries({ queryKey: chatKeys.inbox(uid) });
      })
      .catch(() => {
        marked.current = 0;
      });
  }, [id, latestIncomingId, active, uid, qc]);
}

export function useChatMutations() {
  const uid = useUid();
  const qc = useQueryClient();
  const refresh = () => qc.invalidateQueries({ queryKey: chatKeys.root(uid) });
  return {
    setState: useMutation({ mutationFn: ({ id, ...s }: { id: string; muted?: boolean; archived?: boolean }) => setThreadState(id, s), onSuccess: refresh }),
    block: useMutation({ mutationFn: blockUser, onSuccess: refresh }),
    unblock: useMutation({ mutationFn: unblockUser, onSuccess: refresh }),
  };
}

// --- Offers (Phase 9) ----------------------------------------------------------------------------

export function useThreadOffers(id: string) {
  const uid = useUid();
  return useQuery({ queryKey: chatKeys.offers(uid, id), queryFn: () => fetchThreadOffers(id), enabled: !!uid && !!id, staleTime: 30_000 });
}

export function useMyOffers() {
  const uid = useUid();
  return useQuery({ queryKey: chatKeys.myOffers(uid), queryFn: fetchMyOffers, enabled: !!uid, staleTime: 30_000 });
}

export function useListingActivity() {
  const uid = useUid();
  return useQuery({ queryKey: chatKeys.activity(uid), queryFn: fetchListingActivity, enabled: !!uid, staleTime: 30_000 });
}

/** Offer transitions. Every chat-shaped query refreshes afterwards (offers, thread, inbox, lists). */
export function useOfferActions() {
  const uid = useUid();
  const qc = useQueryClient();
  const refresh = () => Promise.all([qc.invalidateQueries({ queryKey: chatKeys.root(uid) }), qc.invalidateQueries({ queryKey: ['me'] })]);
  return {
    make: useMutation({ mutationFn: (v: { listingId: string; amountCents: number; message?: string }) => makeOffer(v.listingId, v.amountCents, v.message), onSuccess: refresh }),
    counter: useMutation({ mutationFn: (v: { offerId: string; amountCents: number; message?: string }) => counterOffer(v.offerId, v.amountCents, v.message), onSuccess: refresh }),
    respond: useMutation({ mutationFn: (v: { offerId: string; action: 'accept' | 'decline' | 'withdraw' }) => respondToOffer(v.offerId, v.action), onSuccess: refresh }),
  };
}
