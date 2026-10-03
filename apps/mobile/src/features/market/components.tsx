import { formatApproxDistance, formatPrice, LISTING_CONDITIONS, type ListingCondition } from '@pickledeals/shared';
import { router, useSegments } from 'expo-router';
import { View } from 'react-native';

import { ListingCard, type ListingCardData } from '@/commerce';
import { useSavedIds, useToggleSave } from '@/features/alerts/hooks';
import { useGridCardWidth } from '@/features/catalog/components';
import { CardSkeleton, Chip, ErrorState } from '@/ui';

import type { ListingCardItem } from './api';
import { listingImage, listingTitle, useMarketFilters, type MarketFilters } from './hooks';

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

type Tab = 'deals' | 'market' | 'profile' | 'root';
function currentTab(segments: string[]): Tab {
  // Root-level detail routes (opened from a conversation) stay above the tabs.
  if (segments[0] !== '(tabs)') return 'root';
  const t = segments[1];
  return t === 'deals' || t === 'profile' ? t : 'market';
}

/** Listing + seller routes exist in the Deals, Marketplace and Profile stacks (and at the root, above chat); push within the current one. */
export function useMarketNav() {
  const tab = currentTab(useSegments() as string[]);
  return {
    openListing: (id: string) =>
      router.push(
        tab === 'root'
          ? { pathname: '/listing/[id]', params: { id } }
          : tab === 'deals'
            ? { pathname: '/deals/listing/[id]', params: { id } }
            : tab === 'profile'
              ? { pathname: '/profile/listing/[id]', params: { id } }
              : { pathname: '/market/listing/[id]', params: { id } },
      ),
    openSeller: (id: string) =>
      router.push(
        tab === 'root'
          ? { pathname: '/seller/[id]', params: { id } }
          : tab === 'deals'
            ? { pathname: '/deals/seller/[id]', params: { id } }
            : tab === 'profile'
              ? { pathname: '/profile/seller/[id]', params: { id } }
              : { pathname: '/market/seller/[id]', params: { id } },
      ),
    // Sheets for the seller's own listing only exist in the tab stacks; from the root use Profile's.
    openManage: (id: string) =>
      router.push(
        tab === 'deals'
          ? { pathname: '/deals/manage-listing', params: { id } }
          : tab === 'market'
            ? { pathname: '/market/manage-listing', params: { id } }
            : { pathname: '/profile/manage-listing', params: { id } },
      ),
    openEdit: (id: string) =>
      router.push(
        tab === 'deals'
          ? { pathname: '/deals/edit-listing', params: { id } }
          : tab === 'market'
            ? { pathname: '/market/edit-listing', params: { id } }
            : { pathname: '/profile/edit-listing', params: { id } },
      ),
    openConversation: (id: string) => router.push({ pathname: '/conversation/[id]', params: { id } }),
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

const CATEGORY_CHIPS = [
  { slug: 'paddles', label: 'Paddles' },
  { slug: 'shoes', label: 'Shoes' },
  { slug: 'bags', label: 'Bags' },
  { slug: 'ball-machines', label: 'Ball machines' },
];
const LIKE_NEW_PLUS: MarketFilters['conditions'] = ['new_sealed', 'like_new'];

/** Quick filter chips shared by the grid and the map (one MarketFilters store, §8). */
export function MarketQuickChips({ glass }: { glass?: boolean }) {
  const { f, set } = useMarketFilters();
  const likeNewPlus = f.conditions.length === 2 && LIKE_NEW_PLUS.every((c) => f.conditions.includes(c));
  return (
    <>
      <Chip glass={glass} label="All" selected={!f.category} onPress={() => set({ ...f, category: null })} />
      {CATEGORY_CHIPS.map((c) => (
        <Chip key={c.slug} glass={glass} label={c.label} selected={f.category === c.slug} onPress={() => set({ ...f, category: f.category === c.slug ? null : c.slug })} />
      ))}
      <Chip glass={glass} label="Local pickup" selected={f.pickupOnly} onPress={() => set({ ...f, pickupOnly: !f.pickupOnly })} />
      <Chip glass={glass} label="Like New+" selected={likeNewPlus} onPress={() => set({ ...f, conditions: likeNewPlus ? [] : LIKE_NEW_PLUS })} />
    </>
  );
}

/** "Paddles · 25 mi · under $150" — a one-line summary of the active filters. */
export function filterSummary(f: MarketFilters, text?: string): string {
  const cat = CATEGORY_CHIPS.find((c) => c.slug === f.category)?.label ?? (text ? `“${text}”` : 'All gear');
  const parts = [cat, radiusLabel(f.radiusM)];
  if (f.maxCents != null) parts.push(`under ${formatPrice(f.maxCents)}`);
  else if (f.minCents != null) parts.push(`over ${formatPrice(f.minCents)}`);
  if (f.pickupOnly) parts.push('pickup');
  return parts.join(' · ');
}
