import { formatAgo, formatPrice, radius } from '@pickledeals/shared';
import { router, Stack } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, Share, StyleSheet, View } from 'react-native';

import { ProductImage } from '@/commerce';
import { useTheme } from '@/design/theme';
import { useListingActivity } from '@/features/chat/hooks';
import { Button, EmptyState, IconButton, SegmentedControl, Skeleton, Text } from '@/ui';

import type { MyListing } from '../api';
import { conditionLabel, MarketLoadError, useMarketNav } from '../components';
import { listingImage, listingTitle, useMyListings } from '../hooks';

type Tab = 'active' | 'pending' | 'sold';

/** My listings (design): saves, chats and open offers per listing. */
export default function MyListingsScreen() {
  const { data, isPending, isError, refetch } = useMyListings();
  const [tab, setTab] = useState<Tab>('active');
  const by = (s: Tab) => (data ?? []).filter((l) => l.status === s);

  return (
    <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={{ paddingBottom: 120, paddingHorizontal: 16, gap: 12 }}>
      <Stack.Screen options={{ headerRight: () => <IconButton icon="plus" label="New listing" size={34} tone="solid" onPress={() => router.push('/sell')} /> }} />
      <SegmentedControl
        options={[
          { value: 'active', label: `Active ${by('active').length}` },
          { value: 'pending', label: `Pending ${by('pending').length}` },
          { value: 'sold', label: `Sold ${by('sold').length}` },
        ]}
        value={tab}
        onChange={setTab}
      />
      {isError ? (
        <MarketLoadError onRetry={refetch} />
      ) : isPending ? (
        [0, 1].map((i) => <Skeleton key={i} height={170} round={20} />)
      ) : by(tab).length === 0 ? (
        <EmptyState
          icon="tag"
          title={tab === 'active' ? 'Nothing listed' : tab === 'pending' ? 'No pending sales' : 'No sales yet'}
          message={tab === 'active' ? 'List gear you’ve outgrown — it takes about a minute and it’s free.' : 'Mark a listing pending while you finish a sale.'}
        />
      ) : (
        by(tab).map((l) => <Row key={l.id} l={l} />)
      )}
      {tab === 'active' && !isPending && by('active').length === 0 && <Button label="Sell an item" onPress={() => router.push('/sell')} />}
    </ScrollView>
  );
}

function Row({ l }: { l: MyListing }) {
  const { colors } = useTheme();
  const { openListing, openManage } = useMarketNav();
  const activity = useListingActivity().data?.get(l.id);
  const title = listingTitle(l);
  const primary =
    l.status === 'active'
      ? { label: 'Share listing', run: () => Share.share({ message: `${title} — ${formatPrice(l.priceCents)} on PickleDeals` }).catch(() => {}) }
      : l.status === 'pending'
        ? { label: 'Mark as sold', run: () => openManage(l.id) }
        : { label: 'Sell a similar item', run: () => router.push('/sell') };
  return (
    <View style={[styles.card, { borderColor: colors.border }]}>
      <Pressable accessibilityRole="button" accessibilityLabel={title} onPress={() => openListing(l.id)} style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
        <ProductImage source={listingImage(l)} width={76} round={14} padding={7} />
        <View style={{ flex: 1, gap: 3, minWidth: 0 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <View style={[styles.pill, { backgroundColor: l.status === 'active' ? colors.chip : colors.interactive }]}>
              <Text variant="badge" style={{ fontSize: 10, color: l.status === 'active' ? colors.textPrimary : colors.onInteractive }}>
                {l.status.toUpperCase()}
              </Text>
            </View>
            <Text variant="caption" weight="400" tone="secondary">
              Listed {formatAgo(l.publishedAt)}
            </Text>
          </View>
          <Text variant="subhead" weight="600" numberOfLines={2}>
            {title}
          </Text>
          <Text variant="subhead" numeric>
            <Text variant="subhead" weight="700" numeric>
              {formatPrice(l.priceCents)}
            </Text>
            <Text variant="footnote" tone="secondary">
              {' '}
              · {conditionLabel(l.condition)}
            </Text>
          </Text>
        </View>
      </Pressable>
      <Text variant="footnote" tone="secondary" numeric>
        <Text variant="footnote" weight="700">
          {l.saves}
        </Text>{' '}
        {l.saves === 1 ? 'save' : 'saves'}
        {activity?.chats ? ` · ${activity.chats} ${activity.chats === 1 ? 'chat' : 'chats'}` : ''}
        {activity?.openOffers ? ` · ${activity.openOffers} open ${activity.openOffers === 1 ? 'offer' : 'offers'}` : ''}
        {l.acceptsOffers ? ` · offers on${l.hideBelowCents ? `, hidden below ${formatPrice(l.hideBelowCents)}` : ''}` : ' · offers off'}
      </Text>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <Button label={primary.label} variant="secondary" size="sm" style={{ flex: 1 }} onPress={primary.run} />
        {l.status !== 'sold' && <Button label="Manage" variant="outline" size="sm" style={{ flex: 1 }} onPress={() => openManage(l.id)} />}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: 20, borderWidth: 1, padding: 12, gap: 12 },
  pill: { paddingHorizontal: 6, paddingVertical: 3, borderRadius: radius.badge - 1 },
});
