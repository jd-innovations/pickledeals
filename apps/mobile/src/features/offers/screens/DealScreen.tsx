import { formatAgo, formatEndsIn, formatPrice, radius } from '@pickledeals/shared';
import * as Clipboard from 'expo-clipboard';
import * as Haptics from 'expo-haptics';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { ScrollView, View } from 'react-native';

import { FavoriteButton, PriceBreakdown, ProductGallery, PromoCodeRow, StickyDealBar } from '@/commerce';
import { useTheme } from '@/design/theme';
import { useSavedIds, useToggleSave } from '@/features/alerts/hooks';
import { SaveAlertButtons } from '@/features/alerts/SaveAlertButtons';
import { galleryImages, useProduct, useProductSlug } from '@/features/catalog/hooks';
import { Chip, ErrorState, Group, Icon, ListRow, Skeleton, Text } from '@/ui';

import { AFFILIATE_DISCLOSURE, apiPriceDisclaimer, isApiPrice, ownershipDisclosure, priceAsOf, promoDetail, shippingLabel, shippingValue, shipsFromLabel } from '../format';
import { openDeal, useLivePromos, useOffer } from '../hooks';

/** Deal detail (design: "Deal detail (promo code)"): one offer, its code and what you pay. */
export default function DealScreen() {
  // `deal` is passed from deal cards, so the heart here is the same save as the card's heart.
  const { id = '', deal } = useLocalSearchParams<{ id: string; deal?: string }>();
  const { colors } = useTheme();
  const saved = useSavedIds();
  const toggleSave = useToggleSave();
  const offer = useOffer(id);
  const slug = useProductSlug(offer.data?.productId);
  const { data: product } = useProduct(slug.data ?? '');
  const promos = useLivePromos(offer.data ? [offer.data.retailer.slug] : []);

  // No row (PGRST116) means the offer is gone; any other error is a failed fetch, and a cached copy beats an error.
  if (offer.isError && (offer.error as { code?: string }).code === 'PGRST116')
    return <ErrorState title="This offer has ended" message="It’s no longer listed. Check the product for current offers." onRetry={() => router.back()} />;
  if (offer.isError && !offer.data)
    return <ErrorState title="Couldn’t load this deal" message="Check your connection and try again." onRetry={() => offer.refetch()} />;
  const o = offer.data;
  const variant = product?.variants.find((v) => v.id === o?.variantId);
  const msrp = variant?.msrpCents ?? product?.msrpCents ?? null;
  const promo = o?.promo ? promos.data?.find((p) => p.id === o.promo!.id) : undefined;
  const checkPrice = o?.priceDisplay === 'check_price';
  // Deal pages opened from a deal save the deal; others (e.g. from All offers) save the product.
  const saveTarget = deal ? { kind: 'deal' as const, id: deal } : product ? { kind: 'product' as const, id: product.id } : null;
  const isSaved = !!saveTarget && (saveTarget.kind === 'deal' ? saved.deals : saved.products).has(saveTarget.id);

  const getDeal = async () => {
    if (!o) return;
    if (o.promo) {
      await Clipboard.setStringAsync(o.promo.code);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    }
    openDeal(o.offerId, checkPrice ? 'deal_check_price' : 'deal_detail', o.promo?.id);
  };

  const title =
    !product || !o ? '' : o.promo ? `${product.name} — extra ${formatPrice(o.promo.discountCents)} off with code` : `${product.name} at ${o.retailer.name}`;

  return (
    <View style={{ flex: 1 }}>
      <Stack.Screen
        options={{
          title: '',
          headerRight: () =>
            saveTarget ? (
              <FavoriteButton saved={isSaved} label={isSaved ? 'Saved' : 'Save'} onToggle={() => toggleSave(saveTarget.kind, saveTarget.id, isSaved)} />
            ) : null,
        }}
      />
      <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={{ paddingBottom: 140, gap: 18 }}>
        {!o || !product ? (
          <View style={{ padding: 16, gap: 12 }}>
            <Skeleton height={240} round={radius.hero} />
            <Skeleton width="70%" height={22} />
          </View>
        ) : (
          <>
            <View style={{ paddingHorizontal: 16 }}>
              {/* Design's wide hero; photos shown whole (not cropped), swipeable, tap for full screen. */}
              <ProductGallery images={galleryImages(product)} aspectRatio={1.4} padding={28} fit="contain" />
            </View>
            <View style={{ paddingHorizontal: 16, gap: 6 }}>
              <Text variant="footnote" weight="700" tone="secondary">
                {product.brand.name} · {product.category.name}
                {variant && product.variants.length > 1 ? ` · ${variant.label}` : ''}
              </Text>
              <Text variant="title1">{title}</Text>
              {promo && (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Icon name="clock" size={13} color={colors.textSecondary} />
                  <Text variant="footnote" tone="secondary">
                    {[promo.endsAt ? formatEndsIn(promo.endsAt) : null, `verified ${formatAgo(promo.verifiedAt)}`].filter(Boolean).join(' · ')}
                  </Text>
                </View>
              )}
            </View>

            <View style={{ paddingHorizontal: 16 }}>
              {checkPrice ? (
                <View style={{ padding: 14, borderRadius: radius.card, backgroundColor: colors.surface, gap: 4 }}>
                  <Text variant="headline">Price shown at {o.retailer.name}</Text>
                  <Text variant="footnote" tone="secondary">
                    {o.retailer.name} prices change often, so we link to the current price instead of showing a number.
                  </Text>
                </View>
              ) : (
                <PriceBreakdown
                  rows={[
                    ...(msrp != null && msrp > (o.priceCents ?? 0) ? [{ label: 'List price', value: formatPrice(msrp), strike: true }] : []),
                    { label: `Price at ${o.retailer.name}`, value: formatPrice(o.priceCents!) },
                    ...(o.promo ? [{ label: `Code ${o.promo.code}`, value: `−${formatPrice(o.promo.discountCents)}` }] : []),
                  ]}
                  totalCents={o.deliveredCents!}
                  totalNote={o.shippingCents === 0 ? undefined : '+ shipping'}
                  shipping={shippingValue(o)}
                  referenceCents={msrp}
                />
              )}
              {(isApiPrice(o) || o.shipsFrom) && (
                <Text variant="footnote" tone="secondary" numeric style={{ paddingTop: 8 }}>
                  {[isApiPrice(o) ? priceAsOf(o) : null, shipsFromLabel(o)].filter(Boolean).join(' · ')}
                </Text>
              )}
            </View>

            {o.promo && (
              <View style={{ paddingHorizontal: 16 }}>
                <PromoCodeRow
                  title={promo?.title ?? `Code ${o.promo.code}`}
                  detail={[promoDetail(o, promo), promo ? `verified ${formatAgo(promo.verifiedAt)}` : null, promo?.isExclusive ? 'PickleDeals exclusive' : null]
                    .filter(Boolean)
                    .join(' · ')}
                  code={o.promo.code}
                />
              </View>
            )}

            {saveTarget && (
              <View style={{ paddingHorizontal: 16 }}>
                <SaveAlertButtons save={saveTarget} product={product} variantId={o.variantId} showAlert={!o.trackingExcluded} />
              </View>
            )}

            {o.sizes.length > 0 && (
              <View style={{ paddingHorizontal: 16, gap: 8 }}>
                <Text variant="caption" weight="700" tone="secondary" style={{ letterSpacing: 0.6 }}>
                  SIZES IN STOCK
                </Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                  {o.sizes.map((s) => (
                    <Chip key={s} label={s} outlined />
                  ))}
                </View>
              </View>
            )}

            <View style={{ paddingHorizontal: 16 }}>
              <Group>
                <ListRow
                  title={`Compare all offers for this ${product.category.name === 'Shoes' ? 'shoe' : 'product'}`}
                  onPress={() => router.push({ pathname: '/deals/product/[slug]/offers', params: { slug: product.slug, variant: o.variantId } })}
                />
                <ListRow
                  title={`${product.brand.name} ${product.name}`}
                  onPress={() => router.push({ pathname: '/deals/product/[slug]', params: { slug: product.slug } })}
                  last
                />
              </Group>
            </View>

            <View style={{ paddingHorizontal: 16 }}>
              <Text variant="caption" weight="400" tone="tertiary">
                Opens {o.retailer.name}.{o.promo ? (o.codeAutoApplied ? ' The code is applied at checkout, and copied in case you need it.' : ' The code is copied for you.') : ''} PickleDeals doesn’t handle checkout.{' '}
                {AFFILIATE_DISCLOSURE.replace('Affiliate links — ', '')}
                {ownershipDisclosure([o]) ? ` ${ownershipDisclosure([o])}` : ''}
                {apiPriceDisclaimer([o]) ? ` ${apiPriceDisclaimer([o])}` : ''}
              </Text>
            </View>
          </>
        )}
      </ScrollView>

      {o && product && (
        <StickyDealBar
          title={checkPrice ? `Check price at ${o.retailer.name}` : formatPrice(o.deliveredCents!)}
          subtitle={checkPrice ? undefined : [o.promo ? 'with code' : o.retailer.name, shippingLabel(o)].join(' · ')}
          actionLabel={checkPrice ? 'Open' : 'Get deal'}
          onAction={getDeal}
        />
      )}
    </View>
  );
}
