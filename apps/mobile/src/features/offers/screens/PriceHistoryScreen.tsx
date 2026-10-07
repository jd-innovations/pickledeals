import { formatPrice, radius } from '@pickledeals/shared';
import { Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { DealQualityMeter, PriceChart, shortDate, StatGrid, type ChartPoint } from '@/commerce';
import { useTheme } from '@/design/theme';
import { useProduct } from '@/features/catalog/hooks';
import { Chip, ChipRow, SectionHeader, SegmentedControl, Skeleton, Text } from '@/ui';

import { qualityDetail, UNTRACKED_NOTE } from '../format';
import { usePriceHistory, useProductOffers, useRecentChanges } from '../hooks';

const RANGES = [
  { value: '30', label: '30D' },
  { value: '90', label: '90D' },
  { value: '365', label: '1Y' },
  { value: '1825', label: 'All' },
] as const;
type Range = (typeof RANGES)[number]['value'];

const QUALITY_SENTENCE: Record<string, string> = {
  all_time_low: 'The lowest price we’ve tracked.',
  excellent: 'Well below what it usually sells for.',
  good: 'Below its usual price.',
  typical: 'About what it usually sells for.',
  above_typical: 'Above its usual price — consider an alert.',
};

/** Price history (design). Priced retailers only — check-price retailers have no history (D1). */
export default function PriceHistoryScreen() {
  const { colors } = useTheme();
  const { slug = '', variant: variantParam } = useLocalSearchParams<{ slug: string; variant?: string }>();
  const { data: product } = useProduct(slug);
  const { data: offerData } = useProductOffers(product?.id);
  const [range, setRange] = useState<Range>('90');
  const [retailer, setRetailer] = useState<string | undefined>();
  const [scrub, setScrub] = useState<ChartPoint | null>(null);

  const variant = product?.variants.find((v) => v.id === variantParam) ?? product?.variants.find((v) => v.isDefault);
  const history = usePriceHistory(variant?.id, Number(range), retailer);
  const changes = useRecentChanges(variant?.id);
  const stats = offerData?.stats.find((s) => s.variantId === variant?.id);
  const pricedRetailers = [
    ...new Map(
      (offerData?.offers ?? [])
        .filter((o) => o.variantId === variant?.id && o.priceDisplay === 'show' && !o.trackingExcluded)
        .map((o) => [o.retailer.slug, o.retailer.name] as const),
    ),
  ];

  const now = stats?.bestDeliveredCents ?? null;
  const vsTypical = now != null && stats?.typicalCents != null ? stats.typicalCents - now : null;
  const msrp = variant?.msrpCents ?? product?.msrpCents ?? null;
  const points = history.data ?? [];

  return (
    <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={{ paddingBottom: 120, gap: 18 }}>
      <Stack.Screen options={{ title: 'Price history' }} />
      <View style={{ paddingHorizontal: 16, gap: 4 }}>
        <Text variant="footnote" tone="secondary">
          {scrub ? shortDate(scrub.day) : 'Lowest new price today'}
          {product ? ` · ${product.brand.name} ${product.name}${variant && product.variants.length > 1 ? ` ${variant.label}` : ''}` : ''}
        </Text>
        <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 10 }}>
          <Text variant="priceDisplay" numeric>
            {scrub ? formatPrice(scrub.cents) : now != null ? formatPrice(now) : '—'}
          </Text>
          {!scrub && vsTypical != null && stats?.typicalCents && (
            <Text variant="subhead" weight="600" numeric>
              {Math.abs(vsTypical) < stats.typicalCents * 0.01
                ? 'About typical'
                : vsTypical > 0
                  ? `↓ ${formatPrice(vsTypical)} below typical`
                  : `↑ ${formatPrice(-vsTypical)} above typical`}
            </Text>
          )}
        </View>
      </View>

      <View style={{ paddingHorizontal: 16 }}>
        <SegmentedControl options={RANGES} value={range} onChange={setRange} />
      </View>

      <View style={{ paddingHorizontal: 16, opacity: history.isPlaceholderData ? 0.5 : 1 }}>
        {history.isPending ? (
          <Skeleton height={200} round={radius.card} />
        ) : points.length > 1 ? (
          <PriceChart points={points} typicalCents={retailer ? null : stats?.typicalCents} height={200} interactive onScrub={setScrub} />
        ) : (
          <Text variant="footnote" tone="secondary">
            Not enough price history yet for this range.
          </Text>
        )}
        <Text variant="caption" weight="400" tone="tertiary" style={{ paddingTop: 8 }}>
          {UNTRACKED_NOTE}
        </Text>
      </View>

      {pricedRetailers.length > 1 && (
        <ChipRow>
          <Chip label="Lowest of all" selected={!retailer} onPress={() => setRetailer(undefined)} />
          {pricedRetailers.map(([s, name]) => (
            <Chip key={s} label={name} selected={retailer === s} onPress={() => setRetailer(retailer === s ? undefined : s)} />
          ))}
        </ChipRow>
      )}

      {stats && (
        <View style={{ paddingHorizontal: 16, gap: 12 }}>
          <StatGrid
            items={[
              { label: 'MSRP', value: msrp != null ? formatPrice(msrp) : '—' },
              { label: 'Typical', value: stats.typicalCents != null ? formatPrice(stats.typicalCents) : '—' },
              { label: '30-day low', value: stats.low30dCents != null ? formatPrice(stats.low30dCents) : '—' },
              { label: '90-day low', value: stats.low90dCents != null ? formatPrice(stats.low90dCents) : '—' },
              { label: 'All-time low', value: stats.lowAllTimeCents != null ? formatPrice(stats.lowAllTimeCents) : '—' },
              { label: 'Days tracked', value: String(stats.historyDays) },
            ]}
          />
          {stats.quality && (
            <View style={[styles.quality, { borderColor: colors.border }]}>
              <DealQualityMeter quality={stats.quality} detail={qualityDetail(stats)} />
              <Text variant="footnote" tone="secondary">
                {QUALITY_SENTENCE[stats.quality]}
              </Text>
            </View>
          )}
        </View>
      )}

      {(changes.data?.length ?? 0) > 0 && (
        <View style={{ gap: 8 }}>
          <SectionHeader title="Recent changes" />
          <View style={{ paddingHorizontal: 16 }}>
            {changes.data!.map((c, i) => (
              <View key={`${c.at}-${i}`} style={[styles.change, { borderBottomColor: colors.separator, borderBottomWidth: i === changes.data!.length - 1 ? 0 : StyleSheet.hairlineWidth }]}>
                <Text variant="footnote" tone="secondary">
                  {shortDate(c.at.slice(0, 10))} · {c.retailer}
                </Text>
                <View style={{ flexDirection: 'row', gap: 6 }}>
                  <Text variant="footnote" tone="tertiary" strike numeric>
                    {formatPrice(c.previousCents)}
                  </Text>
                  <Text variant="footnote" weight="700" numeric>
                    {formatPrice(c.cents)}
                  </Text>
                </View>
              </View>
            ))}
          </View>
        </View>
      )}

      <View style={{ paddingHorizontal: 16 }}>
        <Text variant="caption" weight="400" tone="tertiary">
          Daily lowest price plus shipping across retailers that publish prices. Codes aren’t included in history.
        </Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  quality: { padding: 14, borderRadius: radius.card, borderWidth: StyleSheet.hairlineWidth * 2, gap: 8 },
  change: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 10 },
});
