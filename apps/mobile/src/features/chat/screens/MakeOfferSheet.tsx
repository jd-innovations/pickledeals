import { formatPrice, radius } from '@pickledeals/shared';
import * as Haptics from 'expo-haptics';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ProductImage } from '@/commerce';
import { productArt } from '@/commerce/catalogArt';
import { useTheme } from '@/design/theme';
import { listingImageUrl } from '@/features/market/api';
import { conditionLabel } from '@/features/market/components';
import { useListing } from '@/features/market/hooks';
import { Button, Skeleton, Text } from '@/ui';

import { chatErrorText } from '../api';
import { useOfferActions } from '../hooks';

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', '⌫'] as const;
const roundTo5 = (dollars: number) => Math.max(1, Math.round(dollars / 5) * 5);

/** Make an offer (design: MakeOffer). Whole dollars on a keypad; money stays integer cents. */
export default function MakeOfferSheet() {
  const { listing = '', from } = useLocalSearchParams<{ listing: string; from?: 'chat' }>();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { data: l } = useListing(listing);
  const { make } = useOfferActions();
  const [amount, setAmount] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const [error, setError] = useState<string | null>(null);

  if (!l) {
    return (
      <View style={{ padding: 20, gap: 12 }}>
        <Skeleton height={64} />
        <Skeleton height={120} />
      </View>
    );
  }

  const asking = l.priceCents / 100;
  const presets = [0.9, 0.83, 0.8].map((f) => roundTo5(asking * f)).filter((v, i, a) => a.indexOf(v) === i && v < asking);
  const value = amount ?? String(presets[1] ?? Math.floor(asking));
  const dollars = parseInt(value || '0', 10);
  const cents = dollars * 100;
  const pct = Math.round((1 - cents / l.priceCents) * 100);
  const underNew = l.bestNewCents != null && l.bestNewCents > cents ? ` · ${formatPrice(l.bestNewCents - cents)} under best new` : '';
  const delta = cents >= l.priceCents ? 'At or above the asking price' : `${pct}% under asking${underNew}`;

  const press = (k: (typeof KEYS)[number]) => {
    setError(null);
    if (k === '') return;
    Haptics.selectionAsync().catch(() => {});
    // Functional updates: fast taps can land before a re-render.
    setAmount((prev) => {
      const v = prev ?? value;
      if (k === '⌫') return v.slice(0, -1);
      return v.length < 5 ? (v === '0' ? '' : v) + k : v;
    });
  };

  const send = () => {
    setError(null);
    make.mutate(
      { listingId: l.id, amountCents: cents, message: message.trim() || undefined },
      {
        onSuccess: (r) => {
          if (r.status === 'declined') {
            setError('The seller isn’t taking offers at this price. Try a higher amount.');
            return;
          }
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
          if (from === 'chat' && router.canGoBack()) router.back();
          else router.replace({ pathname: '/conversation/[id]', params: { id: r.conversationId } });
        },
        onError: (e) => setError(chatErrorText(e)),
      },
    );
  };

  const image = l.images[0] ? { kind: 'remote' as const, uri: listingImageUrl(l.images[0].path), isCutout: false, alt: l.title } : productArt(l.product?.slug ?? l.id, l.category.slug, l.title);
  const title = [l.product?.brand ?? l.customBrand, l.title, l.variant?.label].filter(Boolean).join(' ');

  return (
    <View style={{ flex: 1, backgroundColor: colors.surfaceElevated }}>
      <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 12, gap: 12 }} keyboardShouldPersistTaps="handled">
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <Pressable accessibilityRole="button" onPress={() => router.back()} hitSlop={10}>
            <Text variant="body" tone="secondary">
              Cancel
            </Text>
          </Pressable>
          <Text variant="headline" weight="700">
            Make an offer
          </Text>
          <View style={{ width: 52 }} />
        </View>

        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 10, borderRadius: 16, backgroundColor: colors.surface }}>
          <ProductImage source={image} width={44} round={10} padding={3} />
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text variant="subhead" weight="600" numberOfLines={1}>
              {title}
            </Text>
            <Text variant="caption" weight="400" tone="secondary" numberOfLines={1}>
              {conditionLabel(l.condition)} · {l.seller.name}
              {l.areaLabel ? ` · ${l.areaLabel}` : ''}
            </Text>
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            <Text variant="caption" weight="400" tone="secondary" style={{ fontSize: 11 }}>
              Asking
            </Text>
            <Text variant="headline" weight="700" numeric>
              {formatPrice(l.priceCents)}
            </Text>
          </View>
        </View>

        <View style={{ alignItems: 'center', gap: 2, paddingTop: 6 }} accessible accessibilityLabel={`Your offer ${formatPrice(cents)}. ${delta}`} accessibilityLiveRegion="polite">
          <Text variant="footnote" weight="600" tone="secondary">
            Your offer
          </Text>
          <Text numeric style={{ fontSize: 60, lineHeight: 64, fontWeight: '700', letterSpacing: -2.7, color: colors.textPrimary }}>
            ${value || '0'}
          </Text>
          <Text variant="footnote" tone="secondary" numeric>
            {delta}
          </Text>
        </View>

        <View style={{ flexDirection: 'row', gap: 8, justifyContent: 'center' }}>
          {presets.map((p) => {
            const on = dollars === p;
            return (
              <Pressable
                key={p}
                accessibilityRole="button"
                accessibilityState={{ selected: on }}
                onPress={() => setAmount(String(p))}
                style={{ minHeight: 34, paddingHorizontal: 12, borderRadius: 17, justifyContent: 'center', backgroundColor: on ? colors.interactive : colors.chip }}>
                <Text variant="footnote" weight="600" numeric style={{ color: on ? colors.onInteractive : colors.textPrimary }}>
                  ${p} · −{Math.round((1 - p / asking) * 100)}%
                </Text>
              </Pressable>
            );
          })}
        </View>

        <View style={{ gap: 4, paddingVertical: 10, paddingHorizontal: 14, borderRadius: 14, backgroundColor: colors.surface }}>
          <Text variant="caption" weight="600" tone="secondary">
            Message (optional)
          </Text>
          <TextInput
            accessibilityLabel="Message (optional)"
            value={message}
            onChangeText={setMessage}
            maxLength={280}
            placeholder="Can pick up Saturday morning if that works."
            placeholderTextColor={colors.textTertiary}
            style={{ fontSize: 15, color: colors.textPrimary, padding: 0 }}
          />
        </View>

        {error && (
          <Text variant="footnote" weight="600" align="center" accessibilityLiveRegion="assertive">
            {error}
          </Text>
        )}
        <Button label={`Send offer · ${formatPrice(cents)}`} disabled={dollars < 1} loading={make.isPending} onPress={send} />
        <Text variant="caption" weight="400" tone="secondary" align="center" style={{ lineHeight: 17 }}>
          Expires in 48 hours. An accepted offer isn’t a purchase — you’ll arrange payment and pickup together in chat.
        </Text>
      </ScrollView>

      <View style={{ backgroundColor: colors.surface, paddingTop: 6, paddingHorizontal: 6, paddingBottom: Math.max(insets.bottom, 12), gap: 6 }}>
        {[0, 3, 6, 9].map((row) => (
          <View key={row} style={{ flexDirection: 'row', gap: 6 }}>
            {KEYS.slice(row, row + 3).map((k, i) => (
              <Pressable
                key={i}
                accessibilityRole={k ? 'button' : undefined}
                accessibilityLabel={k === '⌫' ? 'Delete' : k || undefined}
                disabled={!k}
                onPress={() => press(k)}
                style={({ pressed }) => ({
                  flex: 1,
                  height: 46,
                  borderRadius: radius.control - 2,
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: !k || k === '⌫' ? 'transparent' : pressed ? colors.surfacePressed : colors.surfaceElevated,
                  boxShadow: !k || k === '⌫' ? undefined : `0 1px 0 ${colors.border}`,
                })}>
                <Text style={{ fontSize: 24, color: colors.textPrimary }}>{k}</Text>
              </Pressable>
            ))}
          </View>
        ))}
      </View>
    </View>
  );
}
