import { formatPrice, percentOff, radius, speakable, spoken, spokenBadge, spokenPrice, type DealBadge as DealBadgeLabel } from '@pickledeals/shared';
import { Pressable, StyleSheet, View } from 'react-native';

import { useTheme } from '@/design/theme';
import { Button, Icon, Text } from '@/ui';

import { DealBadge, DiscountPill } from './Pricing';
import { ProductImage, type ImageSource } from './ProductImage';

/** Deals home visuals (Phase 4): hero, numbered price-drop rows, collection banner. */

export type DealHeroData = {
  eyebrow: string;
  image: ImageSource;
  badge: DealBadgeLabel | null;
  brandLine: string;
  title: string;
  /** D1: null for check-price deals. */
  priceCents: number | null;
  wasCents: number | null;
  meta: string;
  ctaLabel: string;
};

/** "Today's best deal": large image, price, and Get deal / Compare. */
export function DealHero({ deal, onPress, onGetDeal, onCompare }: { deal: DealHeroData; onPress: () => void; onGetDeal: () => void; onCompare: () => void }) {
  const pct = deal.priceCents != null && deal.wasCents ? percentOff(deal.priceCents, deal.wasCents) : null;
  return (
    <View style={{ gap: 12 }}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={spoken(
          speakable(deal.eyebrow),
          speakable(deal.brandLine),
          deal.title,
          spokenPrice(deal.priceCents, deal.wasCents, 'Check price at retailer'),
          spokenBadge(deal.badge),
          speakable(deal.meta),
        )}
        onPress={onPress}
        style={({ pressed }) => ({ gap: 12, opacity: pressed ? 0.9 : 1 })}>
        <ProductImage source={deal.image} round={radius.hero} aspectRatio={1.15} padding={32}>
          {deal.badge && (
            <View style={{ position: 'absolute', top: 12, left: 12 }}>
              <DealBadge label={deal.badge} />
            </View>
          )}
        </ProductImage>
        <View style={{ gap: 4 }}>
          <Text variant="caption" weight="600" tone="secondary">
            {deal.brandLine}
          </Text>
          <Text variant="title2">{deal.title}</Text>
          {deal.priceCents != null ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 2 }}>
              <Text variant="priceLarge" numeric>
                {formatPrice(deal.priceCents)}
              </Text>
              {pct != null && (
                <>
                  <Text variant="subhead" weight="400" tone="tertiary" strike numeric>
                    {formatPrice(deal.wasCents!)}
                  </Text>
                  <DiscountPill pct={pct} />
                </>
              )}
            </View>
          ) : (
            <Text variant="headline">Check price at retailer</Text>
          )}
          <Text variant="footnote" tone="secondary" numeric>
            {deal.meta}
          </Text>
        </View>
      </Pressable>
      <View style={{ flexDirection: 'row', gap: 10 }}>
        <Button label={deal.ctaLabel} icon="external" iconPosition="trailing" size="md" numberOfLines={1} style={{ flex: 1 }} onPress={onGetDeal} />
        <Button label="Compare" variant="secondary" size="md" numberOfLines={1} style={{ flex: 1 }} onPress={onCompare} />
      </View>
    </View>
  );
}

export type PriceDropRowData = {
  rank: number;
  image: ImageSource;
  brand: string;
  name: string;
  meta: string;
  priceCents: number | null;
  wasCents: number | null;
  dropLabel: string;
};

export function PriceDropRow({ row, onPress, last }: { row: PriceDropRowData; onPress: () => void; last?: boolean }) {
  const { colors } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={spoken(`${row.rank}`, row.brand, row.name, spokenPrice(row.priceCents, row.wasCents), speakable(row.dropLabel), speakable(row.meta))}
      onPress={onPress}
      style={({ pressed }) => [styles.drop, { backgroundColor: pressed ? colors.surfacePressed : 'transparent' }]}>
      <Text variant="headline" tone="secondary" numeric style={{ width: 18 }}>
        {row.rank}
      </Text>
      <ProductImage source={row.image} width={56} round={12} padding={6} />
      <View style={[styles.dropBody, !last && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.separator }]}>
        <View style={{ flex: 1, gap: 1 }}>
          <Text variant="caption" weight="600" tone="secondary" numberOfLines={1}>
            {row.brand}
          </Text>
          <Text variant="subhead" weight="700" numberOfLines={2}>
            {row.name}
          </Text>
          <Text variant="caption" weight="400" tone="secondary" numberOfLines={1}>
            {row.meta}
          </Text>
        </View>
        <View style={{ alignItems: 'flex-end', gap: 1 }}>
          {row.priceCents != null ? (
            <Text variant="headline" weight="700" numeric>
              {formatPrice(row.priceCents)}
            </Text>
          ) : (
            <Text variant="footnote" weight="700">
              Check price
            </Text>
          )}
          {row.wasCents != null && (
            <Text variant="caption" weight="400" tone="tertiary" strike numeric>
              {formatPrice(row.wasCents)}
            </Text>
          )}
          <Text variant="caption" weight="700" numeric>
            {row.dropLabel}
          </Text>
        </View>
      </View>
    </Pressable>
  );
}

/** Editorial collection banner (design: "Staff picks · Court shoes on sale"). Inverted tokens. */
export function CollectionBanner({
  eyebrow,
  title,
  detail,
  ctaLabel,
  art,
  onPress,
}: {
  eyebrow?: string | null;
  title: string;
  detail: string;
  ctaLabel: string;
  art?: ImageSource;
  onPress: () => void;
}) {
  const { colors } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={spoken(eyebrow && speakable(eyebrow), title, speakable(detail), ctaLabel)}
      onPress={onPress}
      style={({ pressed }) => [styles.banner, { backgroundColor: colors.interactive, opacity: pressed ? 0.92 : 1 }]}>
      <View style={{ flex: 1, gap: 6, paddingRight: art ? 8 : 0 }}>
        {eyebrow ? (
          <Text variant="badge" style={{ color: colors.onInteractive, opacity: 0.7 }}>
            {eyebrow}
          </Text>
        ) : null}
        <Text variant="title2" style={{ color: colors.onInteractive }}>
          {title}
        </Text>
        <Text variant="footnote" style={{ color: colors.onInteractive, opacity: 0.8 }} numeric>
          {detail}
        </Text>
        <View style={[styles.bannerCta, { backgroundColor: colors.onInteractive }]}>
          <Text variant="footnote" weight="700" style={{ color: colors.interactive }}>
            {ctaLabel}
          </Text>
          <Icon name="chevronRight" size={11} color={colors.interactive} weight="bold" />
        </View>
      </View>
      {art && <ProductImage source={art} width={112} round={radius.tile} padding={10} />}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  drop: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingLeft: 16 },
  dropBody: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 10, paddingRight: 16, minHeight: 76 },
  banner: { marginHorizontal: 16, padding: 18, borderRadius: radius.hero, flexDirection: 'row', alignItems: 'center', minHeight: 170 },
  bannerCta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    alignSelf: 'flex-start',
    paddingHorizontal: 12,
    minHeight: 32,
    borderRadius: radius.capsule,
    marginTop: 6,
  },
});
