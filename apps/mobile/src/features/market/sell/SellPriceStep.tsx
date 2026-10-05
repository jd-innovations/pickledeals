import { formatPrice, radius } from '@pickledeals/shared';
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { useEffect } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';

import { useTheme } from '@/design/theme';
import { Text, Toggle } from '@/ui';

import { conditionLabel } from '../components';
import { usePriceGuide, useSellDraft } from '../hooks';
import { SellFrame } from './SellFrame';

const STEP = 500;
const round5 = (c: number) => Math.max(STEP, Math.round(c / STEP) * STEP);
const dollars = (c: number | null) => (c == null ? '' : String(Math.round(c / 100)));

/** Step 4 — price, with the best verified new price and what used sells for as the guide. */
export default function SellPriceStep() {
  const { colors } = useTheme();
  const { draft, update } = useSellDraft();
  const guide = usePriceGuide(draft.product?.variantId).data;
  const bestNew = guide?.bestNewCents ?? null;
  const ref = bestNew ?? draft.product?.msrpCents ?? null;
  const low = guide?.usedP25 ?? null;
  const high = guide?.usedP75 ?? null;
  const price = draft.priceCents;

  // First visit: start at the middle of what used sells for, else ~65% of new.
  useEffect(() => {
    if (draft.priceCents != null) return;
    const start = low && high ? round5((low + high) / 2) : ref ? round5(ref * 0.65) : null;
    if (start) update({ priceCents: start });
  }, [draft.priceCents, low, high, ref, update]);

  const setPrice = (c: number | null) => update({ priceCents: c });
  const bump = (d: number) => {
    Haptics.selectionAsync().catch(() => {});
    setPrice(Math.max(STEP, (price ?? 0) + d));
  };

  let verdict = '';
  if (price != null && bestNew != null) {
    if (price >= bestNew) verdict = 'At or above the best new price — unlikely to sell';
    else {
      verdict = `${formatPrice(bestNew - price)} under the best new price`;
      if (high && price > high) verdict += ' · above typical, expect offers';
      else if (low && high && price >= low) verdict += ' · right in the typical range';
      else if (low) verdict += ' · priced to sell fast';
    }
  }

  // Price-guide bar: scale from ~half the low end to a bit past new.
  const min = Math.min(low ?? ref ?? 0, price ?? Infinity) * 0.7;
  const max = Math.max(ref ?? 0, high ?? 0, price ?? 0) * 1.1;
  const pos = (c: number) => `${Math.max(0, Math.min(100, ((c - min) / (max - min || 1)) * 100))}%` as const;
  const presets =
    low && high
      ? [
          { label: 'Quick sale', cents: round5(low) },
          { label: 'Typical', cents: round5((low + high) / 2) },
          { label: 'Top of range', cents: round5(high) },
        ]
      : [];
  const subtitle = [draft.product ? [draft.product.name, draft.product.variantLabel].filter(Boolean).join(' ') : draft.custom?.title, draft.condition && conditionLabel(draft.condition)]
    .filter(Boolean)
    .join(' · ');

  return (
    <SellFrame
      step={4}
      title="Set your price"
      subtitle={subtitle}
      ctaDisabled={price == null || price < 100}
      onContinue={() => router.push('/sell/details')}
      footer={
        <Text variant="footnote" tone="secondary" align="center">
          Free to list. PickleDeals takes no fee.
        </Text>
      }>
      <View style={styles.priceRow}>
        <Pressable accessibilityRole="button" accessibilityLabel="Decrease by $5" onPress={() => bump(-STEP)} style={[styles.step, { backgroundColor: colors.chip }]}>
          <Text variant="title1" weight="400">
            −
          </Text>
        </Pressable>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <Text variant="priceDisplay" style={{ fontSize: 56, lineHeight: 64 }}>
            $
          </Text>
          <TextInput
            accessibilityLabel="Price in dollars"
            value={dollars(price)}
            onChangeText={(t) => {
              const d = t.replace(/[^\d]/g, '').slice(0, 5);
              setPrice(d ? Number(d) * 100 : null);
            }}
            keyboardType="number-pad"
            placeholder="0"
            placeholderTextColor={colors.textTertiary}
            style={{ width: Math.max(1, dollars(price).length) * 33 + 6, fontSize: 56, fontWeight: '700', letterSpacing: -2.4, color: colors.textPrimary, padding: 0, fontVariant: ['tabular-nums'] }}
          />
        </View>
        <Pressable accessibilityRole="button" accessibilityLabel="Increase by $5" onPress={() => bump(STEP)} style={[styles.step, { backgroundColor: colors.chip }]}>
          <Text variant="title1" weight="400">
            +
          </Text>
        </Pressable>
      </View>
      {!!verdict && (
        <Text variant="subhead" weight="600" align="center" numeric>
          {verdict}
        </Text>
      )}

      {ref != null && (
        <View style={{ padding: 16, borderRadius: 20, backgroundColor: colors.surface, gap: 14 }}>
          <Text variant="subhead" weight="700">
            What it sells for
          </Text>
          <View style={{ height: 56 }}>
            <View style={[styles.track, { backgroundColor: colors.border }]} />
            {low && high && <View style={[styles.track, { left: pos(low), width: `${Math.max(2, ((high - low) / (max - min)) * 100)}%`, backgroundColor: colors.textTertiary }]} />}
            <View style={[styles.marker, { left: pos(ref), top: 18 }]}>
              <View style={{ width: 2, height: 18, backgroundColor: colors.textPrimary }} />
              <Text variant="caption" weight="700" style={{ fontSize: 11 }} numeric>
                {bestNew != null ? 'New' : 'MSRP'} {formatPrice(ref)}
              </Text>
            </View>
            {price != null && (
              <View style={[styles.marker, { left: pos(price), top: 0 }]}>
                <View style={[styles.you, { backgroundColor: colors.interactive }]}>
                  <Text variant="caption" weight="700" style={{ fontSize: 11, color: colors.onInteractive }}>
                    You
                  </Text>
                </View>
                <View style={[styles.knob, { backgroundColor: colors.interactive, borderColor: colors.surface }]} />
              </View>
            )}
          </View>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8 }}>
            <Text variant="footnote" tone="secondary" numeric>
              {low && high ? `Used: ${formatPrice(low)}–${formatPrice(high)}` : 'Not enough used sales yet'}
            </Text>
            {!!guide?.activeListings && (
              <Text variant="footnote" tone="secondary" numeric>
                {guide.activeListings} listed now
              </Text>
            )}
          </View>
        </View>
      )}

      {presets.length > 0 && (
        <View style={{ flexDirection: 'row', gap: 8 }}>
          {presets.map((p) => {
            const on = price === p.cents;
            return (
              <Pressable
                key={p.label}
                accessibilityRole="button"
                accessibilityLabel={`${p.label}, ${formatPrice(p.cents)}`}
                onPress={() => setPrice(p.cents)}
                style={[styles.preset, { backgroundColor: on ? colors.interactive : colors.chip }]}>
                <Text variant="headline" weight="700" style={{ color: on ? colors.onInteractive : colors.textPrimary }} numeric>
                  {formatPrice(p.cents)}
                </Text>
                <Text variant="caption" weight="600" style={{ fontSize: 11, opacity: 0.75, color: on ? colors.onInteractive : colors.textPrimary }}>
                  {p.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      )}

      <View style={{ borderRadius: radius.card, borderWidth: 1, borderColor: colors.border }}>
        <View style={[styles.row, draft.acceptsOffers && { borderBottomWidth: 1, borderBottomColor: colors.separator }]}>
          <View style={{ flex: 1 }}>
            <Text variant="subhead" weight="600">
              Accept offers
            </Text>
            <Text variant="caption" weight="400" tone="secondary">
              Buyers can send structured offers
            </Text>
          </View>
          <Toggle
            accessibilityLabel="Accept offers"
            value={draft.acceptsOffers}
            onValueChange={(v) => update({ acceptsOffers: v })}
          />
        </View>
        {draft.acceptsOffers && (
          <View style={styles.row}>
            <Text variant="subhead" weight="600" style={{ flex: 1 }}>
              Hide offers below
            </Text>
            <Text variant="subhead" tone="secondary">
              $
            </Text>
            <TextInput
              accessibilityLabel="Hide offers below, in dollars"
              value={dollars(draft.hideBelowCents)}
              onChangeText={(t) => {
                const d = t.replace(/[^\d]/g, '').slice(0, 5);
                update({ hideBelowCents: d ? Number(d) * 100 : null });
              }}
              keyboardType="number-pad"
              placeholder="None"
              placeholderTextColor={colors.textTertiary}
              style={{ width: 70, fontSize: 15, color: colors.textPrimary, padding: 0, textAlign: 'right', fontVariant: ['tabular-nums'] }}
            />
          </View>
        )}
      </View>
    </SellFrame>
  );
}

const styles = StyleSheet.create({
  priceRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: 4 },
  step: { width: 52, height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center' },
  track: { position: 'absolute', left: 0, right: 0, top: 24, height: 6, borderRadius: 3 },
  marker: { position: 'absolute', alignItems: 'center', transform: [{ translateX: -45 }], width: 90 },
  you: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 5 },
  knob: { width: 14, height: 14, borderRadius: 7, borderWidth: 3, marginTop: 2 },
  preset: { flex: 1, height: 56, borderRadius: 14, alignItems: 'center', justifyContent: 'center', gap: 1 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingVertical: 12 },
});
