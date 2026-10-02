import { formatAgo, formatPrice } from '@pickledeals/shared';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { ScrollView, View } from 'react-native';

import { RetailerOfferCard, retailerMonogram } from '@/commerce';
import { useProduct } from '@/features/catalog/hooks';
import { EmptyState, SegmentedControl, Skeleton, Text } from '@/ui';

import type { RankedOffer } from '../api';
import { offerBreakdown, stockLabel } from '../format';
import { openDeal, useProductOffers } from '../hooks';

type Mode = 'delivered' | 'item';

/** All offers compared (design). Ranked by what you pay; check-price offers are listed last (D1). */
export default function OffersScreen() {
  const { slug = '', variant: variantParam } = useLocalSearchParams<{ slug: string; variant?: string }>();
  const { data: product } = useProduct(slug);
  const { data, isPending } = useProductOffers(product?.id);
  const [mode, setMode] = useState<Mode>('delivered');

  const variant = product?.variants.find((v) => v.id === variantParam) ?? product?.variants.find((v) => v.isDefault);
  const offers = useMemo(() => {
    const list = (data?.offers ?? []).filter((o) => o.variantId === variant?.id);
    const priced = list.filter((o) => o.priceDisplay === 'show');
    const key = (o: RankedOffer) => (mode === 'delivered' ? o.deliveredCents! : o.priceCents!);
    return [...priced.sort((a, b) => key(a) - key(b) || (a.rank ?? 0) - (b.rank ?? 0)), ...list.filter((o) => o.priceDisplay === 'check_price')];
  }, [data, variant?.id, mode]);
  const bestValue = offers[0]?.priceDisplay === 'show' ? (mode === 'delivered' ? offers[0].deliveredCents : offers[0].priceCents) : null;

  return (
    <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={{ padding: 16, paddingBottom: 120, gap: 12 }}>
      <Stack.Screen options={{ title: 'All offers' }} />
      {product && (
        <Text variant="footnote" tone="secondary" style={{ textAlign: 'center', marginTop: -4 }}>
          {product.brand.name} {product.name}
          {variant && product.variants.length > 1 ? ` · ${variant.label}` : ''} · new
        </Text>
      )}
      <SegmentedControl
        options={[
          { value: 'delivered', label: 'Delivered price' },
          { value: 'item', label: 'Item price' },
        ]}
        value={mode}
        onChange={setMode}
      />
      {isPending || !product ? (
        [0, 1, 2].map((i) => <Skeleton key={i} height={120} round={16} />)
      ) : offers.length === 0 ? (
        <EmptyState icon="tag" title="No offers yet" message="Retailer offers for this product will appear here." />
      ) : (
        offers.map((o, i) => {
          const value = mode === 'delivered' ? o.deliveredCents : o.priceCents;
          const isBest = i === 0 && o.priceDisplay === 'show';
          const checkPrice = o.priceDisplay === 'check_price';
          return (
            <RetailerOfferCard
              key={o.offerId}
              offer={{
                retailer: o.retailer.name,
                monogram: retailerMonogram(o.retailer.name),
                tagline: checkPrice
                  ? 'Price shown at retailer'
                  : [isBest ? (mode === 'delivered' ? 'Lowest delivered price' : 'Lowest item price') : stockLabel(o), o.retailer.kind === 'manufacturer' ? 'Manufacturer' : null, o.promo ? `code ${o.promo.code}` : null]
                      .filter(Boolean)
                      .join(' · '),
                priceCents: value,
                deltaLabel: !checkPrice && bestValue != null && value != null ? (value - bestValue <= 0 ? 'Best' : `+${formatPrice(value - bestValue)}`) : undefined,
                detail: checkPrice ? `${o.retailer.name} shows the current price on its site` : offerBreakdown(o),
                checked: `Checked ${formatAgo(o.checkedAt)}`,
                best: isBest,
              }}
              actionLabel={checkPrice ? `Check price at ${o.retailer.name}` : isBest ? 'Get deal' : 'View offer'}
              onAction={() => (isBest || checkPrice ? openDeal(o.offerId, checkPrice ? 'offers_check_price' : 'offers_best', o.promo?.id) : router.push({ pathname: '/deals/offer/[id]', params: { id: o.offerId } }))}
            />
          );
        })
      )}
      <View style={{ paddingTop: 4 }}>
        <Text variant="caption" weight="400" tone="tertiary">
          Ranked by what you pay, including shipping and verified codes. PickleDeals may earn a commission on some links; it never changes the order.
        </Text>
      </View>
    </ScrollView>
  );
}
