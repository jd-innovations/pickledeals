import { formatAgo, formatEndsIn, formatPrice, pickDealBadge } from '@pickledeals/shared';
import * as Clipboard from 'expo-clipboard';
import * as Haptics from 'expo-haptics';
import { router, Stack } from 'expo-router';
import { useState } from 'react';
import { RefreshControl, ScrollView, View } from 'react-native';

import { CollectionBanner, DealCard, DealHero, PriceDropRow, PromoCodeRow } from '@/commerce';
import { useSavedIds, useToggleSave } from '@/features/alerts/hooks';
import { productImage } from '@/features/catalog/hooks';
import { ShopByCategory } from '@/features/catalog/ShopByCategory';
import { NearbyPreOwned } from '@/features/market/PreOwned';
import { openDeal } from '@/features/offers/hooks';
import { Chip, ChipRow, EmptyState, ErrorState, IconButton, SearchField, SectionHeader, Skeleton, Text } from '@/ui';

import type { Deal, Feed } from '../api';
import { DealGrid, openDealDetail } from '../components';
import { dealTitle, toCard, useDealsHome } from '../hooks';

const CHIPS: { feed: Feed | 'home'; label: string }[] = [
  { feed: 'home', label: 'Today' },
  { feed: 'price_drops', label: 'Price drops' },
  { feed: 'ending_soon', label: 'Ending soon' },
  { feed: 'promo_codes', label: 'Promo codes' },
  { feed: 'under_50', label: 'Under $50' },
  { feed: 'new', label: 'New' },
];

export const openFeed = (feed: Feed) => router.push({ pathname: '/deals/feed/[feed]', params: { feed } });

const image = (d: Deal) => productImage({ slug: d.product.slug, name: d.product.name, brand: d.brand, category: d.category, image: d.image });

async function getDeal(d: Deal, placement: string) {
  if (d.promo) {
    await Clipboard.setStringAsync(d.promo.code);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
  }
  openDeal(d.offerId, placement, d.promo?.id);
}

/** Deals home (design). Every section comes from deals_home; sponsored items are always labelled. */
export default function HomeScreen() {
  const { data, isPending, isError, refetch, isRefetching } = useDealsHome();
  const [pulling, setPulling] = useState(false);

  const onRefresh = async () => {
    setPulling(true);
    await refetch();
    setPulling(false);
  };

  return (
    <ScrollView
      contentInsetAdjustmentBehavior="automatic"
      contentContainerStyle={{ paddingBottom: 120, gap: 24 }}
      refreshControl={<RefreshControl refreshing={pulling && isRefetching} onRefresh={onRefresh} />}>
      <Stack.Screen
        options={{
          headerRight: () => (
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <IconButton icon="bell" label="Alerts" size={34} onPress={() => router.push('/alerts')} />
            </View>
          ),
        }}
      />
      <View style={{ gap: 12 }}>
        <View style={{ paddingHorizontal: 16 }}>
          <SearchField placeholder="Search paddles, shoes, brands" onPress={() => router.push('/deals/search')} />
        </View>
        <ChipRow>
          {CHIPS.map((c) => (
            <Chip key={c.feed} label={c.label} selected={c.feed === 'home'} onPress={() => c.feed !== 'home' && openFeed(c.feed)} />
          ))}
        </ChipRow>
        {data && (
          <Text variant="caption" weight="400" tone="secondary" style={{ paddingHorizontal: 16 }} numeric>
            {data.liveCount} live {data.liveCount === 1 ? 'deal' : 'deals'}
            {data.checkedAt ? ` · prices checked ${formatAgo(data.checkedAt)}` : ''}
          </Text>
        )}
      </View>

      {isError && !data ? (
        <ErrorState title="Couldn’t load deals" message="Check your connection and try again." onRetry={() => refetch()} />
      ) : isPending ? (
        <View style={{ paddingHorizontal: 16, gap: 12 }}>
          <Skeleton height={300} round={24} />
          <Skeleton width="60%" height={20} />
          <Skeleton width="40%" height={28} />
        </View>
      ) : !data.hero ? (
        <>
          <EmptyState icon="tag" title="No live deals right now" message="We re-check prices through the day. Browse the catalog in the meantime." />
          <ShopByCategory />
        </>
      ) : (
        <>
          <View style={{ gap: 12 }}>
            <SectionHeader title="Today’s best deal" trailing={data.hero.isStaffPick ? 'Staff pick' : 'Organic pick'} />
            <View style={{ paddingHorizontal: 16 }}>
              <DealHero
                deal={{
                  eyebrow: data.hero.isStaffPick ? 'Staff pick' : 'Organic pick',
                  image: image(data.hero),
                  badge: pickDealBadge(data.hero.badges),
                  brandLine: `${data.hero.brand.name} · ${data.hero.category.name}`,
                  title: dealTitle(data.hero),
                  priceCents: data.hero.priceCents,
                  wasCents: data.hero.wasCents,
                  meta: [
                    data.hero.wasCents && data.hero.priceCents && data.hero.wasCents > data.hero.priceCents
                      ? `Save ${formatPrice(data.hero.wasCents - data.hero.priceCents)} at ${data.hero.retailer.name}`
                      : `At ${data.hero.retailer.name}`,
                    data.hero.promo ? `code ${data.hero.promo.code}` : null,
                    data.hero.offerCount > 1 ? `${data.hero.offerCount - 1} other ${data.hero.offerCount === 2 ? 'offer' : 'offers'}` : null,
                  ]
                    .filter(Boolean)
                    .join(' · '),
                  ctaLabel: 'Get deal',
                }}
                onPress={() => openDealDetail(data.hero!)}
                onGetDeal={() => getDeal(data.hero!, 'home_hero')}
                onCompare={() =>
                  router.push({ pathname: '/deals/product/[slug]/offers', params: { slug: data.hero!.product.slug, variant: data.hero!.variant.id } })
                }
              />
            </View>
          </View>

          {data.priceDrops.length > 0 && (
            <View style={{ gap: 4 }}>
              <SectionHeader title="Biggest price drops" actionLabel="See all" onAction={() => openFeed('price_drops')} />
              <View>
                {data.priceDrops.map((d, i) => (
                  <PriceDropRow
                    key={d.id}
                    row={{
                      rank: i + 1,
                      image: image(d),
                      brand: d.brand.name,
                      name: dealTitle(d),
                      meta: d.retailer.name,
                      priceCents: d.priceCents,
                      wasCents: d.priceCents != null ? d.priceCents + d.drop7dCents : null,
                      dropLabel: `↓ ${formatPrice(d.drop7dCents)} this week`,
                    }}
                    onPress={() => openDealDetail(d)}
                    last={i === data.priceDrops.length - 1}
                  />
                ))}
              </View>
            </View>
          )}

          {data.trending && data.trending.items.length > 0 && (
            <DealRow
              title={`Trending ${data.trending.category.name.toLowerCase()}`}
              onSeeAll={() => router.push({ pathname: '/deals/category/[slug]', params: { slug: data.trending!.category.slug } })}
              items={data.trending.items}
              sponsored={data.sponsored}
            />
          )}

          {data.collections.map((c) => (
            <CollectionBanner
              key={c.slug}
              eyebrow={c.eyebrow}
              title={c.title}
              detail={`${c.dealCount} ${c.dealCount === 1 ? 'deal' : 'deals'}${c.fromCents != null ? ` · from ${formatPrice(c.fromCents)}` : ''}`}
              ctaLabel="Shop the edit"
              onPress={() => router.push({ pathname: '/deals/collection/[slug]', params: { slug: c.slug } })}
            />
          ))}

          {data.promos.length > 0 && (
            <View style={{ gap: 10 }}>
              <SectionHeader title="Promo codes" actionLabel="See all" onAction={() => openFeed('promo_codes')} />
              <View style={{ paddingHorizontal: 16, gap: 10 }}>
                {data.promos.map((p) => (
                  <PromoCodeRow
                    key={p.id}
                    title={p.title}
                    detail={[p.retailerName, p.endsAt ? formatEndsIn(p.endsAt).replace('Ends in', 'ends in') : null, p.isExclusive ? 'exclusive' : null, p.terms].filter(Boolean).join(' · ')}
                    code={p.code}
                  />
                ))}
              </View>
            </View>
          )}

          <ShopByCategory />

          <NearbyPreOwned />

          {data.under100.length > 0 && (
            <View style={{ gap: 12 }}>
              <SectionHeader title="Under $100" actionLabel="See all" onAction={() => openFeed('under_100')} />
              <DealGrid deals={data.under100} />
            </View>
          )}
        </>
      )}
    </ScrollView>
  );
}

function DealRow({ title, items, onSeeAll, sponsored = [] }: { title: string; items: Deal[]; onSeeAll: () => void; sponsored?: { campaign: string; deal: Deal }[] }) {
  // Sponsored cards sit in the second slot, labelled, and never replace organic ranking.
  const saved = useSavedIds();
  const toggle = useToggleSave();
  const cards: { deal: Deal; sponsoredBy?: string }[] = items.map((deal) => ({ deal }));
  sponsored.forEach((s, i) => cards.splice(Math.min(1 + i * 4, cards.length), 0, { deal: s.deal, sponsoredBy: s.campaign }));
  return (
    <View style={{ gap: 12 }}>
      <SectionHeader title={title} actionLabel="See all" onAction={onSeeAll} />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 12, paddingHorizontal: 16 }}>
        {cards.map(({ deal, sponsoredBy }) => (
          <DealCard
            key={`${deal.id}-${sponsoredBy ?? 'organic'}`}
            width={160}
            deal={toCard(deal, sponsoredBy)}
            saved={saved.deals.has(deal.id)}
            onToggleSave={() => toggle('deal', deal.id, saved.deals.has(deal.id))}
            onPress={() => openDealDetail(deal)}
          />
        ))}
      </ScrollView>
    </View>
  );
}
