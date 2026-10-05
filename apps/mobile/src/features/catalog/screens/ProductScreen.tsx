import { formatPrice, percentOff, radius, spoken } from '@pickledeals/shared';
import * as Clipboard from 'expo-clipboard';
import * as Haptics from 'expo-haptics';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, Share, View } from 'react-native';

import { DealQualityMeter, DiscountPill, PriceBlock, PriceChart, ProductCard, ProductImage, RetailerRow, retailerMonogram, StickyDealBar } from '@/commerce';
import { useTheme } from '@/design/theme';
import { useSavedIds, useToggleSave } from '@/features/alerts/hooks';
import { useAuth } from '@/features/auth/authStore';
import { PreOwnedSection } from '@/features/market/PreOwned';
import type { RankedOffer } from '@/features/offers/api';
import {
  AFFILIATE_DISCLOSURE,
  UNTRACKED_NOTE,
  apiPriceDisclaimer,
  deltaLabel,
  isApiPrice,
  offerBreakdown,
  ownershipDisclosure,
  priceAsOf,
  qualityDetail,
  shippingLabel,
  shipsFromLabel,
} from '@/features/offers/format';
import { openDeal, usePriceHistory, useProductOffers } from '@/features/offers/hooks';
import { Button, Chip, ChipRow, Group, IconButton, ListRow, SectionHeader, Skeleton, Text } from '@/ui';

import { LoadError, openBrand, openCategory, openProduct, useGridCardWidth } from '../components';
import { productImage, useCategory, useProduct } from '../hooks';

const humanize = (key: string) => key.replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase());

/** Product detail (design: "Product detail (canonical)"). D1: check-price offers never show a number. */
export default function ProductScreen() {
  const { slug = '' } = useLocalSearchParams<{ slug: string }>();
  const { colors } = useTheme();
  const { data: p, isError, refetch } = useProduct(slug);
  const offersQuery = useProductOffers(p?.id);
  const [variantId, setVariantId] = useState<string | null>(null);

  const variant = p?.variants.find((v) => v.id === variantId) ?? p?.variants.find((v) => v.isDefault) ?? p?.variants[0];
  const msrp = variant?.msrpCents ?? p?.msrpCents ?? null;
  const offers = useMemo(() => (offersQuery.data?.offers ?? []).filter((o) => o.variantId === variant?.id), [offersQuery.data, variant?.id]);
  const stats = offersQuery.data?.stats.find((s) => s.variantId === variant?.id);
  const best = offers.find((o) => o.rank === 1) ?? null;
  const checkPriceOnly = !best ? offers.find((o) => o.priceDisplay === 'check_price') : undefined;
  // The hero card already shows the best offer (or the check-price retailer when nothing is priced).
  const others = offers.filter((o) => o !== best && o !== checkPriceOnly).slice(0, 3);
  const history = usePriceHistory(best ? variant?.id : undefined, 90);
  const showVariants = (p?.variants.length ?? 0) > 1;
  const specs = Object.entries(p?.specs ?? {});

  const saved = useSavedIds();
  const toggleSave = useToggleSave();
  const requireAuth = useAuth((st) => st.requireAuth);
  const isSaved = !!p && saved.products.has(p.id);
  const openAlert = () =>
    p && requireAuth('create_price_alert', () => router.push({ pathname: '/deals/price-alert', params: { slug: p.slug, variant: variant?.id ?? '' } }));
  // Alerts never track Amazon, so a product sold only there gets no Price alert button.
  const untrackedOnly = offers.length > 0 && offers.every((o) => o.trackingExcluded);
  const actions = p ? (
    <View style={{ flexDirection: 'row', gap: 10 }}>
      <Button
        label={isSaved ? 'Saved' : 'Save'}
        variant="secondary"
        size="md"
        icon="heart"
        style={{ flex: 1 }}
        onPress={() => toggleSave('product', p.id, isSaved)}
      />
      {!untrackedOnly && <Button label="Price alert" variant="secondary" size="md" icon="bell" style={{ flex: 1 }} onPress={openAlert} />}
    </View>
  ) : null;

  const share = () => p && Share.share({ message: `${p.brand.name} ${p.name} on PickleDeals` }).catch(() => {});
  const getDeal = async (o: RankedOffer, placement: string) => {
    if (o.promo) {
      await Clipboard.setStringAsync(o.promo.code);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    }
    openDeal(o.offerId, placement, o.promo?.id);
  };
  const openOffers = () => p && variant && router.push({ pathname: '/deals/product/[slug]/offers', params: { slug: p.slug, variant: variant.id } });
  const openHistory = () => p && variant && router.push({ pathname: '/deals/product/[slug]/history', params: { slug: p.slug, variant: variant.id } });

  return (
    <View style={{ flex: 1 }}>
      <Stack.Screen options={{ headerRight: () => <IconButton icon="share" label="Share" size={34} onPress={share} /> }} />
      <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={{ paddingBottom: best ? 140 : 120, gap: 20 }}>
        {isError && !p ? (
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
              {p.status === 'discontinued' && (
                <Text variant="footnote" weight="600">
                  Discontinued — available pre-owned
                </Text>
              )}
            </View>

            {showVariants && (
              <ChipRow>
                {p.variants.map((v) => {
                  const s = offersQuery.data?.stats.find((x) => x.variantId === v.id);
                  const price = s?.bestDeliveredCents;
                  return (
                    <Chip
                      key={v.id}
                      label={price ? `${v.label}  ${formatPrice(price)}` : v.label}
                      selected={v.id === variant?.id}
                      onPress={() => setVariantId(v.id)}
                    />
                  );
                })}
              </ChipRow>
            )}

            {/* Best price */}
            <View style={{ paddingHorizontal: 16 }}>
              {offersQuery.isPending ? (
                <Skeleton height={220} round={radius.hero} />
              ) : best && best.deliveredCents != null ? (
                <View style={{ padding: 16, borderRadius: radius.hero, backgroundColor: colors.surface, gap: 14 }}>
                  <PriceBlock
                    label={`BEST NEW PRICE · ${best.retailer.name.toUpperCase()}`}
                    priceCents={best.deliveredCents}
                    referenceCents={msrp && msrp > best.deliveredCents ? msrp : undefined}
                  />
                  <Text variant="footnote" tone="secondary" numeric>
                    {[
                      best.promo ? `with code ${best.promo.code}` : null,
                      shippingLabel(best),
                      best.inStock ? 'in stock' : 'out of stock',
                      best.shipsFrom ? `ships from ${best.shipsFrom}` : null,
                      isApiPrice(best) ? priceAsOf(best).toLowerCase() : null,
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </Text>
                  {stats?.quality && stats.bestOfferId === best.offerId && (
                    <View style={{ padding: 12, borderRadius: radius.card, backgroundColor: colors.surfaceElevated }}>
                      <DealQualityMeter quality={stats.quality} detail={qualityDetail(stats)} />
                    </View>
                  )}
                  <Button
                    label={best.promo ? `Copy ${best.promo.code} & get deal` : `Get deal at ${best.retailer.name}`}
                    icon="external"
                    iconPosition="trailing"
                    fullWidth
                    onPress={() => getDeal(best, 'product_best')}
                  />
                  {actions}
                  <Text variant="caption" weight="400" tone="tertiary">
                    {[AFFILIATE_DISCLOSURE, ownershipDisclosure([best, ...others]), apiPriceDisclaimer([best, ...others])].filter(Boolean).join(' ')}
                  </Text>
                </View>
              ) : checkPriceOnly ? (
                <View style={{ padding: 16, borderRadius: radius.hero, backgroundColor: colors.surface, gap: 12 }}>
                  <Text variant="badge" tone="secondary">
                    AVAILABLE AT {checkPriceOnly.retailer.name.toUpperCase()}
                  </Text>
                  <Text variant="subhead" weight="400" tone="secondary">
                    {checkPriceOnly.retailer.name} prices change often, so we show the current price on their site.
                  </Text>
                  <Button
                    label={`Check price at ${checkPriceOnly.retailer.name}`}
                    icon="external"
                    iconPosition="trailing"
                    fullWidth
                    onPress={() => openDeal(checkPriceOnly.offerId, 'product_check_price')}
                  />
                  {actions}
                </View>
              ) : (
                <View style={{ padding: 16, borderRadius: radius.hero, backgroundColor: colors.surface, gap: 4 }}>
                  <Text variant="headline">No retailer offers yet</Text>
                  <Text variant="footnote" tone="secondary">
                    {msrp != null ? `MSRP ${formatPrice(msrp)}. ` : ''}We’ll show prices here as retailers list this {showVariants ? 'version' : 'product'}.
                  </Text>
                  <View style={{ marginTop: 10 }}>{actions}</View>
                </View>
              )}
            </View>

            {others.length > 0 && (
              <View style={{ gap: 4 }}>
                <SectionHeader title="Other new offers" actionLabel="Compare all" onAction={openOffers} />
                <View>
                  {others.map((o, i) => (
                    <RetailerRow
                      key={o.offerId}
                      offer={{
                        retailer: o.retailer.name,
                        monogram: retailerMonogram(o.retailer.name),
                        detail:
                          o.priceDisplay === 'check_price'
                            ? 'Price shown at retailer'
                            : [o.inStock ? 'In stock' : 'Out of stock', offerBreakdown(o), shipsFromLabel(o), isApiPrice(o) ? priceAsOf(o).toLowerCase() : null]
                                .filter(Boolean)
                                .join(' · '),
                        priceCents: o.deliveredCents,
                        deltaLabel: deltaLabel(o, best?.deliveredCents ?? null),
                      }}
                      onPress={() =>
                        o.priceDisplay === 'check_price'
                          ? openDeal(o.offerId, 'product_check_price')
                          : router.push({ pathname: '/deals/offer/[id]', params: { id: o.offerId } })
                      }
                      last={i === others.length - 1}
                    />
                  ))}
                </View>
              </View>
            )}

            {best && stats && stats.historyDays >= 7 && (history.data?.length ?? 0) > 1 && (
              <View style={{ gap: 10 }}>
                <SectionHeader title="Price history" actionLabel="90 days" onAction={openHistory} />
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={spoken(
                    'Open price history',
                    (
                      [
                        ['now', stats.bestDeliveredCents],
                        ['typical', stats.typicalCents],
                        ['90-day low', stats.low90dCents],
                        ['all-time low', stats.lowAllTimeCents],
                      ] as const
                    )
                      .map(([label, cents]) => (cents != null ? `${label} ${formatPrice(cents)}` : null))
                      .filter(Boolean)
                      .join(', '),
                  )}
                  onPress={openHistory}
                  style={{ marginHorizontal: 16, padding: 14, borderRadius: radius.card, backgroundColor: colors.surface, gap: 12 }}>
                  <PriceChart points={history.data!} typicalCents={stats.typicalCents} height={100} />
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                    {[
                      ['Now', stats.bestDeliveredCents],
                      ['Typical', stats.typicalCents],
                      ['90-day low', stats.low90dCents],
                      ['All-time low', stats.lowAllTimeCents],
                    ].map(([label, cents]) => (
                      <View key={label as string} style={{ gap: 1 }}>
                        <Text variant="caption" weight="400" tone="secondary">
                          {label as string}
                        </Text>
                        <Text variant="subhead" weight="700" numeric>
                          {cents != null ? formatPrice(cents as number) : '—'}
                        </Text>
                      </View>
                    ))}
                  </View>
                  {offers.some((o) => o.trackingExcluded) && (
                    <Text variant="caption" weight="400" tone="tertiary">
                      {UNTRACKED_NOTE}
                    </Text>
                  )}
                </Pressable>
              </View>
            )}

            <PreOwnedSection productId={p.id} slug={p.slug} />

            {specs.length > 0 && (
              <View style={{ paddingHorizontal: 16 }}>
                <Group label="Specs">
                  {specs.map(([k, v], i) => (
                    <ListRow key={k} title={humanize(k)} value={v} last={i === specs.length - 1} />
                  ))}
                </Group>
              </View>
            )}

            <Similar categorySlug={p.category.slug} categoryName={p.category.name} excludeId={p.id} />

            <View style={{ paddingHorizontal: 16 }}>
              <Group>
                <ListRow title={`More from ${p.brand.name}`} onPress={() => openBrand(p.brand.slug)} />
                <ListRow title={`All ${p.category.name.toLowerCase()}`} onPress={() => openCategory(p.category.slug)} last />
              </Group>
            </View>
          </>
        )}
      </ScrollView>

      {best && best.deliveredCents != null && (
        <StickyDealBar
          title={
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Text variant="headline" weight="700" numeric>
                {formatPrice(best.deliveredCents)}
              </Text>
              {msrp && percentOff(best.deliveredCents, msrp) ? <DiscountPill pct={percentOff(best.deliveredCents, msrp)!} /> : null}
            </View>
          }
          subtitle={`${best.retailer.name} · lowest of ${offers.filter((o) => o.priceDisplay === 'show').length} ${offers.filter((o) => o.priceDisplay === 'show').length === 1 ? 'offer' : 'offers'}`}
          actionLabel="Get deal"
          onAction={() => getDeal(best, 'product_sticky')}
        />
      )}
    </View>
  );
}

function Similar({ categorySlug, categoryName, excludeId }: { categorySlug: string; categoryName: string; excludeId: string }) {
  const { data } = useCategory(categorySlug);
  const cardW = Math.min(useGridCardWidth(), 150);
  const items = (data?.products ?? []).filter((x) => x.id !== excludeId).slice(0, 10);
  if (items.length === 0) return null;
  return (
    <View style={{ gap: 12 }}>
      <SectionHeader title={`Similar ${categoryName.toLowerCase()}`} />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 12, paddingHorizontal: 16 }}>
        {items.map((x) => (
          <ProductCard
            key={x.id}
            width={cardW}
            product={{ slug: x.slug, brand: x.brand.name, name: x.name, image: productImage(x), msrpCents: x.msrpCents }}
            onPress={() => openProduct(x.slug)}
          />
        ))}
      </ScrollView>
    </View>
  );
}
