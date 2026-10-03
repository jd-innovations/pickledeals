import { formatApproxDistance, LISTING_CONDITIONS, type ListingCondition } from '@pickledeals/shared';
import { router, useSegments } from 'expo-router';
import { View } from 'react-native';

import { ListingCard, type ListingCardData } from '@/commerce';
import { useSavedIds, useToggleSave } from '@/features/alerts/hooks';
import { useGridCardWidth } from '@/features/catalog/components';
import { CardSkeleton, ErrorState } from '@/ui';

import type { ListingCardItem } from './api';
import { listingImage, listingTitle } from './hooks';

export const conditionLabel = (c: ListingCondition) => LISTING_CONDITIONS.find((x) => x.value === c)?.label ?? c;

/** Distances are between ~1 km cells (D2), so they are always shown as approximate. */
export const formatDistance = (m: number | null): string | null => (m == null ? null : formatApproxDistance(m));

export const RADIUS_OPTIONS = [
  { label: '5 mi', m: 8047 },
  { label: '10 mi', m: 16093 },
  { label: '25 mi', m: 40234 },
  { label: '50 mi', m: 80467 },
  { label: 'Any', m: null },
] as const;
export const radiusLabel = (m: number | null) => RADIUS_OPTIONS.find((r) => r.m === m)?.label ?? (m == null ? 'Any' : `${Math.round(m / 1609.34)} mi`);

export function toCardData(l: ListingCardItem): ListingCardData {
  const far = l.distanceM == null || l.distanceM > 80467;
  return {
    id: l.id,
    title: listingTitle(l),
    image: listingImage(l),
    conditionLabel: conditionLabel(l.condition),
    askCents: l.priceCents,
    bestNewCents: l.bestNewCents,
    areaLabel: l.areaLabel,
    distance: far && l.ships ? 'ships' : (formatDistance(l.distanceM) ?? (l.pickup ? 'pickup' : 'ships')),
    status: l.status === 'pending' || l.status === 'sold' ? l.status : undefined,
  };
}

type Tab = 'deals' | 'market' | 'profile';
function currentTab(segments: string[]): Tab {
  const t = segments[1];
  return t === 'deals' || t === 'profile' ? t : 'market';
}

/** Listing + seller routes exist in the Deals, Marketplace and Profile stacks; push within the current one. */
export function useMarketNav() {
  const tab = currentTab(useSegments() as string[]);
  return {
    openListing: (id: string) =>
      router.push(
        tab === 'deals'
          ? { pathname: '/deals/listing/[id]', params: { id } }
          : tab === 'profile'
            ? { pathname: '/profile/listing/[id]', params: { id } }
            : { pathname: '/market/listing/[id]', params: { id } },
      ),
    openSeller: (id: string) =>
      router.push(
        tab === 'deals'
          ? { pathname: '/deals/seller/[id]', params: { id } }
          : tab === 'profile'
            ? { pathname: '/profile/seller/[id]', params: { id } }
            : { pathname: '/market/seller/[id]', params: { id } },
      ),
    openManage: (id: string) =>
      router.push(
        tab === 'deals'
          ? { pathname: '/deals/manage-listing', params: { id } }
          : tab === 'profile'
            ? { pathname: '/profile/manage-listing', params: { id } }
            : { pathname: '/market/manage-listing', params: { id } },
      ),
    openEdit: (id: string) =>
      router.push(
        tab === 'deals'
          ? { pathname: '/deals/edit-listing', params: { id } }
          : tab === 'profile'
            ? { pathname: '/profile/edit-listing', params: { id } }
            : { pathname: '/market/edit-listing', params: { id } },
      ),
  };
}

const GAP = 12;

export function ListingGrid({ items, width }: { items: ListingCardItem[]; width?: number }) {
  const gridW = useGridCardWidth();
  const cardW = width ?? gridW;
  const saved = useSavedIds();
  const toggle = useToggleSave();
  const { openListing } = useMarketNav();
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: GAP, rowGap: 20, paddingHorizontal: 16 }}>
      {items.map((l) => (
        <ListingCard
          key={l.id}
          width={cardW}
          listing={toCardData(l)}
          saved={saved.listings.has(l.id)}
          onToggleSave={() => toggle('listing', l.id, saved.listings.has(l.id))}
          onPress={() => openListing(l.id)}
        />
      ))}
    </View>
  );
}

export function ListingRail({ items }: { items: ListingCardItem[] }) {
  const saved = useSavedIds();
  const toggle = useToggleSave();
  const { openListing } = useMarketNav();
  return (
    <>
      {items.map((l) => (
        <ListingCard
          key={l.id}
          width={148}
          listing={toCardData(l)}
          saved={saved.listings.has(l.id)}
          onToggleSave={() => toggle('listing', l.id, saved.listings.has(l.id))}
          onPress={() => openListing(l.id)}
        />
      ))}
    </>
  );
}

export function ListingGridSkeleton({ count = 4 }: { count?: number }) {
  const cardW = useGridCardWidth();
  return (
    <View accessibilityLabel="Loading" style={{ flexDirection: 'row', flexWrap: 'wrap', gap: GAP, rowGap: 20, paddingHorizontal: 16 }}>
      {Array.from({ length: count }, (_, i) => (
        <CardSkeleton key={i} width={cardW} />
      ))}
    </View>
  );
}

export function MarketLoadError({ onRetry }: { onRetry: () => void }) {
  return <ErrorState title="Couldn’t load listings" message="Check your connection and try again." onRetry={onRetry} />;
}
