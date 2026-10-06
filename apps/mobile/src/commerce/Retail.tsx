import { formatPrice, percentOff, radius, speakable, spoken } from '@pickledeals/shared';
import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTheme } from '@/design/theme';
import { Button, Text } from '@/ui';

import { DiscountPill } from './Pricing';

/** Retail visuals (Phase 3): stat grid, offer card, price breakdown, sticky deal bar. */

export function StatGrid({ items, columns = 3 }: { items: { label: string; value: string }[]; columns?: number }) {
  const { colors } = useTheme();
  return (
    <View style={[styles.grid, { backgroundColor: colors.surface }]}>
      {items.map((it) => (
        <View key={it.label} accessible accessibilityLabel={spoken(it.label, speakable(it.value))} style={{ width: `${100 / columns}%`, padding: 12, gap: 2 }}>
          <Text variant="caption" weight="400" tone="secondary">
            {it.label}
          </Text>
          <Text variant="subhead" weight="700" numeric>
            {it.value}
          </Text>
        </View>
      ))}
    </View>
  );
}

export type RetailerOfferCardData = {
  retailer: string;
  monogram: string;
  tagline: string;
  /** D1: null for check-price offers — the card shows a CTA, never a number. */
  priceCents: number | null;
  deltaLabel?: string;
  detail: string;
  checked: string;
  best?: boolean;
};

/** "All offers compared" card: the best one is outlined and gets the primary CTA. */
export function RetailerOfferCard({ offer, actionLabel, onAction }: { offer: RetailerOfferCardData; actionLabel: string; onAction: () => void }) {
  const { colors } = useTheme();
  const checkPrice = offer.priceCents == null;
  return (
    <View style={[styles.card, { borderColor: offer.best ? colors.textPrimary : colors.border, borderWidth: offer.best ? 2 : StyleSheet.hairlineWidth * 2 }]}>
      <View
        accessible
        accessibilityLabel={spoken(
          offer.retailer,
          offer.best && 'best offer',
          offer.tagline,
          checkPrice ? 'Check price at retailer' : formatPrice(offer.priceCents!),
          offer.deltaLabel && speakable(offer.deltaLabel),
          speakable(offer.detail),
          offer.checked,
        )}
        style={{ gap: 10 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <View style={[styles.mono, { backgroundColor: colors.surface }]}>
            <Text variant="footnote" weight="700">
              {offer.monogram}
            </Text>
          </View>
          <View style={{ flex: 1, gap: 1 }}>
            <Text variant="subhead" weight="700">
              {offer.retailer}
            </Text>
            <Text variant="caption" weight="400" tone="secondary" numberOfLines={1}>
              {offer.tagline}
            </Text>
          </View>
          {!checkPrice && (
            <View style={{ alignItems: 'flex-end' }}>
              <Text variant="headline" weight="700" numeric>
                {formatPrice(offer.priceCents!)}
              </Text>
              {offer.deltaLabel ? (
                <Text variant="caption" weight="400" tone="secondary" numeric>
                  {offer.deltaLabel}
                </Text>
              ) : null}
            </View>
          )}
        </View>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8 }}>
          <Text variant="caption" weight="400" tone="secondary" numeric style={{ flex: 1 }} numberOfLines={1}>
            {offer.detail}
          </Text>
          <Text variant="caption" weight="400" tone="secondary">
            {offer.checked}
          </Text>
        </View>
      </View>
      <Button
        accessibilityLabel={`${actionLabel}, ${offer.retailer}`}
        label={actionLabel}
        variant={offer.best ? 'primary' : 'secondary'}
        size="sm"
        icon={checkPrice ? 'external' : undefined}
        iconPosition="trailing"
        fullWidth
        onPress={onAction}
      />
    </View>
  );
}

/** Deal detail breakdown: list → sale → code → "You pay". */
export function PriceBreakdown({
  rows,
  totalCents,
  referenceCents,
}: {
  rows: { label: string; value: string; strike?: boolean }[];
  totalCents: number;
  referenceCents: number | null;
}) {
  const { colors } = useTheme();
  const saved = referenceCents && referenceCents > totalCents ? referenceCents - totalCents : null;
  const pct = saved ? percentOff(totalCents, referenceCents!) : null;
  return (
    <View style={[styles.breakdown, { backgroundColor: colors.surface }]}>
      {rows.map((r) => (
        <View key={r.label} accessible accessibilityLabel={spoken(r.label, r.strike ? `was ${r.value}` : r.value)} style={styles.line}>
          <Text variant="footnote" tone="secondary">
            {r.label}
          </Text>
          <Text variant="footnote" weight="600" tone={r.strike ? 'tertiary' : 'primary'} strike={r.strike} numeric>
            {r.value}
          </Text>
        </View>
      ))}
      <View
        accessible
        accessibilityLabel={`You pay ${formatPrice(totalCents)}`}
        style={[styles.line, { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.separator, paddingTop: 10, marginTop: 2 }]}>
        <Text variant="headline">You pay</Text>
        <Text variant="priceLarge" numeric>
          {formatPrice(totalCents)}
        </Text>
      </View>
      {saved && pct ? (
        <View
          accessible
          accessibilityLabel={`Save ${formatPrice(saved)}, ${pct}% off`}
          style={{ flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', gap: 8 }}>
          <DiscountPill pct={pct} />
          <Text variant="footnote" weight="600" numeric>
            Save {formatPrice(saved)}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

/** "CourtSide Pro Shop" → "CP", "JOOLA.com" → "J", "Racquet & Court Co." → "RC". */
export function retailerMonogram(name: string): string {
  const words = name
    .replace(/\.(com|net|co)$/i, '')
    .split(/[\s&]+/)
    .filter((w) => /[A-Za-z0-9]/.test(w));
  return words
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join('');
}

/** Bottom bar with the best price and the primary action (Product, Deal detail). */
export function StickyDealBar({
  title,
  subtitle,
  actionLabel,
  onAction,
  trailing,
}: {
  title: ReactNode;
  subtitle?: string;
  actionLabel: string;
  onAction: () => void;
  trailing?: ReactNode;
}) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.bar, { backgroundColor: colors.glass, borderTopColor: colors.separator, paddingBottom: Math.max(insets.bottom, 12) }]}>
      <View accessible style={{ flex: 1, gap: 1, minWidth: 96 }}>
        {typeof title === 'string' ? (
          <Text variant="headline" weight="700" numeric>
            {title}
          </Text>
        ) : (
          title
        )}
        {subtitle ? (
          <Text variant="caption" weight="400" tone="secondary" numberOfLines={2}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {trailing}
      <Button label={actionLabel} size="md" icon="external" iconPosition="trailing" onPress={onAction} />
    </View>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', borderRadius: radius.card, overflow: 'hidden' },
  card: { padding: 14, borderRadius: radius.card, gap: 10 },
  mono: { width: 36, height: 36, borderRadius: radius.control, alignItems: 'center', justifyContent: 'center' },
  breakdown: { padding: 14, borderRadius: radius.card, gap: 8 },
  line: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  bar: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingTop: 12, borderTopWidth: StyleSheet.hairlineWidth },
});
