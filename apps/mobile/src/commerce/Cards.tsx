import { formatPrice, percentOff, type DealBadge as DealBadgeLabel, type PriceDisplayMode } from '@pickledeals/shared';
import * as Haptics from 'expo-haptics';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSequence, withSpring } from 'react-native-reanimated';

import { useTheme } from '@/design/theme';
import { Icon, Text } from '@/ui';
import { DealBadge, DiscountPill } from './Pricing';
import { ProductImage, type ImageSource } from './ProductImage';

/** Save toggle: fill + light haptic + small spring. Auth gating happens in the caller (requireAuth). */
export function FavoriteButton({ saved, onToggle, size = 34, label = 'Save' }: { saved: boolean; onToggle: () => void; size?: number; label?: string }) {
  const { colors } = useTheme();
  const scale = useSharedValue(1);
  const anim = useAnimatedStyle(() => ({ transform: [{ scale: scale.get() }] }));
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected: saved }}
      hitSlop={6}
      onPress={() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
        scale.set(withSequence(withSpring(1.18, { duration: 120 }), withSpring(1, { duration: 220 })));
        onToggle();
      }}
      style={[styles.fav, { width: size, height: size, borderRadius: size / 2, backgroundColor: colors.glass }]}>
      <Animated.View style={anim}>
        <Icon name="heart" filled={saved} size={size * 0.5} color={colors.textPrimary} />
      </Animated.View>
    </Pressable>
  );
}

export type DealCardData = {
  id: string;
  brand: string;
  name: string;
  image: ImageSource;
  retailer: string;
  /** D1: `check_price` offers never show a number (e.g. Amazon without compliant live pricing). */
  priceDisplay: PriceDisplayMode;
  priceCents: number | null;
  referenceCents: number | null;
  badge: DealBadgeLabel | null;
  meta?: string;
  sponsoredBy?: string;
};

export function DealCard({
  deal,
  width,
  saved,
  onToggleSave,
  onPress,
}: {
  deal: DealCardData;
  width: number;
  /** Omit to hide the save heart (e.g. before saving is available). */
  saved?: boolean;
  onToggleSave?: () => void;
  onPress?: () => void;
}) {
  const { colors } = useTheme();
  const showPrice = deal.priceDisplay === 'show' && deal.priceCents != null;
  const pct = showPrice && deal.referenceCents ? percentOff(deal.priceCents!, deal.referenceCents) : null;
  return (
    <View style={{ width }}>
      <Pressable accessibilityRole="button" accessibilityLabel={`${deal.brand} ${deal.name}`} onPress={onPress} style={({ pressed }) => ({ gap: 8, opacity: pressed ? 0.85 : 1 })}>
        <ProductImage source={deal.image} width={width}>
          {deal.badge && (
            <View style={styles.badge}>
              <DealBadge label={deal.badge} />
            </View>
          )}
        </ProductImage>
        <View style={{ gap: 2, paddingHorizontal: 2 }}>
          <Text variant="caption" weight="600" tone="secondary">
            {deal.sponsoredBy ? `Sponsored · ${deal.sponsoredBy}` : deal.brand}
          </Text>
          <Text variant="subhead" style={{ lineHeight: 19 }} numberOfLines={2}>
            {deal.name}
          </Text>
          {showPrice ? (
            <View style={styles.priceRow}>
              <Text variant="priceCard" numeric>
                {formatPrice(deal.priceCents!)}
              </Text>
              {pct != null && (
                <Text variant="footnote" tone="tertiary" strike numeric>
                  {formatPrice(deal.referenceCents!)}
                </Text>
              )}
              {pct != null && (
                <View style={{ marginLeft: 'auto' }}>
                  <DiscountPill pct={pct} />
                </View>
              )}
            </View>
          ) : (
            <View style={[styles.priceRow, { gap: 4 }]}>
              <Text variant="subhead" weight="700">
                Check price
              </Text>
              <Icon name="external" size={12} color={colors.textPrimary} />
            </View>
          )}
          <Text variant="caption" weight="400" tone="secondary" numberOfLines={1}>
            {deal.meta ?? deal.retailer}
          </Text>
        </View>
      </Pressable>
      {onToggleSave && (
        <View style={styles.favPos}>
          <FavoriteButton saved={!!saved} onToggle={onToggleSave} />
        </View>
      )}
    </View>
  );
}

export type ListingCardData = {
  id: string;
  title: string;
  image: ImageSource;
  conditionLabel: string;
  askCents: number;
  bestNewCents: number | null;
  areaLabel: string;
  distance: string;
  status?: 'pending' | 'sold';
};

export function ListingCard({
  listing,
  width,
  saved,
  onToggleSave,
  onPress,
}: {
  listing: ListingCardData;
  width: number;
  saved: boolean;
  onToggleSave: () => void;
  onPress?: () => void;
}) {
  const { colors } = useTheme();
  return (
    <View style={{ width }}>
      <Pressable accessibilityRole="button" accessibilityLabel={listing.title} onPress={onPress} style={({ pressed }) => ({ gap: 5, opacity: pressed ? 0.85 : 1 })}>
        <ProductImage source={listing.image} width={width} aspectRatio={width / (width * 1.1)}>
          <View style={[styles.cond, { backgroundColor: colors.background }]}>
            <Text variant="caption" weight="600" style={{ fontSize: 11 }}>
              {listing.conditionLabel}
            </Text>
          </View>
          {listing.status && (
            <View style={styles.badge}>
              <View style={[styles.cond, { position: 'relative', left: 0, bottom: 0, backgroundColor: colors.interactive }]}>
                <Text variant="badge" style={{ fontSize: 10, color: colors.onInteractive }}>
                  {listing.status.toUpperCase()}
                </Text>
              </View>
            </View>
          )}
        </ProductImage>
        <View style={[styles.priceRow, { paddingTop: 3 }]}>
          <Text variant="priceCard" numeric>
            {formatPrice(listing.askCents)}
          </Text>
          {listing.bestNewCents != null && (
            <Text variant="caption" weight="400" tone="secondary" numeric>
              New {formatPrice(listing.bestNewCents)}
            </Text>
          )}
        </View>
        <Text variant="subhead" style={{ lineHeight: 19 }} numberOfLines={2}>
          {listing.title}
        </Text>
        <Text variant="caption" weight="400" tone="secondary" numeric>
          {listing.areaLabel} · {listing.distance}
        </Text>
      </Pressable>
      <View style={styles.favPos}>
        <FavoriteButton saved={saved} onToggle={onToggleSave} label="Save listing" />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  fav: { alignItems: 'center', justifyContent: 'center' },
  favPos: { position: 'absolute', top: 8, right: 8 },
  badge: { position: 'absolute', top: 8, left: 8 },
  cond: { position: 'absolute', left: 8, bottom: 8, paddingHorizontal: 7, paddingVertical: 3, borderRadius: 6 },
  priceRow: { flexDirection: 'row', alignItems: 'baseline', gap: 6, marginTop: 2 },
});
