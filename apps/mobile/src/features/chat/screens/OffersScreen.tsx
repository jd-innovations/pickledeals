import { formatPrice, formatThreadTime, type OfferStatus } from '@pickledeals/shared';
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, RefreshControl, SectionList, View } from 'react-native';

import { haptic } from '@/lib/haptics';
import { ProductImage } from '@/commerce';
import { useTheme } from '@/design/theme';
import { CardSkeleton, Chip, ChipRow, EmptyState, ErrorState, Text } from '@/ui';

import type { MyOffer } from '../api';
import { threadImage } from '../components';
import { useMyOffers } from '../hooks';

const STATUS: Record<OfferStatus, string> = {
  pending: 'Pending',
  accepted: 'Accepted',
  declined: 'Declined',
  countered: 'Countered',
  withdrawn: 'Withdrawn',
  expired: 'Expired',
};

/** Profile → Offers: the latest offer in each negotiation, the ones waiting on you first. */
export default function OffersScreen() {
  const { colors } = useTheme();
  const offers = useMyOffers();
  const [filter, setFilter] = useState<'all' | 'buying' | 'selling'>('all');
  const [pulling, setPulling] = useState(false);

  const rows = (offers.data ?? []).filter((o) => filter === 'all' || (filter === 'buying' ? o.role === 'buyer' : o.role === 'seller'));
  const sections = [
    { title: 'Waiting on you', data: rows.filter((o) => o.awaitingMe) },
    { title: 'Open', data: rows.filter((o) => o.status === 'pending' && !o.awaitingMe) },
    { title: 'Closed', data: rows.filter((o) => o.status !== 'pending') },
  ].filter((s) => s.data.length);

  return (
    <SectionList
      contentInsetAdjustmentBehavior="automatic"
      sections={sections}
      keyExtractor={(o) => o.id}
      stickySectionHeadersEnabled={false}
      contentContainerStyle={{ paddingBottom: 120 }}
      refreshControl={
        <RefreshControl
          refreshing={pulling}
          onRefresh={async () => {
            haptic.tap();
            setPulling(true);
            await offers.refetch();
            setPulling(false);
          }}
        />
      }
      ListHeaderComponent={
        <View style={{ paddingVertical: 8 }}>
          <ChipRow>
            <Chip label="All" selected={filter === 'all'} onPress={() => setFilter('all')} />
            <Chip label="Buying" selected={filter === 'buying'} onPress={() => setFilter('buying')} />
            <Chip label="Selling" selected={filter === 'selling'} onPress={() => setFilter('selling')} />
          </ChipRow>
        </View>
      }
      ListEmptyComponent={
        offers.isPending ? (
          <View style={{ padding: 16, gap: 12 }}>
            <CardSkeleton width={358} />
          </View>
        ) : offers.isError ? (
          <ErrorState title="Couldn’t load your offers" message="Check your connection and try again." onRetry={() => offers.refetch()} />
        ) : (
          <EmptyState icon="tag" title="No offers yet" message="Make an offer from any listing that accepts them. Offers on your listings show up here too." />
        )
      }
      renderSectionHeader={({ section }) => (
        <Text variant="footnote" weight="700" tone="secondary" style={{ paddingHorizontal: 16, paddingTop: 16, paddingBottom: 6 }}>
          {section.title.toUpperCase()}
        </Text>
      )}
      ItemSeparatorComponent={() => <View style={{ height: 1, marginLeft: 84, backgroundColor: colors.separator }} />}
      renderItem={({ item }) => <OfferRow o={item} />}
    />
  );
}

function OfferRow({ o }: { o: MyOffer }) {
  const { colors } = useTheme();
  const who = o.mine ? 'You offered' : `${o.otherName.split(' ')[0]} offered`;
  const solid = o.awaitingMe || o.status === 'accepted';
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${o.listingTitle}. ${who} ${formatPrice(o.amountCents)}. ${STATUS[o.status]}${o.awaitingMe ? ', waiting on you' : ''}`}
      onPress={() => router.push({ pathname: '/conversation/[id]', params: { id: o.conversationId } })}
      style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 12, backgroundColor: pressed ? colors.surface : colors.background })}>
      <ProductImage source={threadImage(o)} width={56} round={14} padding={5} />
      <View style={{ flex: 1, gap: 2, minWidth: 0 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8 }}>
          <Text variant="subhead" weight="600" numberOfLines={1} style={{ flexShrink: 1 }}>
            {o.listingTitle}
          </Text>
          <Text variant="caption" weight="400" tone="tertiary" numeric>
            {formatThreadTime(o.createdAt)}
          </Text>
        </View>
        <Text variant="footnote" tone="secondary" numberOfLines={1}>
          {o.role === 'buyer' ? 'Buying' : 'Selling'} · {o.otherName}
        </Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <View style={{ paddingHorizontal: 6, paddingVertical: 2, borderRadius: 5, backgroundColor: solid ? colors.interactive : colors.chip }}>
            <Text variant="badge" style={{ fontSize: 10, color: solid ? colors.onInteractive : colors.textPrimary }}>
              {o.awaitingMe ? 'REPLY' : STATUS[o.status].toUpperCase()}
            </Text>
          </View>
          <Text variant="subhead" weight={o.awaitingMe ? '700' : '500'} numeric numberOfLines={1}>
            {who} {formatPrice(o.amountCents)}
          </Text>
        </View>
      </View>
    </Pressable>
  );
}
