import { formatAgo, formatPrice, radius } from '@pickledeals/shared';
import { router, Stack, type Href } from 'expo-router';
import { useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';

import { ProductImage } from '@/commerce';
import { useTheme } from '@/design/theme';
import { useAuth } from '@/features/auth/authStore';
import { productImage } from '@/features/catalog/hooks';
import { useDealFilterStore, EMPTY_FILTERS } from '@/features/deals/hooks';
import { DEFAULT_MARKET_FILTERS, useMarketFilters, useMarketSearch } from '@/features/market/hooks';
import { Button, EmptyState, Icon, IconButton, SegmentedControl, Skeleton, Text, Toggle, type IconName } from '@/ui';

import type { AppNotification, PriceAlert, SavedSearch } from '../api';
import { useAlertPrices, useAlerts, useMeMutations, useNotifications, useSavedSearches } from '../hooks';

type Section = 'activity' | 'alerts' | 'searches';

/** D5 (revised): Alerts is event-oriented — Activity, Price alerts, Saved searches. */
export default function AlertsScreen() {
  const [section, setSection] = useState<Section>('activity');
  const user = useAuth((s) => s.user);
  const requireAuth = useAuth((s) => s.requireAuth);
  const notifications = useNotifications();
  const { markRead } = useMeMutations();
  const unread = (notifications.data ?? []).filter((n) => !n.readAt).length;

  return (
    <ScrollView
      contentInsetAdjustmentBehavior="automatic"
      contentContainerStyle={{
        paddingHorizontal: 16,
        paddingBottom: 120,
        gap: 16,
      }}
      refreshControl={user ? <RefreshControl refreshing={notifications.isRefetching} onRefresh={() => notifications.refetch()} /> : undefined}>
      <Stack.Screen
        options={{
          headerRight: () =>
            section === 'activity' && unread > 0 ? <Button label="Mark all read" variant="link" size="sm" onPress={() => markRead.mutate(undefined)} /> : null,
        }}
      />
      <SegmentedControl
        options={[
          {
            value: 'activity',
            label: unread ? `Activity · ${unread}` : 'Activity',
          },
          { value: 'alerts', label: 'Alerts' },
          { value: 'searches', label: 'Searches' },
        ]}
        value={section}
        onChange={setSection}
      />
      {!user ? (
        <EmptyState
          icon="bell"
          title="Get notified when prices drop"
          message="Set a target price on any product and we’ll tell you when it’s time to buy."
          actionLabel="Sign in"
          onAction={() => requireAuth('create_price_alert', () => {})}
        />
      ) : section === 'activity' ? (
        <Activity items={notifications.data} />
      ) : section === 'alerts' ? (
        <Alerts />
      ) : (
        <Searches />
      )}
    </ScrollView>
  );
}

/** One icon per notification category (Phase 10). */
const TYPE_ICON: Record<string, IconName> = {
  price_drop: 'arrowDown',
  target_price: 'bell',
  brand_deal: 'tag',
  saved_search: 'search',
  weekly_digest: 'tag',
  offer: 'tag',
  nearby_listing: 'pin',
  listing_update: 'clock',
};

function Activity({ items }: { items: AppNotification[] | undefined }) {
  const { colors } = useTheme();
  const { markRead } = useMeMutations();
  if (!items) return <Skeleton height={64} round={14} />;
  if (items.length === 0) {
    return <EmptyState icon="bell" title="Nothing yet" message="Price drops, deals from brands you follow and saved-search matches will show up here." />;
  }
  return (
    <View>
      {items.map((n, i) => (
        <Pressable
          key={n.id}
          accessibilityRole="button"
          accessibilityLabel={`${n.readAt ? '' : 'Unread. '}${n.title}. ${n.body}`}
          onPress={() => {
            if (!n.readAt) markRead.mutate([n.id]);
            if (n.route) router.push(n.route as Href);
          }}
          style={({ pressed }) => [
            styles.note,
            {
              opacity: pressed ? 0.7 : 1,
              borderBottomColor: colors.separator,
              borderBottomWidth: i === items.length - 1 ? 0 : StyleSheet.hairlineWidth,
            },
          ]}>
          <View
            style={[
              styles.dot,
              {
                backgroundColor: n.readAt ? 'transparent' : colors.interactive,
              },
            ]}
          />
          <View style={[styles.typeIcon, { backgroundColor: colors.surface }]}>
            <Icon name={TYPE_ICON[n.type] ?? 'bell'} size={16} color={colors.textPrimary} />
          </View>
          <View style={{ flex: 1, gap: 2 }}>
            <Text variant="subhead" weight={n.readAt ? '600' : '700'}>
              {n.title}
            </Text>
            <Text variant="footnote" tone="secondary">
              {n.body}
            </Text>
            <Text variant="caption" weight="400" tone="tertiary">
              {formatAgo(n.createdAt)}
            </Text>
          </View>
        </Pressable>
      ))}
    </View>
  );
}

function Alerts() {
  const { data } = useAlerts();
  const prices = useAlertPrices([...new Set((data ?? []).map((a) => a.product.id))]);
  if (!data) return <Skeleton height={120} round={16} />;
  if (data.length === 0) {
    return (
      <EmptyState
        icon="bell"
        title="No price alerts"
        message="Open any product and tap Price alert to pick a target."
        actionLabel="Browse deals"
        onAction={() => router.push('/deals')}
      />
    );
  }
  return (
    <View style={{ gap: 12 }}>
      {data.map((a) => {
        const scoped = (prices.data ?? []).filter((p) => p.productId === a.product.id && (!a.variant || p.variantId === a.variant.id));
        const now = scoped.length ? Math.min(...scoped.map((p) => p.cents)) : null;
        return <AlertCard key={a.id} alert={a} nowCents={now} />;
      })}
    </View>
  );
}

function AlertCard({ alert: a, nowCents }: { alert: PriceAlert; nowCents: number | null }) {
  const { colors } = useTheme();
  const { setAlertStatus } = useMeMutations();
  const paused = a.status === 'paused';
  // Progress toward the target: full when the price is at or below it.
  const progress = nowCents == null ? 0 : Math.max(0.04, Math.min(1, a.targetCents / nowCents));
  return (
    <View style={[styles.card, { backgroundColor: colors.surface, opacity: paused ? 0.6 : 1 }]}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <Pressable
          accessibilityRole="button"
          onPress={() =>
            router.push({
              pathname: '/deals/product/[slug]',
              params: { slug: a.product.slug },
            })
          }
          style={{
            flex: 1,
            flexDirection: 'row',
            alignItems: 'center',
            gap: 12,
          }}>
          <ProductImage
            source={productImage({
              slug: a.product.slug,
              name: a.product.name,
              brand: { slug: '', name: a.product.brand },
              category: a.product.category,
              image: a.product.image,
            })}
            width={48}
            round={12}
            padding={5}
          />
          <View style={{ flex: 1, gap: 2 }}>
            <Text variant="subhead" weight="700" numberOfLines={1}>
              {a.product.brand} {a.product.name}
              {a.variant ? ` ${a.variant.label}` : ''}
            </Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <Icon name="bell" size={12} filled={!paused} color={paused ? colors.textTertiary : colors.alert} />
              <Text variant="caption" weight="400" tone="secondary" style={{ flexShrink: 1 }}>
                {paused ? 'Paused' : 'New offers'}
                {a.lastNotifiedCents ? ` · last alerted at ${formatPrice(a.lastNotifiedCents)}` : ''}
              </Text>
            </View>
          </View>
        </Pressable>
        <IconButton
          icon="more"
          label={paused ? 'Resume alert' : 'Pause alert'}
          size={32}
          onPress={() =>
            setAlertStatus.mutate({
              id: a.id,
              status: paused ? 'active' : 'paused',
            })
          }
        />
      </View>
      <View
        accessibilityLabel={`Now ${nowCents != null ? formatPrice(nowCents) : 'no price'}, target ${formatPrice(a.targetCents)}`}
        style={[styles.track, { backgroundColor: colors.border }]}>
        <View
          style={{
            width: `${progress * 100}%`,
            height: 5,
            borderRadius: 3,
            backgroundColor: colors.interactive,
          }}
        />
      </View>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        <Text variant="caption" weight="400" tone="secondary" numeric>
          Now{' '}
          <Text variant="caption" weight="700">
            {nowCents != null ? formatPrice(nowCents) : '—'}
          </Text>
        </Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Edit target, ${formatPrice(a.targetCents)}`}
          hitSlop={8}
          onPress={() =>
            router.push({
              pathname: '/deals/price-alert',
              params: { slug: a.product.slug, variant: a.variant?.id ?? '' },
            })
          }>
          <Text variant="caption" weight="400" tone="secondary" numeric>
            Target{' '}
            <Text variant="caption" weight="700">
              {formatPrice(a.targetCents)}
            </Text>{' '}
            · Edit
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

function Searches() {
  const { colors } = useTheme();
  const { data } = useSavedSearches();
  const { updateSearch, deleteSearch } = useMeMutations();
  if (!data) return <Skeleton height={56} round={14} />;
  if (data.length === 0) {
    return <EmptyState icon="search" title="No saved searches" message="On any category or in the marketplace, tap Save search to hear about new matches." />;
  }
  const open = (s: SavedSearch) => {
    if (s.scope === 'market') {
      useMarketFilters.getState().set({ ...DEFAULT_MARKET_FILTERS, category: s.categorySlug, maxCents: s.maxCents ?? undefined });
      useMarketSearch.getState().setText(s.query ?? '');
      router.push('/market');
      return;
    }
    if (!s.categorySlug) return;
    useDealFilterStore.getState().set(`category:${s.categorySlug}`, {
      ...EMPTY_FILTERS,
      maxCents: s.maxCents ?? undefined,
    });
    router.push({
      pathname: '/deals/category/[slug]',
      params: { slug: s.categorySlug },
    });
  };
  return (
    <View>
      {data.map((s, i) => (
        <View
          key={s.id}
          style={[
            styles.search,
            {
              borderBottomColor: colors.separator,
              borderBottomWidth: i === data.length - 1 ? 0 : StyleSheet.hairlineWidth,
            },
          ]}>
          <Pressable accessibilityRole="button" onPress={() => open(s)} style={{ flex: 1, gap: 2 }}>
            <Text variant="subhead" weight="700">
              {s.label}
            </Text>
            <Text variant="caption" weight="400" tone="secondary">
              {s.notify ? (s.scope === 'market' ? 'Notifying on new listings near you' : 'Notifying on new deals') : 'Notifications off'} · saved{' '}
              {formatAgo(s.createdAt)}
            </Text>
          </Pressable>
          <Toggle accessibilityLabel={`Notify for ${s.label}`} value={s.notify} onValueChange={(v) => updateSearch.mutate({ id: s.id, notify: v })} />
          <IconButton icon="close" label={`Delete ${s.label}`} size={30} onPress={() => deleteSearch.mutate(s.id)} />
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  note: { flexDirection: 'row', gap: 10, paddingVertical: 12 },
  dot: { width: 8, height: 8, borderRadius: 4, marginTop: 6 },
  typeIcon: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  card: { padding: 14, borderRadius: radius.card, gap: 10 },
  track: { height: 5, borderRadius: 3, overflow: 'hidden' },
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 12,
  },
});
