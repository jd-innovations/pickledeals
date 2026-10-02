import { formatPrice, radius, type OfferStatus } from '@pickledeals/shared';
import { StyleSheet, View } from 'react-native';

import { useTheme } from '@/design/theme';
import { Button, Icon, Text } from '@/ui';

export type OfferCardData = {
  status: OfferStatus;
  amountCents: number;
  /** Asking price for an opening offer, or the previous amount for a counter. */
  compareCents: number;
  kind: 'offer' | 'counter';
  fromMe: boolean;
  message?: string;
  expiresLabel?: string;
};

const STATUS_LABEL: Record<OfferStatus, string> = {
  pending: 'Pending',
  accepted: 'Accepted',
  declined: 'Declined',
  countered: 'Countered',
  withdrawn: 'Withdrawn',
  expired: 'Expired',
};

/**
 * Offers are structured records rendered inside the chat. Actions only appear for the party who
 * must respond to a pending offer; the RPC layer enforces the same rule server-side.
 */
export function OfferCard({
  offer,
  onAccept,
  onCounter,
  onDecline,
  onWithdraw,
}: {
  offer: OfferCardData;
  onAccept?: () => void;
  onCounter?: () => void;
  onDecline?: () => void;
  onWithdraw?: () => void;
}) {
  const { colors } = useTheme();

  if (offer.status === 'accepted') {
    return (
      <View accessibilityRole="summary" style={[styles.accepted, { backgroundColor: colors.interactive }]}>
        <View style={[styles.check, { backgroundColor: colors.onInteractive }]}>
          <Icon name="check" size={18} color={colors.interactive} weight="bold" />
        </View>
        <Text variant="badge" style={{ color: colors.onInteractive }}>
          OFFER ACCEPTED
        </Text>
        <Text variant="priceLarge" style={{ fontSize: 34, color: colors.onInteractive }} numeric>
          {formatPrice(offer.amountCents)}
        </Text>
        <Text variant="footnote" align="center" style={{ color: colors.onInteractive, opacity: 0.8 }}>
          This isn’t a purchase yet. Agree on payment and pickup or shipping in chat.
        </Text>
      </View>
    );
  }

  const resolved = offer.status !== 'pending';
  const mustRespond = offer.status === 'pending' && !offer.fromMe;
  const title = offer.kind === 'counter' ? 'COUNTEROFFER' : offer.fromMe ? 'YOUR OFFER' : 'OFFER';

  return (
    <View style={[styles.card, { borderColor: colors.border, backgroundColor: colors.background, opacity: resolved ? 0.7 : 1 }]}>
      <View style={styles.head}>
        <Text variant="badge">{title}</Text>
        <Text variant="caption" weight="600" tone="secondary">
          {offer.status === 'pending' && offer.expiresLabel ? offer.expiresLabel : STATUS_LABEL[offer.status]}
        </Text>
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 10 }}>
        <Text variant="title2" numeric strike={offer.status === 'declined' || offer.status === 'withdrawn' || offer.status === 'expired'}>
          {formatPrice(offer.amountCents)}
        </Text>
        <Text variant="footnote" tone="secondary" numeric>
          {offer.kind === 'counter' ? `was ${formatPrice(offer.compareCents)}` : `asking ${formatPrice(offer.compareCents)}`}
        </Text>
      </View>
      {offer.message && (
        <Text variant="footnote" tone="secondary">
          “{offer.message}”
        </Text>
      )}
      {mustRespond && (
        <View style={{ flexDirection: 'row', gap: 6 }}>
          <Button label="Accept" size="sm" onPress={onAccept} style={{ flex: 1, borderRadius: radius.control }} />
          <Button label="Counter" size="sm" variant="secondary" onPress={onCounter} style={{ flex: 1, borderRadius: radius.control }} />
          <Button label="Decline" size="sm" variant="secondary" onPress={onDecline} style={{ flex: 1, borderRadius: radius.control }} />
        </View>
      )}
      {offer.status === 'pending' && offer.fromMe && onWithdraw && <Button label="Withdraw offer" variant="link" size="sm" onPress={onWithdraw} />}
    </View>
  );
}

export function MessageBubble({
  text,
  outgoing,
  receipt,
}: {
  text: string;
  outgoing: boolean;
  receipt?: string;
}) {
  const { colors } = useTheme();
  return (
    <View style={{ alignSelf: outgoing ? 'flex-end' : 'flex-start', maxWidth: '78%', gap: 2 }}>
      <View
        style={[
          styles.bubble,
          outgoing
            ? { backgroundColor: colors.bubbleOutgoing, borderBottomRightRadius: 6 }
            : { backgroundColor: colors.bubbleIncoming, borderBottomLeftRadius: 6 },
        ]}>
        <Text variant="callout" style={{ color: outgoing ? colors.onBubbleOutgoing : colors.textPrimary }}>
          {text}
        </Text>
      </View>
      {receipt && (
        <Text variant="caption" weight="400" tone="tertiary" align={outgoing ? 'right' : 'left'} style={{ fontSize: 11 }}>
          {receipt}
        </Text>
      )}
    </View>
  );
}

export function SystemMessage({ text }: { text: string }) {
  const { colors } = useTheme();
  return (
    <View style={[styles.system, { backgroundColor: colors.surface }]}>
      <Text variant="caption" weight="400" tone="secondary">
        {text}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { width: 270, borderWidth: 1, borderRadius: 18, padding: 14, gap: 8 },
  head: { flexDirection: 'row', justifyContent: 'space-between' },
  accepted: { borderRadius: 22, padding: 16, alignItems: 'center', gap: 6 },
  check: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  bubble: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 18 },
  system: { alignSelf: 'center', paddingHorizontal: 12, paddingVertical: 5, borderRadius: 12 },
});
