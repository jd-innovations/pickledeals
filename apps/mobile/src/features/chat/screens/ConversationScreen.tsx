import { formatChatSeparator, formatReadReceipt } from '@pickledeals/shared';
import { router, useIsFocused, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Alert, FlatList, KeyboardAvoidingView, Platform, Pressable, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTheme } from '@/design/theme';
import { useAuth } from '@/features/auth/authStore';
import { pickPhotos } from '@/features/market/device';
import { chooseAction, confirm } from '@/lib/dialog';
import { EmptyState, ErrorState, Icon, IconButton, Text } from '@/ui';

import { chatErrorText, type ChatMessage, type Offer } from '../api';
import { Avatar, DateSeparator, ListingStrip, MessageItem, OfferEventItem, TypingBubble } from '../components';
import { useChatMutations, useConversationChannel, useMarkRead, useMessages, useOfferActions, useSendMessage, useThread, useThreadOffers, useViewingHeartbeat } from '../hooks';
import { afterAccept } from './offerFlow';

type Row = { key: string; m?: ChatMessage; separator?: string; receipt?: string };

const GAP_MS = 60 * 60_000;

/** Conversation (designs: Conversation, DarkConversation). Offers arrive in Phase 9. */
export default function ConversationScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const uid = useAuth((s) => s.user?.id);
  const focused = useIsFocused();
  const thread = useThread(id);
  const messages = useMessages(id);
  const { send, sendPhoto, retry } = useSendMessage(id);
  const { typing, sendTyping } = useConversationChannel(id);
  const { setState, block } = useChatMutations();
  const offers = useThreadOffers(id);
  const { respond } = useOfferActions();
  const [text, setText] = useState('');

  const t = thread.data;
  const items = messages.data?.items ?? [];
  const latestIncoming = [...items].reverse().find((m) => !m.status && m.senderId && m.senderId !== uid)?.id ?? null;
  useMarkRead(id, latestIncoming, focused);
  useViewingHeartbeat(id, focused);

  // Newest first for the inverted list; separators when the day changes or after an hour's gap.
  const lastMine = [...items].reverse().find((m) => m.senderId === uid && m.kind !== 'status_event' && m.kind !== 'offer_event');
  const offerById = new Map((offers.data ?? []).map((o) => [o.id, o]));
  const openOffer = (offers.data ?? []).find((o) => o.status === 'pending');
  const canOffer = !!t && t.role === 'buyer' && t.acceptsOffers && t.listingStatus === 'active' && !openOffer && !!t.otherId;

  const offerAction = async (o: Offer, action: 'accept' | 'decline' | 'withdraw') => {
    if (action !== 'accept') {
      const verb = action === 'decline' ? 'Decline' : 'Withdraw';
      if (!(await confirm(`${verb} this offer?`, action === 'decline' ? 'You can keep chatting, and they can make a new offer.' : 'You can make a new offer later.', verb, true))) return;
    }
    respond.mutate(
      { offerId: o.id, action },
      {
        onSuccess: () => action === 'accept' && t?.role === 'seller' && afterAccept(t.listingId),
        onError: (e) => Alert.alert('Couldn’t update the offer', chatErrorText(e)),
      },
    );
  };
  const openCounter = (o: Offer) => router.push({ pathname: '/counter-offer', params: { offer: o.id, conversation: id } });
  const openMeetup = () => router.push({ pathname: '/meetup', params: { conversation: id, listing: t?.listingId ?? '' } });
  const prefillShipping = () =>
    setText(t?.role === 'buyer' ? 'Could you ship it? My ZIP code is ' : 'Happy to ship it. What’s your ZIP code so I can work out postage?');
  const rows: Row[] = [];
  items.forEach((m, i) => {
    const prev = items[i - 1];
    if (!prev || new Date(m.createdAt).getTime() - new Date(prev.createdAt).getTime() > GAP_MS || new Date(m.createdAt).toDateString() !== new Date(prev.createdAt).toDateString()) {
      rows.push({ key: `sep-${m.clientId ?? m.id}`, separator: formatChatSeparator(m.createdAt) });
    }
    const receipt =
      m === lastMine && !m.status && t
        ? t.otherLastReadMessageId >= m.id && t.otherLastReadAt
          ? formatReadReceipt(t.otherLastReadAt)
          : 'Delivered'
        : undefined;
    rows.push({ key: m.clientId ?? String(m.id), m, receipt });
  });
  rows.reverse();

  const blockedOrGone = t && (!t.otherId || t.listingStatus === 'removed');
  const submit = () => {
    const body = text.trim();
    if (!body) return;
    setText('');
    send({ kind: 'text', body });
  };

  const addAttachment = () =>
    chooseAction('Share', [
      { text: 'Photo library', onPress: () => pickPhotos('library', 1).then(([p]) => p && sendPhoto(p)) },
      { text: 'Take photo', onPress: () => pickPhotos('camera', 1).then(([p]) => p && sendPhoto(p)) },
      { text: 'Suggest meet-up spot', onPress: openMeetup },
      ...(canOffer ? [{ text: 'Make an offer', onPress: () => router.push({ pathname: '/make-offer', params: { listing: t!.listingId, from: 'chat' } }) }] : []),
    ]);

  const options = () => {
    if (!t) return;
    chooseAction(t.otherName, [
      { text: 'View listing', onPress: () => router.push({ pathname: '/listing/[id]', params: { id: t.listingId } }) },
      ...(t.otherId ? [{ text: 'View profile', onPress: () => router.push({ pathname: '/seller/[id]', params: { id: t.otherId! } }) }] : []),
      { text: t.muted ? 'Unmute' : 'Mute notifications', onPress: () => setState.mutate({ id, muted: !t.muted }) },
      { text: t.archived ? 'Move to inbox' : 'Archive', onPress: () => setState.mutate({ id, archived: !t.archived }, { onSuccess: () => !t.archived && router.back() }) },
      { text: 'Report conversation', onPress: () => router.push({ pathname: '/report', params: { type: 'conversation', id, name: t.otherName } }) },
      ...(t.otherId
        ? [
            {
              text: `Block ${t.otherName}`,
              destructive: true,
              onPress: async () => {
                if (await confirm(`Block ${t.otherName}?`, 'You won’t see each other’s messages, and they can’t contact you. You can unblock them later from Account.', 'Block', true)) {
                  block.mutate(t.otherId!, { onSuccess: () => router.back() });
                }
              },
            },
          ]
        : []),
    ]);
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.background }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      {/* Header (glass): back · avatar + name · options, then the listing strip. */}
      <View style={{ paddingTop: insets.top + 4, paddingHorizontal: 12, paddingBottom: 10, gap: 10, backgroundColor: colors.glass, borderBottomWidth: 0.5, borderBottomColor: colors.border, zIndex: 2 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <IconButton icon="chevronLeft" label="Back" size={40} tone="glass" onPress={() => (router.canGoBack() ? router.back() : router.replace('/profile/messages'))} />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t ? `${t.otherName}. View profile` : 'Conversation'}
            disabled={!t?.otherId}
            onPress={() => t?.otherId && router.push({ pathname: '/seller/[id]', params: { id: t.otherId } })}
            style={{ flex: 1, alignItems: 'center', gap: 2 }}>
            <Avatar name={t?.otherName ?? ' '} />
            <Text variant="caption" weight="600" numberOfLines={1}>
              {t ? `${t.otherName}${t.otherId ? ' ›' : ''}` : ' '}
            </Text>
          </Pressable>
          <IconButton icon="more" label="Conversation options" size={40} tone="glass" onPress={options} />
        </View>
        {t && <ListingStrip t={t} onView={() => router.push({ pathname: '/listing/[id]', params: { id: t.listingId } })} />}
      </View>

      {thread.isError || messages.isError ? (
        <ErrorState title="Couldn’t load this conversation" message="Check your connection and try again." onRetry={() => (thread.refetch(), messages.refetch())} />
      ) : thread.isSuccess && !t ? (
        <EmptyState icon="message" title="Conversation not available" message="It may have been removed, or you’ve blocked this person." />
      ) : (
        <FlatList
          inverted
          data={rows}
          keyExtractor={(r) => r.key}
          contentContainerStyle={{ paddingHorizontal: 12, paddingVertical: 12, gap: 4 }}
          keyboardDismissMode="interactive"
          keyboardShouldPersistTaps="handled"
          onEndReached={() => messages.loadOlder()}
          onEndReachedThreshold={0.3}
          ListHeaderComponent={typing && t ? <TypingBubble name={t.otherName.split(' ')[0]!} /> : null}
          ListFooterComponent={
            messages.loadingOlder || messages.isPending ? (
              <ActivityIndicator style={{ paddingVertical: 12 }} color={colors.textSecondary} />
            ) : !items.length ? (
              <Text variant="footnote" tone="secondary" align="center" style={{ paddingVertical: 24, paddingHorizontal: 24 }}>
                Say hi and ask anything about the item. Keep payment and pickup details in this chat.
              </Text>
            ) : null
          }
          renderItem={({ item: r }) =>
            r.separator ? (
              <DateSeparator label={r.separator} />
            ) : r.m!.kind === 'offer_event' ? (
              <OfferEventItem
                m={r.m!}
                offer={r.m!.offerId ? offerById.get(r.m!.offerId) : undefined}
                thread={t ?? undefined}
                uid={uid}
                onAccept={(o) => offerAction(o, 'accept')}
                onCounter={openCounter}
                onDecline={(o) => offerAction(o, 'decline')}
                onWithdraw={(o) => offerAction(o, 'withdraw')}
                onMeetup={openMeetup}
                onShipping={prefillShipping}
              />
            ) : (
              <MessageItem m={r.m!} mine={r.m!.senderId === uid} receipt={r.receipt} onRetry={() => r.m!.clientId && retry(r.m!.clientId)} />
            )
          }
        />
      )}

      {/* Composer (glass) with the safety line from the design. */}
      <View style={{ paddingTop: 8, paddingHorizontal: 12, paddingBottom: Math.max(insets.bottom, 12), gap: 8, backgroundColor: colors.glass, borderTopWidth: 0.5, borderTopColor: colors.border }}>
        <Text variant="caption" weight="400" tone="secondary" align="center">
          {blockedOrGone ? (t?.otherId ? 'This listing was removed.' : 'This person deleted their account.') : 'Meet somewhere public. Don’t pay before you’ve seen the item.'}
        </Text>
        <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 8, opacity: t?.otherId ? 1 : 0.4 }} pointerEvents={t?.otherId ? 'auto' : 'none'}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={canOffer ? 'Add photo, meet-up spot or offer' : 'Add photo or meet-up spot'}
            onPress={addAttachment}
            style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: colors.chip, alignItems: 'center', justifyContent: 'center', marginBottom: 1 }}>
            <Icon name="plus" size={18} color={colors.textPrimary} weight="semibold" />
          </Pressable>
          <View style={{ flex: 1, minHeight: 38, maxHeight: 120, borderRadius: 19, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.background, flexDirection: 'row', alignItems: 'flex-end', paddingLeft: 14, paddingRight: 5, paddingVertical: 4 }}>
            <TextInput
              accessibilityLabel="Message"
              placeholder="Message"
              placeholderTextColor={colors.textTertiary}
              value={text}
              onChangeText={(v) => {
                setText(v);
                if (v.trim()) sendTyping();
              }}
              multiline
              maxLength={2000}
              onSubmitEditing={submit}
              submitBehavior={Platform.OS === 'web' ? 'submit' : 'newline'}
              style={{ flex: 1, fontSize: 16, lineHeight: 21, color: colors.textPrimary, paddingVertical: 4, maxHeight: 110 }}
            />
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Send"
              disabled={!text.trim()}
              onPress={submit}
              style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: colors.interactive, alignItems: 'center', justifyContent: 'center', opacity: text.trim() ? 1 : 0.35, marginBottom: 1 }}>
              <Icon name="send" size={14} color={colors.onInteractive} weight="bold" />
            </Pressable>
          </View>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}
