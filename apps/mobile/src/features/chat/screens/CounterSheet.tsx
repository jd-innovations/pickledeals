import { dollarsToCents, formatPrice } from '@pickledeals/shared';
import * as Haptics from 'expo-haptics';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, TextInput, View } from 'react-native';

import { useTheme } from '@/design/theme';
import { usePriceGuide } from '@/features/market/hooks';
import { Button, Skeleton, Text } from '@/ui';

import { chatErrorText } from '../api';
import { useOfferActions, useThread, useThreadOffers } from '../hooks';
import { afterAccept } from './offerFlow';

const STEP = 500;

/** Respond to an offer (design: Counter): counter with a ±$5 stepper, or accept / decline. */
export default function CounterSheet() {
  const { offer: offerId = '', conversation = '' } = useLocalSearchParams<{ offer: string; conversation: string }>();
  const { colors } = useTheme();
  const thread = useThread(conversation).data;
  const offers = useThreadOffers(conversation).data;
  const offer = offers?.find((o) => o.id === offerId);
  const guide = usePriceGuide(thread?.variantId);
  const { counter, respond } = useOfferActions();
  const [amount, setAmount] = useState<number | null>(null);
  const [typing, setTyping] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const [error, setError] = useState<string | null>(null);

  if (!thread || !offer) {
    return (
      <View style={{ padding: 20, gap: 12 }}>
        <Skeleton height={72} />
        <Skeleton height={120} />
      </View>
    );
  }

  const asking = thread.listingPriceCents;
  const seller = thread.role === 'seller';
  // Start halfway between their number and ours: the asking price for sellers, the buyer's last offer otherwise.
  const ours = seller ? asking : (offers?.find((o) => o.id === offer.parentOfferId)?.amountCents ?? offer.amountCents - 2 * STEP);
  const start = Math.round((offer.amountCents + ours) / 2 / STEP) * STEP;
  const value = amount ?? (start === offer.amountCents ? offer.amountCents + (seller ? STEP : -STEP) : start);
  const pending = offer.status === 'pending' && offer.proposedBy !== null;
  const other = thread.otherName.split(' ')[0];

  const done = () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    if (router.canGoBack()) router.back();
    else router.replace({ pathname: '/conversation/[id]', params: { id: conversation } });
  };
  const sendCounter = () =>
    counter.mutate({ offerId, amountCents: value, message: message.trim() || undefined }, { onSuccess: done, onError: (e) => setError(chatErrorText(e)) });
  const act = (action: 'accept' | 'decline') =>
    respond.mutate(
      { offerId, action },
      {
        onSuccess: () => {
          done();
          if (action === 'accept' && seller) afterAccept(thread.listingId);
        },
        onError: (e) => setError(chatErrorText(e)),
      },
    );

  const context = [
    thread.listingTitle,
    guide.data?.usedP25 && guide.data.usedP75 ? `typical used ${formatPrice(guide.data.usedP25)}–${formatPrice(guide.data.usedP75)}` : null,
    guide.data?.bestNewCents ? `new from ${formatPrice(guide.data.bestNewCents)}` : null,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <ScrollView style={{ backgroundColor: colors.surfaceElevated }} contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 12, paddingBottom: 34, gap: 14 }} keyboardShouldPersistTaps="handled">
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Pressable accessibilityRole="button" onPress={() => router.back()} hitSlop={10}>
          <Text variant="body" tone="secondary">
            Cancel
          </Text>
        </Pressable>
        <Text variant="headline" weight="700">
          Counteroffer
        </Text>
        <View style={{ width: 52 }} />
      </View>

      <View style={{ flexDirection: 'row', borderRadius: 16, backgroundColor: colors.surface }}>
        <View style={{ flex: 1, paddingVertical: 12, paddingHorizontal: 14 }}>
          <Text variant="caption" weight="400" tone="secondary">
            {other} {offer.parentOfferId ? 'countered' : 'offered'}
          </Text>
          <Text variant="title2" weight="700" numeric>
            {formatPrice(offer.amountCents)}
          </Text>
        </View>
        <View style={{ flex: 1, paddingVertical: 12, paddingHorizontal: 14, borderLeftWidth: 1, borderLeftColor: colors.background }}>
          <Text variant="caption" weight="400" tone="secondary">
            {seller ? 'You’re asking' : 'Asking'}
          </Text>
          <Text variant="title2" weight="700" numeric>
            {formatPrice(asking)}
          </Text>
        </View>
      </View>

      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: 4 }}>
        <Stepper label="Decrease by $5" sign="−" onPress={() => setAmount(Math.max(100, value - STEP))} />
        <View style={{ alignItems: 'center' }}>
          <Text variant="footnote" weight="600" tone="secondary">
            Your counter
          </Text>
          {typing != null ? (
            <TextInput
              accessibilityLabel="Your counter in dollars"
              autoFocus
              keyboardType="number-pad"
              value={typing}
              onChangeText={(t) => setTyping(t.replace(/[^0-9]/g, '').slice(0, 5))}
              onBlur={() => {
                const c = dollarsToCents(typing);
                if (c && c >= 100) setAmount(c);
                setTyping(null);
              }}
              style={{ fontSize: 56, fontWeight: '700', color: colors.textPrimary, textAlign: 'center', minWidth: 160, fontVariant: ['tabular-nums'] }}
            />
          ) : (
            <Pressable accessibilityRole="button" accessibilityLabel={`Your counter ${formatPrice(value)}. Tap to type an amount`} onPress={() => setTyping(String(Math.round(value / 100)))}>
              <Text numeric style={{ fontSize: 56, lineHeight: 60, fontWeight: '700', letterSpacing: -2.2, color: colors.textPrimary }}>
                {formatPrice(value)}
              </Text>
            </Pressable>
          )}
        </View>
        <Stepper label="Increase by $5" sign="+" onPress={() => setAmount(value + STEP)} />
      </View>

      {context ? (
        <Text variant="footnote" tone="secondary" align="center" numeric>
          {context}
        </Text>
      ) : null}

      <View style={{ gap: 4, paddingVertical: 10, paddingHorizontal: 14, borderRadius: 14, backgroundColor: colors.surface }}>
        <Text variant="caption" weight="600" tone="secondary">
          Message (optional)
        </Text>
        <TextInput
          accessibilityLabel="Message (optional)"
          value={message}
          onChangeText={setMessage}
          maxLength={280}
          placeholder="Lowest I can do is 140 — it’s like new."
          placeholderTextColor={colors.textTertiary}
          style={{ fontSize: 15, color: colors.textPrimary, padding: 0 }}
        />
      </View>

      {error && (
        <Text variant="footnote" weight="600" align="center" accessibilityLiveRegion="assertive">
          {error}
        </Text>
      )}
      {!pending && (
        <Text variant="footnote" tone="secondary" align="center">
          This offer is no longer open.
        </Text>
      )}
      <Button label={`Send counter · ${formatPrice(value)}`} disabled={!pending || value === offer.amountCents} loading={counter.isPending} onPress={sendCounter} />
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <Button label={`Accept ${formatPrice(offer.amountCents)}`} variant="secondary" disabled={!pending} loading={respond.isPending && respond.variables?.action === 'accept'} onPress={() => act('accept')} style={{ flex: 1 }} />
        <Button label="Decline" variant="outline" disabled={!pending} loading={respond.isPending && respond.variables?.action === 'decline'} onPress={() => act('decline')} style={{ flex: 1 }} />
      </View>
    </ScrollView>
  );
}

function Stepper({ label, sign, onPress }: { label: string; sign: string; onPress: () => void }) {
  const { colors } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={() => {
        Haptics.selectionAsync().catch(() => {});
        onPress();
      }}
      style={({ pressed }) => ({ width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center', backgroundColor: pressed ? colors.surfacePressed : colors.chip })}>
      <Text style={{ fontSize: 26, color: colors.textPrimary }}>{sign}</Text>
    </Pressable>
  );
}
