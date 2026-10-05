import { formatPrice, regionAround, type MapRegion } from '@pickledeals/shared';
import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useDeferredValue, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ProductImage } from '@/commerce';
import { useTheme } from '@/design/theme';
import { ListingMap, useMapViewport, type ListingMapHandle, type MapPin } from '@/features/map';
import { ChipRow, Icon, IconButton, SearchField, Text } from '@/ui';

import { fetchListingCells, type MapListing } from '../api';
import { conditionLabel, filterSummary, formatDistance, MarketQuickChips, radiusLabel, useMarketNav } from '../components';
import { DEFAULT_MARKET_FILTERS, filtersToQuery, listingImage, listingTitle, useMarket, useMarketFilters, useMarketInBounds, useMarketSearch, useViewer } from '../hooks';

/** Default view: ~10 mi across — close enough for price pins to read. */
const VIEW_RADIUS_M = 8000;
const CONTIGUOUS_US: MapRegion = { latitude: 39.5, longitude: -98.35, latitudeDelta: 30, longitudeDelta: 50 };
const TAB_BAR = 49;

/** Marketplace map (designs: MarketMap, MapPreview, DarkMap). Pins sit on public ~1 km cell centres (D2). */
export default function MarketMapScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const nav = useMarketNav();
  const f = useMarketFilters((s) => s.f);
  const { text, setText } = useMarketSearch();
  const search = useDeferredValue(text.trim());
  const viewer = useViewer((s) => s.point);
  const map = useRef<ListingMapHandle>(null);
  const viewport = useMapViewport();

  // Where to open: the device's area; else the nearest listing's cell (which also covers a saved
  // home area — the client can't read that point); else, for guests, the newest listings' extent.
  const opening = useMarket({ ...filtersToQuery(DEFAULT_MARKET_FILTERS), radiusM: null, sort: 'nearest', limit: 20 }, !viewer);
  const openIds = opening.data ? (opening.data.hasOrigin ? opening.data.items.slice(0, 1) : opening.data.items).map((l) => l.id) : [];
  const cells = useQuery({ queryKey: ['market', 'cells', openIds], queryFn: () => fetchListingCells(openIds), enabled: openIds.length > 0, staleTime: Infinity });
  const initial: MapRegion | null = viewer
    ? regionAround(viewer, VIEW_RADIUS_M)
    : opening.isPending || (openIds.length > 0 && cells.isPending)
      ? null
      : cells.data?.size
        ? fitRegion([...cells.data.values()])
        : CONTIGUOUS_US;
  if (initial && !viewport.current) viewport.reset(initial);

  const q = filtersToQuery(f);
  const result = useMarketInBounds(
    viewport.bounds && { bounds: viewport.bounds, category: q.category, conditions: q.conditions, brands: q.brands, minCents: q.minCents, maxCents: q.maxCents, pickupOnly: q.pickupOnly, text: search || undefined },
  );
  const items = useMemo(() => result.data?.items ?? [], [result.data]);
  const pins = useMemo<MapPin[]>(() => items.map((l) => ({ id: l.id, point: l.point, label: formatPrice(l.priceCents) })), [items]);

  // Preview carousel: the tapped listing first, then its neighbours (or everything in a tapped cell).
  const [cards, setCards] = useState<{ ids: string[]; index: number } | null>(null);
  const byId = useMemo(() => new Map(items.map((l) => [l.id, l])), [items]);
  const cardItems = (cards?.ids ?? []).map((id) => byId.get(id)).filter((l): l is MapListing => !!l);
  const selected = cardItems[cards?.index ?? 0];

  const openPin = (id: string) => {
    const at = byId.get(id)?.point;
    if (!at) return;
    const near = [...items].sort((a, b) => dist2(a.point, at) - dist2(b.point, at)).slice(0, 10);
    setCards({ ids: near.map((l) => l.id), index: 0 });
  };

  const recentre = () => {
    if (!initial) return;
    map.current?.animateTo(initial);
    viewport.reset(initial);
  };

  const total = result.data?.total ?? 0;
  const noun = f.category === 'paddles' ? (total === 1 ? 'paddle' : 'paddles') : total === 1 ? 'listing' : 'listings';
  const top = insets.top + 8;
  const bottom = insets.bottom + TAB_BAR;

  return (
    <View style={{ flex: 1, backgroundColor: colors.mapLand }}>
      {initial && (
        <ListingMap
          ref={map}
          initialRegion={initial}
          pins={pins}
          selectedId={selected?.id ?? null}
          selectedImage={selected ? listingImage(selected) : undefined}
          showsUser={!!viewer}
          onRegionChange={viewport.onRegionChange}
          onSelectPin={openPin}
          onSelectCell={(ids) => setCards({ ids, index: 0 })}
          onPressMap={() => setCards(null)}
          topInset={top + 100}
          bottomInset={bottom + 120}
        />
      )}

      {/* Top: search + filters, or (with a preview open) back + filter summary. */}
      <View style={{ position: 'absolute', left: 0, right: 0, top, gap: 10 }} pointerEvents="box-none">
        {selected ? (
          <View style={{ flexDirection: 'row', gap: 8, paddingHorizontal: 16 }}>
            <IconButton icon="chevronLeft" label="Back to map" tone="glass" size={44} onPress={() => setCards(null)} />
            <View style={{ flex: 1, height: 44, borderRadius: 22, paddingHorizontal: 14, justifyContent: 'center', backgroundColor: colors.glass, borderWidth: 0.5, borderColor: colors.border, boxShadow: colors.shadow }}>
              <Text variant="subhead" weight="400" tone="secondary" numberOfLines={1} numeric>
                {filterSummary(f, search)}
              </Text>
            </View>
          </View>
        ) : (
          <>
            <View style={{ flexDirection: 'row', gap: 8, paddingHorizontal: 16 }}>
              <View style={{ flex: 1 }}>
                <SearchField
                  placeholder="Search pre-owned gear"
                  value={text}
                  onChangeText={setText}
                  style={{ backgroundColor: colors.glass, borderWidth: 0.5, borderColor: colors.border, boxShadow: colors.shadow }}
                />
              </View>
              <IconButton icon="sliders" label="Filters" tone="glass" size={44} onPress={() => router.push('/market/filters')} />
            </View>
            <ChipRow>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Distance: ${radiusLabel(f.radiusM)}. Change`}
                onPress={() => router.push('/market/location')}
                style={{ minHeight: 36, paddingHorizontal: 12, borderRadius: 18, flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: colors.glass, borderWidth: 0.5, borderColor: colors.border }}>
                <Icon name="pin" size={14} color={colors.textPrimary} />
                <Text variant="subhead" weight="700" numeric>
                  {radiusLabel(f.radiusM)}
                </Text>
              </Pressable>
              <MarketQuickChips glass />
            </ChipRow>
            {viewport.moved && (
              <Pressable
                accessibilityRole="button"
                onPress={() => {
                  setCards(null);
                  viewport.searchHere();
                }}
                style={({ pressed }) => ({
                  alignSelf: 'center',
                  height: 38,
                  paddingHorizontal: 16,
                  borderRadius: 19,
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 6,
                  backgroundColor: pressed ? colors.interactivePressed : colors.interactive,
                  boxShadow: colors.shadow,
                })}>
                <Icon name="refresh" size={16} color={colors.onInteractive} weight="semibold" />
                <Text variant="subhead" weight="700" style={{ color: colors.onInteractive }}>
                  Search this area
                </Text>
              </Pressable>
            )}
          </>
        )}
      </View>

      {selected ? (
        <View style={{ position: 'absolute', left: 0, right: 0, bottom: bottom + 12, gap: 8 }}>
          <ScrollView
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            onMomentumScrollEnd={(e) => setCards((c) => c && { ...c, index: Math.round(e.nativeEvent.contentOffset.x / width) })}>
            {cardItems.map((l) => (
              <View key={l.id} style={{ width, paddingHorizontal: 12 }}>
                <PreviewCard l={l} onPress={() => nav.openListing(l.id)} />
              </View>
            ))}
          </ScrollView>
          {cardItems.length > 1 && (
            <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 6 }} accessibilityLabel={`Listing ${(cards?.index ?? 0) + 1} of ${cardItems.length}`}>
              {cardItems.map((l, i) => (
                <View key={l.id} style={i === cards?.index ? { width: 18, height: 6, borderRadius: 3, backgroundColor: colors.interactive } : { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.textTertiary, opacity: 0.4 }} />
              ))}
            </View>
          )}
        </View>
      ) : (
        <>
          <View style={{ position: 'absolute', right: 16, bottom: bottom + 112 }}>
            <IconButton icon="locate" label="Recenter" tone="glass" size={44} onPress={recentre} />
          </View>
          <View
            style={{
              position: 'absolute',
              left: 0,
              right: 0,
              bottom: 0,
              paddingTop: 8,
              paddingHorizontal: 16,
              paddingBottom: bottom + 12,
              gap: 8,
              borderTopLeftRadius: 28,
              borderTopRightRadius: 28,
              borderTopWidth: 0.5,
              borderColor: colors.border,
              backgroundColor: colors.glass,
              boxShadow: colors.shadowSheet,
            }}>
            <View style={{ alignSelf: 'center', width: 36, height: 5, borderRadius: 3, backgroundColor: colors.border }} />
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexShrink: 1 }}>
                <Text variant="headline" weight="700" numeric numberOfLines={1}>
                  {result.isError ? 'Couldn’t load this area' : result.data ? `${total} ${noun} in this area` : 'Finding listings…'}
                </Text>
                {result.isFetching && <ActivityIndicator size="small" color={colors.textSecondary} />}
              </View>
              {result.isError ? (
                <SheetButton icon="refresh" label="Retry" onPress={() => result.refetch()} />
              ) : (
                <SheetButton icon="grid" label="List" onPress={() => (router.canGoBack() ? router.back() : router.replace('/market'))} />
              )}
            </View>
            <Text variant="caption" weight="400" tone="secondary" numeric>
              {result.data?.truncated ? `Showing the ${items.length} nearest the centre. Zoom in to see the rest. ` : ''}
              Pins show approximate areas, never exact addresses.
            </Text>
          </View>
        </>
      )}
    </View>
  );
}

/** A region showing every point (at least the default ~10 mi view), with room for the pins. */
function fitRegion(points: { lat: number; lng: number }[]): MapRegion {
  const lats = points.map((p) => p.lat);
  const lngs = points.map((p) => p.lng);
  const centre = { lat: (Math.min(...lats) + Math.max(...lats)) / 2, lng: (Math.min(...lngs) + Math.max(...lngs)) / 2 };
  const base = regionAround(centre, VIEW_RADIUS_M);
  // The search bar and bottom sheet cover ~45% of the height (more at the bottom).
  const latitudeDelta = Math.max(base.latitudeDelta, (Math.max(...lats) - Math.min(...lats)) * 2.2);
  return {
    latitude: centre.lat - latitudeDelta * 0.08,
    longitude: centre.lng,
    latitudeDelta,
    longitudeDelta: Math.max(base.longitudeDelta, (Math.max(...lngs) - Math.min(...lngs)) * 1.5),
  };
}

const dist2 = (a: { lat: number; lng: number }, b: { lat: number; lng: number }) => (a.lat - b.lat) ** 2 + (a.lng - b.lng) ** 2;

function SheetButton({ icon, label, onPress }: { icon: 'grid' | 'refresh'; label: string; onPress: () => void }) {
  const { colors } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => ({ minHeight: 32, paddingHorizontal: 12, borderRadius: 16, flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: colors.chip, opacity: pressed ? 0.75 : 1 })}>
      <Icon name={icon} size={14} color={colors.textPrimary} />
      <Text variant="footnote" weight="700">
        {label}
      </Text>
    </Pressable>
  );
}

/** Map listing preview (design: MapPreview). */
function PreviewCard({ l, onPress }: { l: MapListing; onPress: () => void }) {
  const { colors } = useTheme();
  const saving = l.bestNewCents != null && l.bestNewCents > l.priceCents ? l.bestNewCents - l.priceCents : null;
  const distance = formatDistance(l.distanceM);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${listingTitle(l)}, ${formatPrice(l.priceCents)}, ${conditionLabel(l.condition)}`}
      onPress={onPress}
      style={({ pressed }) => ({
        flexDirection: 'row',
        gap: 12,
        padding: 12,
        borderRadius: 24,
        backgroundColor: colors.surfaceElevated,
        borderWidth: 0.5,
        borderColor: colors.border,
        boxShadow: colors.shadow,
        opacity: pressed ? 0.9 : 1,
      })}>
      <ProductImage source={listingImage(l)} width={112} aspectRatio={112 / 132} padding={10}>
        {l.imageCount > 1 && (
          <View style={{ position: 'absolute', right: 6, bottom: 6, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 5, backgroundColor: colors.background }}>
            <Text variant="caption" weight="700" numeric style={{ fontSize: 10 }}>
              1/{l.imageCount}
            </Text>
          </View>
        )}
      </ProductImage>
      <View style={{ flex: 1, gap: 4, minWidth: 0 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Text variant="title2" weight="700" numeric style={{ fontSize: 24, letterSpacing: -0.48 }}>
            {formatPrice(l.priceCents)}
          </Text>
          <View style={{ paddingHorizontal: 6, paddingVertical: 2, borderRadius: 5, backgroundColor: colors.chip }}>
            <Text variant="caption" weight="600" style={{ fontSize: 11 }}>
              {conditionLabel(l.condition)}
            </Text>
          </View>
          {l.status === 'pending' && (
            <View style={{ paddingHorizontal: 6, paddingVertical: 2, borderRadius: 5, backgroundColor: colors.interactive }}>
              <Text variant="badge" style={{ fontSize: 10, color: colors.onInteractive }}>
                PENDING
              </Text>
            </View>
          )}
        </View>
        <Text variant="subhead" weight="600" numberOfLines={2} style={{ lineHeight: 19 }}>
          {listingTitle(l)}
        </Text>
        {l.bestNewCents != null && (
          <Text variant="footnote" tone="secondary" numeric numberOfLines={1}>
            New from {formatPrice(l.bestNewCents)}
            {saving ? ` · save ${formatPrice(saving)}` : ''}
          </Text>
        )}
        <Text variant="footnote" tone="secondary" numeric numberOfLines={1}>
          {[l.areaLabel, distance].filter(Boolean).join(' · ')}
        </Text>
        <Text variant="footnote" tone="secondary" numberOfLines={1}>
          {[l.pickup ? 'Pickup' : null, l.ships ? 'Ships' : null, l.sellerName].filter(Boolean).join(' · ')}
        </Text>
      </View>
    </Pressable>
  );
}
