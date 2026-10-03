import { radius } from '@pickledeals/shared';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { useTheme } from '@/design/theme';
import { useAuth } from '@/features/auth/authStore';
import { Button, EmptyState, SegmentedControl, Skeleton, Text } from '@/ui';

import { ListingGrid, ListingGridSkeleton, MarketLoadError } from '../components';
import { useSeller } from '../hooks';

const monthYear = (iso: string) => new Date(iso).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

/** Seller profile (design: "Seller profile"). Public facts only: name, area label, member since, listings. */
export default function SellerScreen() {
  const { id = '' } = useLocalSearchParams<{ id: string }>();
  const { colors } = useTheme();
  const { data: s, isError, refetch } = useSeller(id);
  const [tab, setTab] = useState<'active' | 'sold'>('active');
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
            <View style={[styles.avatar, { backgroundColor: colors.surfacePressed }]}>
              <Text variant="largeTitle">{s.name.charAt(0)}</Text>
            </View>
            <Text variant="title1" style={{ marginTop: 6 }}>
              {s.name}
            </Text>
            <Text variant="subhead" weight="400" tone="secondary" align="center" numeric>
              {[s.areaLabel, `member since ${monthYear(s.memberSince)}`].filter(Boolean).join(' · ')}
            </Text>
          </View>

          <View style={[styles.stats, { backgroundColor: colors.surface }]}>
            {[
              ['Active', s.active.length],
              ['Sold', s.sold.length],
            ].map(([label, n], i) => (
              <View key={label} style={[styles.stat, i > 0 && { borderLeftWidth: 1, borderLeftColor: colors.background }]}>
                <Text variant="title2" numeric>
                  {n}
                </Text>
                <Text variant="caption" weight="400" tone="secondary">
                  {label}
                </Text>
              </View>
            ))}
          </View>

          <View style={{ paddingHorizontal: 16 }}>
            <SegmentedControl
              options={[
                { value: 'active', label: `Active ${s.active.length}` },
                { value: 'sold', label: `Sold ${s.sold.length}` },
              ]}
              value={tab}
              onChange={setTab}
            />
          </View>

          {(tab === 'active' ? s.active : s.sold).length ? (
            <ListingGrid items={tab === 'active' ? s.active : s.sold} />
          ) : (
            <EmptyState icon="tag" title={tab === 'active' ? 'Nothing for sale right now' : 'No sales yet'} message="Save a listing to hear when it changes." />
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
  avatar: { width: 88, height: 88, borderRadius: 44, alignItems: 'center', justifyContent: 'center' },
  stats: { marginHorizontal: 16, flexDirection: 'row', borderRadius: radius.card + 2 },
  stat: { flex: 1, padding: 14, alignItems: 'center', gap: 2 },
});
