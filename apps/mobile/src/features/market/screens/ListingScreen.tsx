import { formatAgo, formatPrice, LISTING_CONDITIONS, radius, spoken } from '@pickledeals/shared';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Alert, Pressable, ScrollView, Share, StyleSheet, useWindowDimensions, View, type NativeScrollEvent, type NativeSyntheticEvent } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ConditionBadge, FavoriteButton, PhotoViewer, photoIndex, ProductImage, UsedVsNew, type ImageSource } from '@/commerce';
import { productArt } from '@/commerce/catalogArt';
import { useTheme } from '@/design/theme';
import { startConversation } from '@/features/chat/api';
import { AreaMap } from '@/features/map';
import { useSavedIds, useToggleSave } from '@/features/alerts/hooks';
import { useAuth } from '@/features/auth/authStore';
import { openProduct } from '@/features/catalog/components';
import { Button, DetailTable, ErrorState, Icon, IconButton, Skeleton, Text } from '@/ui';

import { listingImageUrl, type ListingDetail } from '../api';
import { conditionLabel, formatDistance, useMarketNav } from '../components';
import { useListing, useMarket, useSeller } from '../hooks';

const humanize = (key: string) => key.replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase());

function images(l: ListingDetail): ImageSource[] {
  if (l.images.length) return l.images.map((i) => ({ kind: 'remote', uri: listingImageUrl(i.path), isCutout: false, alt: l.title }));
  return [productArt(l.product?.slug ?? l.id, l.category.slug, l.title)];
}

/** Pre-owned listing (design: "Pre-owned listing"). D2: an area label and approximate distance only. */
export default function ListingScreen() {
  const { id = '' } = useLocalSearchParams<{ id: string }>();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const { data: l, isError, refetch } = useListing(id);
  const seller = useSeller(l?.sellerId ?? '');
  const feedItem = useMarket({ ids: [id], statuses: ['active', 'pending', 'sold'], radiusM: null, limit: 1 }, !!id).data?.items[0];
  const saved = useSavedIds();
  const toggleSave = useToggleSave();
  const uid = useAuth((s) => s.user?.id);
  const requireAuth = useAuth((s) => s.requireAuth);
  const { openSeller, openManage, openConversation } = useMarketNav();
  const [page, setPage] = useState(0);
  const [photo, setPhoto] = useState<number | null>(null);

  if (isError) {
    return (
      <View style={{ flex: 1, paddingTop: insets.top + 60 }}>
        <Stack.Screen options={{ headerShown: true, title: '' }} />
        <ErrorState title="Listing not available" message="It may have been removed by the seller." onRetry={refetch} />
      </View>
    );
  }

  const heroH = Math.min(440, width * 1.1);
  const pics = l ? images(l) : [];
  const own = !!l && l.sellerId === uid;
  const isSaved = saved.listings.has(id);
  const distance = formatDistance(feedItem?.distanceM ?? null);
  // Single-variant products ("Standard") don't name the variant.
  const variantLabel = feedItem?.hasVariants ? l?.variant?.label : null;
  const fullTitle = l ? [l.product?.brand ?? l.customBrand, l.title, variantLabel].filter(Boolean).join(' ') : '';
  const cond = l ? LISTING_CONDITIONS.find((c) => c.value === l.condition) : undefined;
  const specs = l?.product ? Object.entries(l.product.specs).slice(0, 4) : [];

  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => setPage(Math.round(e.nativeEvent.contentOffset.x / width));
  const share = () => l && Share.share({ message: `${fullTitle} — ${formatPrice(l.priceCents)} on PickleDeals` }).catch(() => {});
  const message = () =>
    requireAuth('message_seller', async () => {
      try {
        openConversation(await startConversation(id));
      } catch (e) {
        Alert.alert('Can’t message right now', (e as Error).message);
      }
    });
  const offer = () => requireAuth('make_offer', () => router.push({ pathname: '/make-offer', params: { listing: id } }));
  const report = () => requireAuth('report', () => router.push({ pathname: '/report', params: { type: 'listing', id, name: fullTitle, user: l?.sellerId } }));

  return (
    <View style={{ flex: 1 }}>
      <Stack.Screen options={{ headerShown: false }} />
      <PhotoViewer images={pics} index={photo ?? 0} visible={photo !== null} onClose={() => setPhoto(null)} />
      <ScrollView contentContainerStyle={{ paddingBottom: 32 }}>
        <View style={{ height: heroH, backgroundColor: colors.imageTile }}>
          {l ? (
            <ScrollView horizontal pagingEnabled showsHorizontalScrollIndicator={false} onMomentumScrollEnd={onScroll} scrollEventThrottle={16}>
              {pics.map((src, i) =>
                src.kind === 'remote' ? (
                  <Pressable
                    key={i}
                    accessibilityRole="button"
                    accessibilityLabel={pics.length > 1 ? `Open photo ${i + 1} of ${pics.length}` : 'Open photo'}
                    onPress={() => setPhoto(photoIndex(pics, src))}>
                    <ProductImage source={src} width={width} aspectRatio={width / heroH} round={0} padding={56} />
                  </Pressable>
                ) : (
                  <ProductImage key={i} source={src} width={width} aspectRatio={width / heroH} round={0} padding={56} />
                ),
              )}
            </ScrollView>
          ) : (
            <Skeleton height={heroH} round={0} />
          )}
          <View style={[styles.tag, { left: 16, backgroundColor: colors.background }]}>
            <Text variant="badge">PRE-OWNED</Text>
          </View>
          {pics.length > 1 && (
            <View style={[styles.tag, { right: 16, borderRadius: 10, backgroundColor: colors.background }]}>
              <Text variant="caption" weight="700" numeric>
                {page + 1} / {pics.length}
              </Text>
            </View>
          )}
        </View>

        {l && (
          <View style={{ paddingHorizontal: 16, paddingTop: 20, gap: 24 }}>
            {l.status !== 'active' && (
              <View style={{ padding: 12, borderRadius: radius.card, backgroundColor: colors.interactive, gap: 4 }}>
                <Text variant="subhead" weight="700" style={{ color: colors.onInteractive }}>
                  {own && l.staffRemoval
                    ? 'Removed by PickleDeals'
                    : l.status === 'pending'
                      ? 'Pending — the seller is finishing a sale'
                      : l.status === 'sold'
                        ? 'Sold'
                        : 'No longer available'}
                </Text>
                {own && l.staffRemoval && (
                  <Text variant="footnote" style={{ color: colors.onInteractive }}>
                    {l.staffRemoval.reason ? `${l.staffRemoval.reason}. ` : ''}Buyers can’t see it. Contact PickleDeals support if you think this is a mistake.
                  </Text>
                )}
              </View>
            )}

            <View style={{ gap: 6 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <Text variant="priceDisplay" style={{ fontSize: 36 }} numeric>
                  {formatPrice(l.priceCents)}
                </Text>
                <ConditionBadge condition={l.condition} />
              </View>
              <Text variant="title2">{fullTitle}</Text>
              <Text variant="subhead" weight="400" tone="secondary" numeric>
                {[l.areaLabel, distance, l.publishedAt ? `listed ${formatAgo(l.publishedAt)}` : null].filter(Boolean).join(' · ')}
              </Text>
            </View>

            {l.product && (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={spoken(
                  'Compare with new prices',
                  `this listing ${formatPrice(l.priceCents)}`,
                  l.bestNewCents != null && `best new price ${formatPrice(l.bestNewCents)}`,
                )}
                onPress={() => openProduct(l.product!.slug)}
                style={({ pressed }) => ({ padding: 16, borderRadius: 20, backgroundColor: colors.surface, gap: 12, opacity: pressed ? 0.9 : 1 })}>
                <UsedVsNew
                  askCents={l.priceCents}
                  conditionLabel={conditionLabel(l.condition)}
                  bestNewCents={l.bestNewCents}
                  bestNewRetailer={[l.bestNewRetailer, l.msrpCents ? `MSRP ${formatPrice(l.msrpCents)}` : null].filter(Boolean).join(' · ') || undefined}
                />
                {l.usedRange && (
                  <Text variant="footnote" tone="secondary" numeric>
                    {l.usedRange.p25 === l.usedRange.p75
                      ? `Used usually around ${formatPrice(l.usedRange.p25)} ›`
                      : `Used usually ${formatPrice(l.usedRange.p25)}–${formatPrice(l.usedRange.p75)} ›`}
                  </Text>
                )}
              </Pressable>
            )}

            <View style={{ borderRadius: 20, borderWidth: 1, borderColor: colors.border, overflow: 'hidden' }}>
              {l.pickup && <DeliveryRow icon="pin" title="Local pickup" detail={`${l.areaLabel ?? 'Seller’s'} area · meet spot agreed in chat`} />}
              {l.ships && <DeliveryRow icon="ship" title="Will ship" detail="Buyer and seller arrange postage directly" divider={l.pickup} />}
              {l.areaCenter ? (
                <View style={{ borderTopWidth: 1, borderTopColor: colors.separator }}>
                  <AreaMap center={l.areaCenter} height={140} label="Approximate area" areaName={l.areaLabel} />
                </View>
              ) : (
                <DeliveryRow icon="shield" title="Approximate area" detail="Buyers see the area and a distance — never an address." divider />
              )}
            </View>

            <Pressable accessibilityRole="button" onPress={() => openSeller(l.sellerId)} style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <View style={[styles.avatar, { backgroundColor: colors.surfacePressed }]}>
                <Text variant="title3" weight="700">
                  {l.seller.name.charAt(0)}
                </Text>
              </View>
              <View style={{ flex: 1, gap: 2 }}>
                <Text variant="headline">{l.seller.name}</Text>
                <Text variant="footnote" tone="secondary" numeric>
                  Member since {new Date(l.seller.memberSince).getFullYear()}
                  {seller.data ? ` · ${seller.data.sold.length} sold` : ''}
                </Text>
              </View>
              <Icon name="chevronRight" size={16} color={colors.textTertiary} />
            </Pressable>

            {!!l.description && (
              <View style={{ gap: 8 }}>
                <Text variant="headline" weight="700">
                  From the seller
                </Text>
                <Text variant="body" style={{ lineHeight: 25 }}>
                  {l.description}
                </Text>
              </View>
            )}

            <View>
              <DetailTable
                rows={[
                  { label: 'Product', value: l.product ? `${l.product.brand} ${l.product.name}` : 'Not in the catalog' },
                  ...(variantLabel ? [{ label: 'Version', value: variantLabel }] : []),
                  { label: 'Category', value: l.category.name },
                  ...specs.map(([k, v]) => ({ label: humanize(k), value: String(v) })),
                ]}
              />
              <View style={{ height: 1, backgroundColor: colors.separator }} />
              <Text variant="footnote" tone="secondary" style={{ paddingTop: 10, lineHeight: 19 }}>
                {cond?.label}: {cond?.description} PickleDeals doesn’t process payment — agree on price here, then pay and hand over however you both prefer.
              </Text>
            </View>

            {!own && <Button label="Report listing" variant="link" size="sm" style={{ alignSelf: 'flex-start' }} onPress={report} />}
          </View>
        )}
      </ScrollView>

      <View style={[styles.topBar, { top: insets.top + 8 }]}>
        <IconButton icon="chevronLeft" label="Back" tone="glass" size={44} onPress={() => (router.canGoBack() ? router.back() : router.replace('/market'))} />
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <IconButton icon="share" label="Share" tone="glass" size={44} onPress={share} />
          {!own && <FavoriteButton saved={isSaved} size={44} label="Save listing" onToggle={() => toggleSave('listing', id, isSaved)} />}
        </View>
      </View>

      {l && !(own && l.status === 'removed') && (
        <View style={[styles.bottom, { paddingBottom: Math.max(insets.bottom, 12), backgroundColor: colors.glass, borderTopColor: colors.border }]}>
          {own ? (
            <Button label="Manage listing" style={{ flex: 1 }} onPress={() => openManage(l.id)} />
          ) : l.status === 'sold' || l.status === 'removed' ? (
            <Button
              label="See similar listings"
              variant="secondary"
              style={{ flex: 1 }}
              onPress={() => (l.product ? openProduct(l.product.slug) : router.push('/market'))}
            />
          ) : (
            <>
              <Button label="Message" variant="secondary" style={{ flex: 1 }} onPress={message} />
              {l.acceptsOffers && l.status === 'active' && <Button label="Make offer" style={{ flex: 1.2 }} onPress={offer} />}
            </>
          )}
        </View>
      )}
    </View>
  );
}

function DeliveryRow({ icon, title, detail, divider }: { icon: 'pin' | 'ship' | 'shield'; title: string; detail: string; divider?: boolean }) {
  const { colors } = useTheme();
  return (
    <View style={[styles.delivery, divider && { borderTopWidth: 1, borderTopColor: colors.separator }]}>
      <Icon name={icon} size={20} color={colors.textPrimary} />
      <View style={{ flex: 1 }}>
        <Text variant="subhead" weight="600">
          {title}
        </Text>
        <Text variant="footnote" tone="secondary">
          {detail}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  tag: { position: 'absolute', bottom: 16, paddingHorizontal: 8, paddingVertical: 5, borderRadius: 6 },
  topBar: { position: 'absolute', left: 16, right: 16, flexDirection: 'row', justifyContent: 'space-between' },
  bottom: { paddingTop: 12, paddingHorizontal: 16, flexDirection: 'row', gap: 10, borderTopWidth: StyleSheet.hairlineWidth },
  avatar: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
  delivery: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14, paddingHorizontal: 16 },
});
