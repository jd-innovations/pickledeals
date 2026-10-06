import {
  DEAL_QUALITY,
  formatPercentOff,
  formatPrice,
  percentOff,
  radius,
  speakable,
  spoken,
  spokenBadge,
  type DealBadge as DealBadgeLabel,
  type DealQuality,
} from '@pickledeals/shared';
import { StyleSheet, View } from 'react-native';

import { useTheme } from '@/design/theme';
import { Text } from '@/ui';

/** Discounts are always a solid pill: legible at a glance without colour. */
export function DiscountPill({ pct, size = 'sm' }: { pct: number; size?: 'sm' | 'md' }) {
  const { colors } = useTheme();
  return (
    <View
      accessible
      accessibilityLabel={`${pct}% off`}
      style={[styles.pill, { backgroundColor: colors.interactive, paddingHorizontal: size === 'md' ? 7 : 6 }]}>
      <Text variant={size === 'md' ? 'footnote' : 'caption'} weight="700" numeric style={{ color: colors.onInteractive }}>
        {formatPercentOff(pct)}
      </Text>
    </View>
  );
}

/** One badge per card (see pickDealBadge). LOWEST PRICE is the only filled badge; SPONSORED is never a badge. */
export function DealBadge({ label }: { label: DealBadgeLabel }) {
  const { colors } = useTheme();
  const strong = label === 'LOWEST PRICE';
  return (
    <View
      accessible
      accessibilityLabel={spokenBadge(label) ?? undefined}
      style={[
        styles.badge,
        { backgroundColor: strong ? colors.interactive : colors.background },
        label === 'PROMO CODE' && { borderWidth: 1, borderStyle: 'dashed', borderColor: colors.textTertiary },
      ]}>
      <Text variant="badge" style={{ fontSize: 10, color: strong ? colors.onInteractive : colors.textPrimary }}>
        {label}
      </Text>
    </View>
  );
}

export function PriceBlock({
  priceCents,
  referenceCents,
  label,
  retailer,
  variant = 'display',
}: {
  priceCents: number;
  referenceCents?: number;
  label?: string;
  retailer?: string;
  variant?: 'display' | 'card';
}) {
  const pct = referenceCents ? percentOff(priceCents, referenceCents) : null;
  const display = variant === 'display';
  const a11yLabel = spoken(
    label && speakable(label),
    formatPrice(priceCents),
    referenceCents != null && pct != null && `${display ? 'MSRP' : 'was'} ${formatPrice(referenceCents)}`,
    pct != null && `${pct}% off`,
    display && referenceCents != null && pct != null && `you save ${formatPrice(referenceCents - priceCents)}`,
    display && pct != null && retailer && `at ${retailer}`,
  );
  return (
    <View accessible accessibilityLabel={a11yLabel} style={{ gap: display ? 4 : 2 }}>
      {label && (
        <Text variant="badge" tone="secondary">
          {label}
        </Text>
      )}
      <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: display ? 10 : 6 }}>
        <Text variant={display ? 'priceDisplay' : 'priceCard'} numeric>
          {formatPrice(priceCents)}
        </Text>
        {referenceCents && pct != null && (
          <Text variant={display ? 'headline' : 'footnote'} weight="400" tone="tertiary" strike numeric>
            {display ? `MSRP ${formatPrice(referenceCents)}` : formatPrice(referenceCents)}
          </Text>
        )}
        {!display && pct != null && (
          <View style={{ marginLeft: 'auto' }}>
            <DiscountPill pct={pct} />
          </View>
        )}
      </View>
      {display && referenceCents && pct != null && (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <DiscountPill pct={pct} size="md" />
          <Text variant="subhead" weight="600" numeric>
            You save {formatPrice(referenceCents - priceCents)}
          </Text>
          {retailer && (
            <Text variant="subhead" weight="400" tone="secondary">
              at {retailer}
            </Text>
          )}
        </View>
      )}
    </View>
  );
}

const QUALITY_LABEL: Record<DealQuality, string> = {
  above_typical: 'Above typical price',
  typical: 'Typical price',
  good: 'Good deal',
  excellent: 'Excellent deal',
  all_time_low: 'All-time low',
};

export function DealQualityMeter({ quality, detail }: { quality: DealQuality; detail?: string }) {
  const { colors } = useTheme();
  const level = DEAL_QUALITY.indexOf(quality);
  return (
    <View accessible accessibilityLabel={spoken(QUALITY_LABEL[quality], detail && speakable(detail), `level ${level + 1} of 5`)} style={{ gap: 8 }}>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'baseline', columnGap: 12, rowGap: 2 }}>
        <Text variant="headline" weight="700" style={{ flexShrink: 0 }}>
          {QUALITY_LABEL[quality]}
        </Text>
        {detail && (
          <Text variant="footnote" tone="secondary" numeric style={{ flexShrink: 1 }}>
            {detail}
          </Text>
        )}
      </View>
      <View style={{ flexDirection: 'row', gap: 3 }}>
        {DEAL_QUALITY.map((q, i) => (
          <View key={q} style={{ flex: 1, height: 5, borderRadius: 3, backgroundColor: i <= level ? colors.interactive : colors.border }} />
        ))}
      </View>
    </View>
  );
}

/** The differentiator: what this costs used vs. the best verified new price. */
export function UsedVsNew({
  askCents,
  conditionLabel,
  bestNewCents,
  bestNewRetailer,
}: {
  askCents: number;
  conditionLabel: string;
  bestNewCents: number | null;
  bestNewRetailer?: string;
}) {
  const { colors } = useTheme();
  const a11yLabel = spoken(
    `This listing, used, ${formatPrice(askCents)}, ${conditionLabel}`,
    bestNewCents != null ? `best new price ${formatPrice(bestNewCents)}${bestNewRetailer ? ` at ${bestNewRetailer}` : ''}` : 'no verified new price',
    bestNewCents != null && bestNewCents > askCents && `${formatPrice(bestNewCents - askCents)} less than new`,
  );
  return (
    <View accessible accessibilityLabel={a11yLabel} style={{ gap: 10 }}>
      <View style={[styles.split, { backgroundColor: colors.background, borderColor: colors.border }]}>
        <View style={styles.splitCell}>
          <Text variant="caption" weight="400" tone="secondary">
            This listing · used
          </Text>
          <Text variant="priceLarge" style={{ fontSize: 24 }} numeric>
            {formatPrice(askCents)}
          </Text>
          <Text variant="caption" weight="600">
            {conditionLabel}
          </Text>
        </View>
        <View style={[styles.splitCell, { borderLeftWidth: StyleSheet.hairlineWidth, borderLeftColor: colors.border }]}>
          <Text variant="caption" weight="400" tone="secondary">
            Best new price
          </Text>
          <Text variant="priceLarge" style={{ fontSize: 24 }} numeric>
            {bestNewCents != null ? formatPrice(bestNewCents) : '—'}
          </Text>
          <Text variant="caption" weight="400" tone="secondary">
            {bestNewRetailer ?? 'No verified new price'}
          </Text>
        </View>
      </View>
      {bestNewCents != null && bestNewCents > askCents && (
        <Text variant="subhead" weight="600" numeric>
          {formatPrice(bestNewCents - askCents)} less than new
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  pill: { paddingVertical: 2, borderRadius: radius.badge, alignSelf: 'flex-start' },
  badge: { paddingHorizontal: 7, paddingVertical: 4, borderRadius: radius.badge, alignSelf: 'flex-start' },
  split: { flexDirection: 'row', borderRadius: 14, borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden' },
  splitCell: { flex: 1, padding: 12, gap: 2 },
});
