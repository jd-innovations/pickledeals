import { formatPrice, LISTING_CONDITIONS, radius, type ListingCondition } from '@pickledeals/shared';
import * as Clipboard from 'expo-clipboard';
import * as Haptics from 'expo-haptics';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { useTheme } from '@/design/theme';
import { Button, Icon, Text } from '@/ui';

export type RetailerOfferRowData = {
  retailer: string;
  monogram: string;
  detail: string;
  /** null when the offer is `check_price` (D1) — the row shows a CTA, never a number. */
  priceCents: number | null;
  deltaLabel?: string;
  isBest?: boolean;
  sponsored?: boolean;
};

export function RetailerRow({ offer, onPress, last }: { offer: RetailerOfferRowData; onPress?: () => void; last?: boolean }) {
  const { colors } = useTheme();
  const checkPrice = offer.priceCents == null;
  return (
    <View style={[styles.retailer, !last && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.separator }]}>
      <View style={[styles.mono, { backgroundColor: colors.surface }]}>
        <Text variant="footnote" weight="700">
          {offer.monogram}
        </Text>
      </View>
      <View style={{ flex: 1, gap: 1 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Text variant="subhead" weight="600">
            {offer.retailer}
          </Text>
          {offer.isBest && (
            <View style={[styles.tag, { backgroundColor: colors.interactive }]}>
              <Text variant="badge" style={{ fontSize: 10, color: colors.onInteractive }}>
                LOWEST
              </Text>
            </View>
          )}
          {offer.sponsored && (
            <Text variant="caption" tone="tertiary">
              Sponsored
            </Text>
          )}
        </View>
        <Text variant="caption" weight="400" tone="secondary" numeric numberOfLines={1}>
          {offer.detail}
        </Text>
      </View>
      {!checkPrice && (
        <View style={{ alignItems: 'flex-end' }}>
          <Text variant="headline" weight={offer.isBest ? '700' : '600'} numeric>
            {formatPrice(offer.priceCents!)}
          </Text>
          {offer.deltaLabel && (
            <Text variant="caption" weight="400" tone="secondary" numeric>
              {offer.deltaLabel}
            </Text>
          )}
        </View>
      )}
      <Button
        label={checkPrice ? 'Check price' : offer.isBest ? 'Get deal' : 'View'}
        variant={offer.isBest ? 'primary' : 'secondary'}
        size="sm"
        icon={checkPrice ? 'external' : undefined}
        onPress={onPress}
      />
    </View>
  );
}

export function PromoCodeRow({ title, detail, code }: { title: string; detail: string; code: string }) {
  const { colors } = useTheme();
  const [copied, setCopied] = useState(false);
  return (
    <View style={[styles.promo, { borderColor: colors.border }]}>
      <View style={{ flex: 1, gap: 2 }}>
        <Text variant="subhead" weight="600">
          {title}
        </Text>
        <Text variant="caption" weight="400" tone="secondary">
          {detail}
        </Text>
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={copied ? `Copied ${code}` : `Copy code ${code}`}
        onPress={async () => {
          await Clipboard.setStringAsync(code);
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
          setCopied(true);
        }}
        style={({ pressed }) => [styles.code, { backgroundColor: colors.surface, opacity: pressed ? 0.7 : 1 }]}>
        <Text variant="subhead" weight="700" style={{ fontFamily: 'Menlo', letterSpacing: 0.8 }}>
          {code}
        </Text>
        <Icon name={copied ? 'check' : 'copy'} size={14} color={colors.textPrimary} />
      </Pressable>
    </View>
  );
}

export function ConditionBadge({ condition, withDescription }: { condition: ListingCondition; withDescription?: boolean }) {
  const { colors } = useTheme();
  const c = LISTING_CONDITIONS.find((x) => x.value === condition)!;
  const sealed = condition === 'new_sealed';
  return (
    <View style={{ gap: 6 }}>
      <View style={[styles.cond, { backgroundColor: sealed ? colors.interactive : colors.chip }]}>
        <Text variant="footnote" weight="700" style={{ color: sealed ? colors.onInteractive : colors.textPrimary }}>
          {c.label}
        </Text>
      </View>
      {withDescription && (
        <Text variant="caption" weight="400" tone="secondary">
          {c.description}
        </Text>
      )}
    </View>
  );
}

export function SellerIdentity({
  name,
  areaLabel,
  memberSince,
  soldCount,
  replyTime,
  onPress,
}: {
  name: string;
  areaLabel: string;
  memberSince: string;
  soldCount: number;
  replyTime?: string;
  onPress?: () => void;
}) {
  const { colors } = useTheme();
  return (
    <Pressable accessibilityRole={onPress ? 'button' : undefined} onPress={onPress} style={styles.seller}>
      <View style={[styles.avatar, { backgroundColor: colors.surfacePressed }]}>
        <Text variant="headline" weight="700">
          {name.charAt(0)}
        </Text>
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <Text variant="headline">{name}</Text>
        <Text variant="footnote" tone="secondary" numeric>
          {areaLabel} · since {memberSince} · {soldCount} sold
        </Text>
      </View>
      {replyTime && (
        <Text variant="caption" weight="400" tone="secondary" align="right">
          Replies in{'\n'}
          <Text variant="caption" weight="700">
            {replyTime}
          </Text>
        </Text>
      )}
      {onPress && <Icon name="chevronRight" size={14} color={colors.textTertiary} />}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  retailer: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, paddingHorizontal: 16 },
  mono: { width: 36, height: 36, borderRadius: radius.control, alignItems: 'center', justifyContent: 'center' },
  tag: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 5 },
  promo: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: radius.card, borderWidth: 1.5, borderStyle: 'dashed' },
  code: { height: 36, paddingHorizontal: 10, borderRadius: radius.control, flexDirection: 'row', alignItems: 'center', gap: 6 },
  cond: { alignSelf: 'flex-start', paddingHorizontal: 9, paddingVertical: 4, borderRadius: 7 },
  seller: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  avatar: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
});
