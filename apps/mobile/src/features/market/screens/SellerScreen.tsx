import { radius } from '@pickledeals/shared';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { useTheme } from '@/design/theme';
import { PersonAvatar } from '@/commerce';
import { useAuth } from '@/features/auth/authStore';
import { useAvatarUrl } from '@/features/profile/avatar';
import { ReviewRow } from '@/features/reviews/components';
import { useSellerReviews } from '@/features/reviews/hooks';
import { Button, EmptyState, SegmentedControl, Skeleton, Text } from '@/ui';

import { ListingGrid, ListingGridSkeleton, MarketLoadError } from '../components';
import { useSeller } from '../hooks';

const monthYear = (iso: string) => new Date(iso).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

/** Seller profile (design: "Seller profile"). Public facts only: name, area label, member since, listings, reviews. */
export default function SellerScreen() {
  const { id = '' } = useLocalSearchParams<{ id: string }>();
  const { colors } = useTheme();
  const { data: s, isError, refetch } = useSeller(id);
  const avatar = useAvatarUrl(id);
  const reviews = useSellerReviews(id).data;
  const [tab, setTab] = useState<'active' | 'sold' | 'reviews'>('active');
  const rated = !!reviews && reviews.count > 0 && reviews.average != null;
  const requireAuth = useAuth((x) => x.requireAuth);
  const uid = useAuth((x) => x.user?.id);

  return (
    <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={{ paddingBottom: 120, gap: 20 }}>
      <Stack.Screen options={{ title: '' }} />
      {isError ? (
        <MarketLoadError onRetry={refetch} />
      ) : !s ? (
        <View style={{ alignItems: 'center', gap: 10, paddingTop: 16 }}>
          <Skeleton width={88} height={88} round={44} />
          <Skeleton width={160} height={24} />
          <ListingGridSkeleton count={2} />
        </View>
      ) : (
        <>
          <View style={{ alignItems: 'center', gap: 8, paddingHorizontal: 16 }}>
            <PersonAvatar name={s.name} uri={avatar} size={88} />
            <Text variant="title1" style={{ marginTop: 6 }}>
              {s.name}
            </Text>
            <Text variant="subhead" weight="400" tone="secondary" align="center" numeric>
              {[s.areaLabel, `member since ${monthYear(s.memberSince)}`].filter(Boolean).join(' · ')}
            </Text>
          </View>

          <View style={[styles.stats, { backgroundColor: colors.surface }]}>
            {[
              { key: 'active', value: String(s.active.length), label: 'Active' },
              { key: 'sold', value: String(s.sold.length), label: 'Sold' },
              ...(rated ? [{ key: 'reviews', value: `★ ${reviews.average!.toFixed(1)}`, label: reviews.count === 1 ? '1 review' : `${reviews.count} reviews` }] : []),
            ].map((x, i) => (
              <Pressable
                key={x.key}
                accessibilityRole="button"
                accessibilityLabel={x.key === 'reviews' ? `Rated ${reviews!.average!.toFixed(1)} out of 5, ${x.label}` : `${x.value} ${x.label}`}
                onPress={() => setTab(x.key as typeof tab)}
                style={[styles.stat, i > 0 && { borderLeftWidth: 1, borderLeftColor: colors.background }]}>
                <Text variant="title2" numeric>
                  {x.value}
                </Text>
                <Text variant="caption" weight="400" tone="secondary">
                  {x.label}
                </Text>
              </Pressable>
            ))}
          </View>

          <View style={{ paddingHorizontal: 16 }}>
            <SegmentedControl
              options={[
                { value: 'active', label: `Active ${s.active.length}` },
                { value: 'sold', label: `Sold ${s.sold.length}` },
                ...(rated ? [{ value: 'reviews' as const, label: `Reviews ${reviews.count}` }] : []),
              ]}
              value={tab}
              onChange={setTab}
            />
          </View>

          {tab === 'reviews' && rated ? (
            <View style={{ paddingHorizontal: 16 }}>
              {reviews.items.map((r, i) => (
                <ReviewRow key={r.id} r={r} divider={i > 0} />
              ))}
              {reviews.count > reviews.items.length && (
                <Text variant="caption" weight="400" tone="tertiary" numeric>
                  Showing the newest {reviews.items.length} of {reviews.count}.
                </Text>
              )}
            </View>
          ) : (tab === 'reviews' ? [] : tab === 'active' ? s.active : s.sold).length ? (
            <ListingGrid items={tab === 'active' ? s.active : s.sold} />
          ) : (
            <EmptyState icon="tag" title={tab === 'sold' ? 'No sales yet' : 'Nothing for sale right now'} message="Save a listing to hear when it changes." />
          )}

          {id !== uid && (
            <Button
              label="Report this seller"
              variant="link"
              size="sm"
              style={{ alignSelf: 'flex-start', marginHorizontal: 16 }}
              onPress={() => requireAuth('report', () => router.push({ pathname: '/report', params: { type: 'user', id, name: s.name } }))}
            />
          )}
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  stats: { marginHorizontal: 16, flexDirection: 'row', borderRadius: radius.card + 2 },
  stat: { flex: 1, padding: 14, alignItems: 'center', gap: 2 },
});
