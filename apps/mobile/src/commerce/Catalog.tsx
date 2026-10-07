import { formatPrice, speakable, spoken } from '@pickledeals/shared';
import { Image } from 'expo-image';
import { Pressable, StyleSheet, View } from 'react-native';

import { useTheme } from '@/design/theme';
import { Icon, Text } from '@/ui';

import { ProductImage, type ImageSource } from './ProductImage';

/** Catalog visuals (Phase 2): product cards and rows, category tiles, brand marks and rows. */

export type ProductCardData = { slug: string; brand: string; name: string; image: ImageSource; msrpCents: number | null; priceCents?: number | null; meta?: string };

/** Grid card for catalog products. Prices from retailers replace the MSRP line once offers exist. */
export function ProductCard({ product, width, onPress }: { product: ProductCardData; width: number; onPress?: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={spoken(
        product.brand,
        product.name,
        product.priceCents != null ? formatPrice(product.priceCents) : product.msrpCents != null && `MSRP ${formatPrice(product.msrpCents)}`,
        product.meta && speakable(product.meta),
      )}
      onPress={onPress}
      style={({ pressed }) => ({ width, gap: 8, opacity: pressed ? 0.85 : 1 })}>
      <ProductImage source={product.image} width={width} />
      <View style={{ gap: 2, paddingHorizontal: 2 }}>
        <Text variant="caption" weight="600" tone="secondary" numberOfLines={1}>
          {product.brand}
        </Text>
        <Text variant="subhead" style={{ lineHeight: 19 }} numberOfLines={2}>
          {product.name}
        </Text>
        {product.priceCents != null ? (
          <Text variant="subhead" weight="700" numeric>
            {formatPrice(product.priceCents)}
          </Text>
        ) : product.msrpCents != null ? (
          <Text variant="footnote" tone="secondary" numeric>
            MSRP {formatPrice(product.msrpCents)}
          </Text>
        ) : null}
        {product.meta ? (
          <Text variant="caption" weight="400" tone="secondary" numberOfLines={1}>
            {product.meta}
          </Text>
        ) : null}
      </View>
    </Pressable>
  );
}

/** List row with a small image tile (Search suggestions, results). */
export function ProductRow({ title, meta, image, onPress, last }: { title: string; meta?: string; image: ImageSource; onPress?: () => void; last?: boolean }) {
  const { colors } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={spoken(title, meta && speakable(meta))}
      onPress={onPress}
      style={({ pressed }) => [styles.row, { backgroundColor: pressed ? colors.surfacePressed : 'transparent' }]}>
      <ProductImage source={image} width={44} round={12} padding={4} />
      <View style={[styles.rowBody, !last && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.separator }]}>
        <View style={{ flex: 1, gap: 2 }}>
          <Text variant="subhead" weight="700" numberOfLines={1}>
            {title}
          </Text>
          {meta ? (
            <Text variant="footnote" tone="secondary" numberOfLines={1} numeric>
              {meta}
            </Text>
          ) : null}
        </View>
        <Icon name="chevronRight" size={13} color={colors.textTertiary} weight="semibold" />
      </View>
    </Pressable>
  );
}

/** Browse › Categories tile: name top-left, count bottom-left, art bottom-right. */
export function CategoryTile({ name, count, image, width, onPress }: { name: string; count: string; image: ImageSource; width: number; onPress?: () => void }) {
  const { colors } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${name}, ${count}`}
      onPress={onPress}
      style={({ pressed }) => [styles.tile, { width, backgroundColor: pressed ? colors.surfacePressed : colors.surface }]}>
      <Text variant="headline" weight="700" numberOfLines={2} style={{ maxWidth: width * 0.62 }}>
        {name}
      </Text>
      <Text variant="caption" weight="400" tone="secondary" style={{ marginTop: 'auto' }} numeric>
        {count}
      </Text>
      <View style={styles.tileArt} pointerEvents="none">
        <ProductImage source={image} width={64} round={0} padding={0} style={{ backgroundColor: 'transparent' }} />
      </View>
    </Pressable>
  );
}

/** Short wordmark for brands without a logo: "JOOLA", "SLKRK", "CRBN". */
export function brandMonogram(name: string): string {
  const letters = name.toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (letters.length <= 5) return letters;
  return (letters[0] + letters.slice(1).replace(/[AEIOU]/g, '')).slice(0, 5);
}

export function BrandMark({ name, logoUri, size = 44 }: { name: string; logoUri?: string | null; size?: number }) {
  const { colors } = useTheme();
  const mono = brandMonogram(name);
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: colors.interactive,
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden',
      }}>
      {logoUri ? (
        <Image source={{ uri: logoUri }} contentFit="contain" style={{ width: size * 0.72, height: size * 0.72 }} />
      ) : (
        <Text style={{ color: colors.onInteractive, fontSize: size * (mono.length > 4 ? 0.2 : 0.24), fontWeight: '800', letterSpacing: -0.2 }}>{mono}</Text>
      )}
    </View>
  );
}

export function BrandRow({
  name,
  meta,
  logoUri,
  trailing,
  onPress,
  last,
}: {
  name: string;
  meta?: string;
  logoUri?: string | null;
  trailing?: string;
  onPress?: () => void;
  last?: boolean;
}) {
  const { colors } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={name}
      onPress={onPress}
      style={({ pressed }) => [styles.row, { backgroundColor: pressed ? colors.surfacePressed : 'transparent' }]}>
      <BrandMark name={name} logoUri={logoUri} />
      <View style={[styles.rowBody, !last && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.separator }]}>
        <View style={{ flex: 1, gap: 2 }}>
          <Text variant="subhead" weight="700" numberOfLines={1}>
            {name}
          </Text>
          {meta ? (
            <Text variant="footnote" tone="secondary" numeric>
              {meta}
            </Text>
          ) : null}
        </View>
        {trailing ? (
          <Text variant="footnote" tone="secondary">
            {trailing}
          </Text>
        ) : (
          <Icon name="chevronRight" size={13} color={colors.textTertiary} weight="semibold" />
        )}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingLeft: 16 },
  rowBody: { flex: 1, minHeight: 60, flexDirection: 'row', alignItems: 'center', gap: 8, paddingRight: 16, paddingVertical: 8 },
  tile: { height: 104, borderRadius: 18, padding: 12, overflow: 'hidden' },
  tileArt: { position: 'absolute', right: 6, bottom: 4 },
});
