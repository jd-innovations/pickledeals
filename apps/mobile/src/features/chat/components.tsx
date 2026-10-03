import { formatPrice, formatThreadTime } from '@pickledeals/shared';
import { useQuery } from '@tanstack/react-query';
import { Image } from 'expo-image';
import { Linking, Pressable, View } from 'react-native';

import { MessageBubble, ProductImage, SystemMessage } from '@/commerce';
import { useTheme } from '@/design/theme';
import { SpotMap } from '@/features/map';
import { listingImage } from '@/features/market/hooks';
import { confirm } from '@/lib/dialog';
import { Group, Icon, ListRow, Text } from '@/ui';

import { chatImageUrl, type ChatMessage, type Thread } from './api';
import { useBlocked, useChatMutations } from './hooks';

export const threadImage = (t: Pick<Thread, 'listingId' | 'listingImage' | 'listingTitle' | 'productSlug' | 'categorySlug'>) =>
  listingImage({ id: t.listingId, imagePath: t.listingImage, title: t.listingTitle, productSlug: t.productSlug, categorySlug: t.categorySlug });

const initial = (name: string) => name.trim().charAt(0).toUpperCase() || '?';

export function Avatar({ name, size = 34 }: { name: string; size?: number }) {
  const { colors } = useTheme();
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: colors.surfacePressed, alignItems: 'center', justifyContent: 'center' }}>
      <Text variant={size > 30 ? 'subhead' : 'caption'} weight="700" style={size <= 30 ? { fontSize: 11 } : undefined}>
        {initial(name)}
      </Text>
    </View>
  );
}

const STATUS_TAG: Partial<Record<Thread['listingStatus'], string>> = { pending: 'PENDING', sold: 'SOLD', removed: 'REMOVED' };

/** Inbox row (design: Inbox). Unread threads are bold with a dot. */
export function ThreadRow({ t, onPress, onLongPress }: { t: Thread; onPress: () => void; onLongPress?: () => void }) {
  const { colors } = useTheme();
  const unread = t.unread > 0;
  const tag = STATUS_TAG[t.listingStatus];
  const last = t.lastMessageMine && t.lastMessagePreview ? `You: ${t.lastMessagePreview}` : (t.lastMessagePreview ?? '');
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${t.otherName}, ${t.role === 'buyer' ? 'buying' : 'selling'} ${t.listingTitle}. ${unread ? `${t.unread} unread. ` : ''}${last}`}
      onPress={onPress}
      onLongPress={onLongPress}
      style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 12, backgroundColor: pressed ? colors.surface : colors.background })}>
      <View style={{ width: 56, height: 56 }}>
        <ProductImage source={threadImage(t)} width={56} round={14} padding={5} />
        <View style={{ position: 'absolute', right: -4, bottom: -4, borderRadius: 15, borderWidth: 2, borderColor: colors.background }}>
          <Avatar name={t.otherName} size={26} />
        </View>
      </View>
      <View style={{ flex: 1, gap: 2, minWidth: 0 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
          <Text variant="subhead" weight={unread ? '700' : '500'} numberOfLines={1} style={{ flexShrink: 1 }}>
            {t.otherName}
          </Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            {t.muted && <Icon name="bellSlash" size={12} color={colors.textTertiary} />}
            {t.lastMessageAt && (
              <Text variant="caption" weight="400" tone="tertiary" numeric>
                {formatThreadTime(t.lastMessageAt)}
              </Text>
            )}
          </View>
        </View>
        <Text variant="footnote" tone="secondary" numberOfLines={1}>
          {t.role === 'buyer' ? 'Buying' : 'Selling'} · {t.listingTitle}
        </Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          {tag && (
            <View style={{ paddingHorizontal: 6, paddingVertical: 2, borderRadius: 5, backgroundColor: t.listingStatus === 'pending' ? colors.chip : colors.interactive }}>
              <Text variant="badge" style={{ fontSize: 10, color: t.listingStatus === 'pending' ? colors.textPrimary : colors.onInteractive }}>
                {tag}
              </Text>
            </View>
          )}
          <Text variant="subhead" weight={unread ? '700' : '500'} numberOfLines={1} style={{ flex: 1, color: unread ? colors.textPrimary : colors.textSecondary }}>
            {last}
          </Text>
          {unread && <View accessibilityElementsHidden style={{ width: 9, height: 9, borderRadius: 5, backgroundColor: colors.textPrimary }} />}
        </View>
      </View>
    </Pressable>
  );
}

/** Thread header's listing strip (design: Conversation). */
export function ListingStrip({ t, onView }: { t: Thread; onView: () => void }) {
  const { colors } = useTheme();
  const status = t.listingStatus === 'active' ? null : t.listingStatus === 'pending' ? 'Pending' : t.listingStatus === 'sold' ? 'Sold' : 'Removed';
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8, paddingHorizontal: 10, borderRadius: 16, backgroundColor: colors.surfaceElevated, borderWidth: 0.5, borderColor: colors.border }}>
      <ProductImage source={threadImage(t)} width={40} round={10} padding={3} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text variant="footnote" weight="600" numberOfLines={1}>
          {t.listingTitle}
        </Text>
        <Text variant="caption" weight="400" tone="secondary" numeric>
          Asking {formatPrice(t.listingPriceCents)}
          {status && (
            <Text variant="caption" weight="700">
              {' · '}
              {status}
            </Text>
          )}
        </Text>
      </View>
      <Pressable accessibilityRole="button" onPress={onView} style={({ pressed }) => ({ height: 30, paddingHorizontal: 12, borderRadius: 15, backgroundColor: colors.chip, justifyContent: 'center', opacity: pressed ? 0.75 : 1 })}>
        <Text variant="caption" weight="700">
          View listing
        </Text>
      </Pressable>
    </View>
  );
}

function ChatPhoto({ m, outgoing }: { m: ChatMessage; outgoing: boolean }) {
  const { colors } = useTheme();
  const url = useQuery({ queryKey: ['chat-image', m.imagePath], queryFn: () => chatImageUrl(m.imagePath!), enabled: !!m.imagePath, staleTime: 50 * 60_000 });
  const w = Number(m.meta.width) || 4;
  const h = Number(m.meta.height) || 3;
  const width = 220;
  const height = Math.min(Math.max((width * h) / w, 140), 300);
  const uri = m.localUri ?? url.data;
  return (
    <View accessible accessibilityRole="image" accessibilityLabel={outgoing ? 'Photo you sent' : 'Photo'} style={{ alignSelf: outgoing ? 'flex-end' : 'flex-start', width, height, borderRadius: 18, overflow: 'hidden', backgroundColor: colors.imageTile, opacity: m.status === 'sending' ? 0.6 : 1 }}>
      {uri && <Image source={{ uri }} contentFit="cover" style={{ flex: 1 }} transition={150} />}
    </View>
  );
}

function SpotMessage({ m, outgoing }: { m: ChatMessage; outgoing: boolean }) {
  const { colors } = useTheme();
  const lat = Number(m.meta.lat);
  const lng = Number(m.meta.lng);
  const label = typeof m.meta.label === 'string' && m.meta.label ? m.meta.label : null;
  const open = () => Linking.openURL(`https://maps.apple.com/?ll=${lat},${lng}&q=${encodeURIComponent(label ?? 'Meet-up spot')}`);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Meet-up spot${label ? `: ${label}` : ''}. Opens in Maps`}
      onPress={open}
      style={{ alignSelf: outgoing ? 'flex-end' : 'flex-start', width: 250, borderRadius: 18, overflow: 'hidden', backgroundColor: outgoing ? colors.bubbleOutgoing : colors.bubbleIncoming, opacity: m.status === 'sending' ? 0.6 : 1 }}>
      <SpotMap point={{ lat, lng }} height={96} />
      <View style={{ paddingHorizontal: 12, paddingVertical: 8 }}>
        <Text variant="subhead" weight="600" style={{ color: outgoing ? colors.onBubbleOutgoing : colors.textPrimary }} numberOfLines={2}>
          {label ?? 'Meet-up spot'} · shared privately
        </Text>
        <Text variant="caption" weight="400" style={{ color: outgoing ? colors.onBubbleOutgoing : colors.textSecondary, opacity: outgoing ? 0.75 : 1 }}>
          Only visible in this chat
        </Text>
      </View>
    </Pressable>
  );
}

/** One message (any kind). `receipt` is shown under the newest outgoing message only. */
export function MessageItem({ m, mine, receipt, onRetry }: { m: ChatMessage; mine: boolean; receipt?: string; onRetry?: () => void }) {
  const { colors } = useTheme();
  if (m.kind === 'status_event' || m.kind === 'offer_event') {
    return (
      <View style={{ paddingVertical: 6 }}>
        <SystemMessage text={m.body ?? ''} />
      </View>
    );
  }
  const failed = m.status === 'failed';
  const footer = failed ? `${m.error ?? 'Not delivered'} · Tap to retry` : m.status === 'sending' ? 'Sending…' : receipt;
  return (
    <Pressable disabled={!failed} onPress={onRetry} accessibilityRole={failed ? 'button' : undefined} style={{ gap: 2 }}>
      {m.kind === 'text' ? (
        <View style={{ opacity: m.status === 'sending' ? 0.75 : 1 }}>
          <MessageBubble text={m.body ?? ''} outgoing={mine} />
        </View>
      ) : m.kind === 'image' ? (
        <ChatPhoto m={m} outgoing={mine} />
      ) : (
        <SpotMessage m={m} outgoing={mine} />
      )}
      {footer && (
        <Text variant="caption" weight="400" align={mine ? 'right' : 'left'} style={{ fontSize: 11, paddingHorizontal: 4, color: failed ? colors.textPrimary : colors.textTertiary }}>
          {footer}
        </Text>
      )}
    </Pressable>
  );
}

export function TypingBubble({ name }: { name: string }) {
  const { colors } = useTheme();
  return (
    <View accessibilityLabel={`${name} is typing`} accessibilityLiveRegion="polite" style={{ alignSelf: 'flex-start', flexDirection: 'row', gap: 4, paddingVertical: 12, paddingHorizontal: 14, borderRadius: 18, backgroundColor: colors.bubbleIncoming, marginTop: 6 }}>
      {[1, 0.7, 0.4].map((o) => (
        <View key={o} style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: colors.textTertiary, opacity: o }} />
      ))}
    </View>
  );
}

export function DateSeparator({ label }: { label: string }) {
  return (
    <Text variant="caption" weight="600" tone="tertiary" align="center" style={{ fontSize: 11, paddingVertical: 8 }} numeric>
      {label}
    </Text>
  );
}

/** Account → Blocked people, with unblock. */
export function BlockedPeople() {
  const blocked = useBlocked();
  const { unblock } = useChatMutations();
  if (!blocked.data?.length) return null;
  return (
    <Group label="Blocked people">
      {blocked.data.map((p, i) => (
        <ListRow
          key={p.id}
          title={p.name}
          value="Unblock"
          last={i === blocked.data.length - 1}
          onPress={async () => {
            if (await confirm(`Unblock ${p.name}?`, 'You’ll be able to message each other again.', 'Unblock')) unblock.mutate(p.id);
          }}
        />
      ))}
    </Group>
  );
}
