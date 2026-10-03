import { formatPrice, radius } from '@pickledeals/shared';
import { useQueryClient } from '@tanstack/react-query';
import * as Haptics from 'expo-haptics';
import { router, type Href } from 'expo-router';
import { useState } from 'react';
import { Alert, Pressable, StyleSheet, View } from 'react-native';

import { ConditionBadge, ProductImage } from '@/commerce';
import { useTheme } from '@/design/theme';
import { useCategories } from '@/features/catalog/hooks';
import { Icon, Text } from '@/ui';

import { publishListing, type PublishPayload } from '../api';
import { usePriceGuide, useSellDraft } from '../hooks';
import { SellFrame } from './SellFrame';

/** Step 6 — preview exactly what buyers see, then publish. Matching pre-owned alerts fire server-side. */
export default function SellPreviewStep() {
  const { colors } = useTheme();
  const qc = useQueryClient();
  const { draft, reset } = useSellDraft();
  const categories = useCategories();
  const guide = usePriceGuide(draft.product?.variantId).data;
  const [publishing, setPublishing] = useState(false);

  const photos = draft.photos.filter((p) => p.path);
  const title = draft.product ? [draft.product.brand, draft.product.name, draft.product.variantLabel].filter(Boolean).join(' ') : [draft.custom?.brand, draft.custom?.title].filter(Boolean).join(' ');
  const handover = draft.pickup && draft.ships ? 'Pickup or ships' : draft.pickup ? 'Local pickup' : 'Ships';
  const bestNew = guide?.bestNewCents ?? null;

  const checks: { text: string; edit?: Href }[] = [
    { text: draft.product ? `Linked to catalog: ${[draft.product.name, draft.product.variantLabel].filter(Boolean).join(' ')}` : 'Custom item — we may link it to the catalog later', edit: '/sell' },
    { text: `${photos.length} ${photos.length === 1 ? 'photo' : 'photos'} · cover set`, edit: '/sell/photos' },
    {
      text: draft.acceptsOffers ? `Offers on${draft.hideBelowCents ? ` · hidden below ${formatPrice(draft.hideBelowCents)}` : ''}` : 'Offers off',
      edit: '/sell/price',
    },
    { text: 'Approximate location only', edit: '/sell/details' },
    { text: 'Shoppers with matching price alerts get notified' },
  ];

  const publish = async () => {
    if (!draft.condition || draft.priceCents == null || !draft.location) return;
    const payload: PublishPayload = {
      id: draft.id,
      condition: draft.condition,
      price_cents: draft.priceCents,
      accepts_offers: draft.acceptsOffers,
      hide_offers_below_cents: draft.acceptsOffers && draft.hideBelowCents ? draft.hideBelowCents : undefined,
      description: draft.description.trim(),
      pickup: draft.pickup,
      ships: draft.ships,
      images: photos.map((p) => ({ path: p.path!, width: p.width, height: p.height })),
      location: { lat: draft.location.lat, lng: draft.location.lng, area_label: draft.location.label, postal_code: draft.location.postalCode ?? undefined },
      ...(draft.product
        ? { product_id: draft.product.id, variant_id: draft.product.variantId ?? undefined }
        : {
            custom_title: draft.custom!.title,
            custom_brand_text: draft.custom!.brand || undefined,
            category_id: categories.data?.find((c) => c.slug === draft.custom!.categorySlug)?.id,
          }),
    };
    setPublishing(true);
    try {
      const id = await publishListing(payload);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      await Promise.all([qc.invalidateQueries({ queryKey: ['market'] }), qc.invalidateQueries({ queryKey: ['me'] })]);
      reset();
      router.dismissAll();
      router.navigate({ pathname: '/market/listing/[id]', params: { id } });
    } catch (e) {
      Alert.alert('Couldn’t publish', e instanceof Error ? e.message : 'Check your connection and try again.');
    } finally {
      setPublishing(false);
    }
  };

  return (
    <SellFrame
      step={6}
      heading="Preview"
      ctaLabel="Publish listing"
      ctaLoading={publishing}
      ctaDisabled={!photos.length || !draft.condition || draft.priceCents == null || !draft.location || (!draft.product && !categories.data)}
      onContinue={publish}
      footer={
        <Text variant="caption" weight="400" tone="secondary" align="center">
          Free. You can edit, mark pending or sold any time.
        </Text>
      }>
      <Text variant="footnote" weight="600" tone="secondary">
        This is how buyers will see it
      </Text>
      <View style={{ borderRadius: radius.hero, borderWidth: 1, borderColor: colors.border, overflow: 'hidden' }}>
        {photos[0] && (
          <ProductImage source={{ kind: 'remote', uri: photos[0].localUri, isCutout: false, alt: title }} aspectRatio={1.2} round={0}>
            {photos.length > 1 && (
              <View style={[styles.count, { backgroundColor: colors.background }]}>
                <Text variant="caption" weight="700" numeric>
                  1 / {photos.length}
                </Text>
              </View>
            )}
          </ProductImage>
        )}
        <View style={{ padding: 16, gap: 14 }}>
          <View style={{ gap: 4 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <Text variant="priceLarge" style={{ fontSize: 32, lineHeight: 36 }} numeric>
                {draft.priceCents != null ? formatPrice(draft.priceCents) : '—'}
              </Text>
              {draft.condition && <ConditionBadge condition={draft.condition} />}
            </View>
            <Text variant="title3" weight="700">
              {title}
            </Text>
            <Text variant="subhead" weight="400" tone="secondary">
              {draft.location?.label} · {handover}
            </Text>
          </View>
          {bestNew != null && draft.priceCents != null && (
            <View style={[styles.split, { backgroundColor: colors.surface }]}>
              <View style={styles.cell}>
                <Text variant="caption" weight="400" tone="secondary">
                  Your price
                </Text>
                <Text variant="title3" weight="700" numeric>
                  {formatPrice(draft.priceCents)}
                </Text>
              </View>
              <View style={[styles.cell, { borderLeftWidth: 1, borderLeftColor: colors.background }]}>
                <Text variant="caption" weight="400" tone="secondary">
                  Best new
                </Text>
                <Text variant="title3" weight="700" numeric>
                  {formatPrice(bestNew)}
                </Text>
              </View>
            </View>
          )}
          {!!draft.description.trim() && (
            <Text variant="subhead" weight="400" style={{ lineHeight: 22 }}>
              {draft.description.trim()}
            </Text>
          )}
        </View>
      </View>

      <View>
        {checks.map((c) => (
          <View key={c.text} style={[styles.check, { borderBottomColor: colors.separator }]}>
            <View style={[styles.tick, { backgroundColor: colors.interactive }]}>
              <Icon name="check" size={12} color={colors.onInteractive} weight="bold" />
            </View>
            <Text variant="subhead" weight="400" style={{ flex: 1 }}>
              {c.text}
            </Text>
            {c.edit && (
              <Pressable accessibilityRole="button" accessibilityLabel={`Edit: ${c.text}`} hitSlop={8} onPress={() => router.navigate(c.edit!)}>
                <Text variant="subhead" weight="600" tone="secondary">
                  Edit
                </Text>
              </Pressable>
            )}
          </View>
        ))}
      </View>
    </SellFrame>
  );
}

const styles = StyleSheet.create({
  count: { position: 'absolute', right: 12, bottom: 12, paddingHorizontal: 9, paddingVertical: 4, borderRadius: 10 },
  split: { flexDirection: 'row', borderRadius: 14 },
  cell: { flex: 1, paddingVertical: 10, paddingHorizontal: 12 },
  check: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, borderBottomWidth: 1 },
  tick: { width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
});
