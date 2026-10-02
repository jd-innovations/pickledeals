import { formatPrice, radius } from '@pickledeals/shared';
import { Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, Share, View } from 'react-native';

import { ProductImage } from '@/commerce';
import { Chip, ChipRow, Group, IconButton, ListRow, Skeleton, Text } from '@/ui';

import { LoadError, openBrand, openCategory } from '../components';
import { productImage, useProduct } from '../hooks';

const humanize = (key: string) => key.replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase());

/**
 * Product (catalog view, Phase 2): identity, variants and specs. Phase 3 adds offers, best price,
 * price history and alerts on top of this screen.
 */
export default function ProductScreen() {
  const { slug = '' } = useLocalSearchParams<{ slug: string }>();
  const { data: p, isError, refetch } = useProduct(slug);
  const [variantId, setVariantId] = useState<string | null>(null);

  const variant = p?.variants.find((v) => v.id === variantId) ?? p?.variants.find((v) => v.isDefault) ?? p?.variants[0];
  const msrp = variant?.msrpCents ?? p?.msrpCents ?? null;
  const showVariants = (p?.variants.length ?? 0) > 1;
  const specs = Object.entries(p?.specs ?? {});

  const share = () => p && Share.share({ message: `${p.brand.name} ${p.name} on PickleDeals` }).catch(() => {});

  return (
    <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={{ paddingBottom: 120, gap: 18 }}>
      <Stack.Screen
        options={{
          title: '',
          headerLargeTitle: false,
          headerRight: () => <IconButton icon="share" label="Share" size={34} onPress={share} />,
        }}
      />
      {isError ? (
        <LoadError onRetry={refetch} />
      ) : !p ? (
        <View style={{ paddingHorizontal: 16, gap: 12 }}>
          <Skeleton height={340} round={radius.hero} />
          <Skeleton width="40%" height={14} />
          <Skeleton width="80%" height={24} />
        </View>
      ) : (
        <>
          <View style={{ paddingHorizontal: 16 }}>
            <ProductImage source={productImage(p)} round={radius.hero} padding={36} />
          </View>

          <View style={{ paddingHorizontal: 16, gap: 6 }}>
            <Pressable accessibilityRole="link" onPress={() => openBrand(p.brand.slug)} hitSlop={6} style={{ alignSelf: 'flex-start' }}>
              <Text variant="footnote" weight="700" tone="secondary">
                {p.brand.name} · {p.category.name}
              </Text>
            </Pressable>
            <Text variant="title1">
              {p.name}
              {variant && showVariants ? ` ${variant.label}` : ''}
            </Text>
            {msrp != null && (
              <Text variant="subhead" weight="400" tone="secondary" numeric>
                MSRP {formatPrice(msrp)}
              </Text>
            )}
            {p.status === 'discontinued' && (
              <Text variant="footnote" weight="600">
                Discontinued — available pre-owned
              </Text>
            )}
          </View>

          {showVariants && (
            <View style={{ gap: 8 }}>
              <Text variant="caption" weight="700" tone="secondary" style={{ paddingHorizontal: 16, letterSpacing: 0.6 }}>
                {Object.keys(variant?.attributes ?? {})[0] === 'pack_size' ? 'PACK' : 'VERSION'}
              </Text>
              <ChipRow>
                {p.variants.map((v) => (
                  <Chip key={v.id} label={v.label} selected={v.id === variant?.id} onPress={() => setVariantId(v.id)} />
                ))}
              </ChipRow>
            </View>
          )}

          <View style={{ paddingHorizontal: 16 }}>
            <Text variant="footnote" weight="400" tone="secondary">
              Retailer prices, price history and price alerts for this product are coming soon.
            </Text>
          </View>

          {specs.length > 0 && (
            <View style={{ paddingHorizontal: 16 }}>
              <Group label="Specs">
                {specs.map(([k, v], i) => (
                  <ListRow key={k} title={humanize(k)} value={v} last={i === specs.length - 1} />
                ))}
              </Group>
            </View>
          )}

          <View style={{ paddingHorizontal: 16 }}>
            <Group>
              <ListRow title={`More from ${p.brand.name}`} onPress={() => openBrand(p.brand.slug)} />
              <ListRow title={`All ${p.category.name.toLowerCase()}`} onPress={() => openCategory(p.category.slug)} last />
            </Group>
          </View>
        </>
      )}
    </ScrollView>
  );
}
