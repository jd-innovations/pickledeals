import { formatPrice, radius } from '@pickledeals/shared';
import * as Haptics from 'expo-haptics';
import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { ProductImage } from '@/commerce';
import { useTheme } from '@/design/theme';
import { productImage, useProduct } from '@/features/catalog/hooks';
import { usePriceHistory, useProductOffers } from '@/features/offers/hooks';
import { Button, Chip, Icon, Skeleton, Text, Toggle } from '@/ui';

import { useAlerts, useMeMutations } from '../hooks';
import { ensurePushRegistered } from '../push';

const STEP = 500; // $5

/** Price alert (formSheet, design: "Set price alert"). One notification per drop. */
export default function PriceAlertSheet() {
  const { colors } = useTheme();
  const { slug = '', variant: variantParam } = useLocalSearchParams<{ slug: string; variant?: string }>();
  const { data: product } = useProduct(slug);
  const offers = useProductOffers(product?.id);
  const alerts = useAlerts();
  const { saveAlert, deleteAlert } = useMeMutations();

  const variant = product?.variants.find((v) => v.id === variantParam) ?? null;
  const scoped = (product?.variants.length ?? 0) > 1 && variant;
  const stats = offers.data?.stats.find((s) => s.variantId === (variant?.id ?? product?.variants.find((v) => v.isDefault)?.id));
  const history = usePriceHistory(stats?.variantId, 90);
  const now = stats?.bestDeliveredCents ?? null;
  const existing = alerts.data?.find((a) => a.product.id === product?.id && (a.variant?.id ?? null) === (scoped ? variant!.id : null));

  const suggested = useMemo(() => {
    if (existing) return existing.targetCents;
    if (now == null) return null;
    const tenOff = Math.floor((now * 0.9) / STEP) * STEP;
    return Math.max(STEP, Math.min(tenOff, stats?.low90dCents ?? tenOff));
  }, [existing, now, stats?.low90dCents]);
  const [target, setTarget] = useState<number | null>(null);
  const value = target ?? suggested ?? 5000;
  const [usedChoice, setIncludeUsed] = useState<boolean | null>(null);
  const includeUsed = usedChoice ?? existing?.includeUsed ?? true;

  const timesReached = (history.data ?? []).filter((d) => d.cents <= value).length;
  const quick = [
    stats?.low90dCents ? { label: `${formatPrice(stats.low90dCents)} · 90-day low`, cents: stats.low90dCents } : null,
    now ? { label: formatPrice(Math.floor((now * 0.85) / STEP) * STEP), cents: Math.floor((now * 0.85) / STEP) * STEP } : null,
    now ? { label: formatPrice(Math.floor((now * 0.75) / STEP) * STEP), cents: Math.floor((now * 0.75) / STEP) * STEP } : null,
  ].filter((x): x is { label: string; cents: number } => !!x && x.cents > 0);

  const bump = (delta: number) => {
    Haptics.selectionAsync().catch(() => {});
    setTarget(Math.max(STEP, value + delta));
  };

  const save = async () => {
    if (!product) return;
    await saveAlert.mutateAsync({ id: existing?.id, productId: product.id, variantId: scoped ? variant!.id : null, targetCents: value, includeUsed });
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    router.back();
    // Ask for notification permission in context, right after the first alert.
    if (!existing) {
      const result = await ensurePushRegistered({ ask: true });
      if (result === 'denied') {
        Alert.alert('Alert saved', 'Notifications are off for PickleDeals, so we’ll show price drops in Alerts › Activity. You can turn them on in Settings.');
      }
    }
  };

  if (!product) {
    return (
      <View style={{ padding: 20, gap: 12 }}>
        <Skeleton height={60} round={14} />
        <Skeleton height={80} round={14} />
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={{ padding: 20, gap: 20 }}>
      <View style={styles.header}>
        <Pressable accessibilityRole="button" hitSlop={10} onPress={() => router.back()}>
          <Text variant="body">Cancel</Text>
        </Pressable>
        <Text variant="headline">Price alert</Text>
        <View style={{ width: 52 }} />
      </View>

      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <ProductImage source={productImage(product)} width={52} round={12} padding={5} />
        <View style={{ flex: 1, gap: 2 }}>
          <Text variant="subhead" weight="700" numberOfLines={1}>
            {product.brand.name} {product.name}
            {scoped ? ` ${variant!.label}` : ''}
          </Text>
          <Text variant="footnote" tone="secondary" numeric>
            {[now != null ? `Now ${formatPrice(now)}` : 'No retailer price yet', stats?.low90dCents ? `90-day low ${formatPrice(stats.low90dCents)}` : null].filter(Boolean).join(' · ')}
          </Text>
        </View>
      </View>

      <View style={{ gap: 10, alignItems: 'center' }}>
        <Text variant="subhead" tone="secondary" style={{ alignSelf: 'flex-start' }}>
          Notify me when it drops below
        </Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 20 }}>
          <Pressable accessibilityRole="button" accessibilityLabel="Lower target by $5" onPress={() => bump(-STEP)} style={[styles.step, { backgroundColor: colors.surface }]}>
            <Text variant="title2">−</Text>
          </Pressable>
          <Text variant="priceDisplay" numeric accessibilityLabel={`Target ${formatPrice(value)}`}>
            {formatPrice(value)}
          </Text>
          <Pressable accessibilityRole="button" accessibilityLabel="Raise target by $5" onPress={() => bump(STEP)} style={[styles.step, { backgroundColor: colors.surface }]}>
            <Icon name="plus" size={18} color={colors.textPrimary} />
          </Pressable>
        </View>
        <Text variant="footnote" tone="secondary" numeric>
          {now != null && value < now ? `${formatPrice(now - value)} below today` : now != null ? 'At or above today’s price — you’ll hear on the next drop' : 'We’ll tell you when a retailer lists it below this'}
          {history.data?.length ? ` · reached on ${timesReached} of the last ${history.data.length} days` : ''}
        </Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'center' }}>
          {quick.map((q) => (
            <Chip key={q.label} label={q.label} outlined selected={value === q.cents} onPress={() => setTarget(q.cents)} />
          ))}
        </View>
      </View>

      <View style={[styles.option, { backgroundColor: colors.surface }]}>
        <View style={{ flex: 1, gap: 2 }}>
          <Text variant="subhead" weight="700">
            New offers
          </Text>
          <Text variant="caption" weight="400" tone="secondary">
            Every retailer except Amazon, including verified codes and shipping.
          </Text>
        </View>
        <Icon name="check" size={16} color={colors.textPrimary} />
      </View>
      <View style={[styles.option, { backgroundColor: colors.surface, marginTop: -12 }]}>
        <View style={{ flex: 1, gap: 2 }}>
          <Text variant="subhead" weight="700">
            Pre-owned listings
          </Text>
          <Text variant="caption" weight="400" tone="secondary">
            Near your saved area, or ones that ship.
          </Text>
        </View>
        <Toggle accessibilityLabel="Pre-owned listings" value={includeUsed} onValueChange={setIncludeUsed} />
      </View>

      <Button label={existing ? 'Update alert' : 'Create alert'} fullWidth loading={saveAlert.isPending} onPress={save} />
      {existing && (
        <Button
          label="Delete alert"
          variant="link"
          size="sm"
          onPress={async () => {
            await deleteAlert.mutateAsync(existing.id);
            router.back();
          }}
        />
      )}
      <Text variant="caption" weight="400" tone="tertiary" align="center">
        One notification per drop. Edit or pause it in Alerts.
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  step: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
  option: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: radius.card },
});
