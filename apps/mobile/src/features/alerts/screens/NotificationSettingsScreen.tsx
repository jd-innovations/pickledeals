import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { useTheme } from '@/design/theme';
import { radiusLabel } from '@/features/market/components';
import { chooseAction } from '@/lib/dialog';
import { ErrorState, Icon, Skeleton, Text, Toggle } from '@/ui';

import type { NotificationCategory } from '../api';
import { useNotificationSettings, useNotificationSettingsMutations } from '../hooks';

const QUIET_PRESETS = [
  { start: '21:00', end: '07:00' },
  { start: '22:00', end: '07:00' },
  { start: '22:00', end: '08:00' },
  { start: '23:00', end: '08:00' },
] as const;
const CAP_PRESETS = [1, 3, 5, null] as const;

const clock = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number);
  const suffix = h! < 12 ? 'AM' : 'PM';
  const h12 = h! % 12 === 0 ? 12 : h! % 12;
  return m ? `${h12}:${String(m).padStart(2, '0')} ${suffix}` : `${h12} ${suffix}`;
};
const capLabel = (n: number | null) => (n == null ? 'No limit' : `Up to ${n}`);

/** Notification preferences (design: NotifPrefs). Only things you asked for; no promotional pushes. */
export default function NotificationSettingsScreen() {
  const { colors } = useTheme();
  const settings = useNotificationSettings();
  const { setCategory, setDelivery } = useNotificationSettingsMutations();
  const s = settings.data;

  const groups: { label: string; rows: { key: NotificationCategory; title: string; detail: string }[] }[] = [
    {
      label: 'Deals & prices',
      rows: [
        { key: 'price_drop', title: 'Price drops', detail: 'On products and deals you saved' },
        { key: 'target_price', title: 'Target price reached', detail: 'Your price alerts' },
        { key: 'brand_deal', title: 'Followed brands', detail: 'New deals from brands you follow' },
        { key: 'saved_search', title: 'Saved searches', detail: 'New matches for your saved searches' },
        { key: 'weekly_digest', title: 'Weekly best deals', detail: 'One summary, Sunday morning' },
      ],
    },
    {
      label: 'Pre-owned',
      rows: [
        { key: 'offer', title: 'Offers & counteroffers', detail: 'Received, countered, accepted, expiring' },
        { key: 'new_message', title: 'Messages', detail: 'From buyers and sellers' },
        { key: 'nearby_listing', title: 'Nearby listings', detail: s ? `Matches within ${radiusLabel(s.radiusM)}` : 'Matches near you' },
        { key: 'listing_update', title: 'Listing updates', detail: 'Pending or sold on items you saved' },
      ],
    },
  ];

  const pickQuiet = () =>
    chooseAction('Quiet hours', [
      { text: 'Off', onPress: () => setDelivery.mutate({ quietEnabled: false }) },
      ...QUIET_PRESETS.map((p) => ({ text: `${clock(p.start)} – ${clock(p.end)}`, onPress: () => setDelivery.mutate({ quietEnabled: true, quietStart: p.start, quietEnd: p.end }) })),
    ]);
  const pickCap = () => chooseAction('Deal alerts per day', CAP_PRESETS.map((n) => ({ text: capLabel(n), onPress: () => setDelivery.mutate({ dailyDealCap: n }) })));

  return (
    <ScrollView contentInsetAdjustmentBehavior="automatic" style={{ backgroundColor: colors.surface }} contentContainerStyle={{ paddingBottom: 120 }}>
      <Text variant="subhead" weight="400" tone="secondary" style={{ paddingHorizontal: 16, paddingTop: 6, lineHeight: 21 }}>
        Only things you asked for. No promotional pushes, ever.
      </Text>

      {settings.isError ? (
        <ErrorState title="Couldn’t load your settings" message="Check your connection and try again." onRetry={() => settings.refetch()} />
      ) : !s ? (
        <View style={{ padding: 16, gap: 12 }}>
          <Skeleton height={220} round={16} />
          <Skeleton height={180} round={16} />
        </View>
      ) : (
        <>
          {groups.map((g) => (
            <Section key={g.label} label={g.label}>
              {g.rows.map((r, i) => (
                <View key={r.key} style={[styles.row, i < g.rows.length - 1 && { borderBottomWidth: 1, borderBottomColor: colors.separator }]}>
                  <View style={{ flex: 1, gap: 1 }}>
                    <Text variant="callout">{r.title}</Text>
                    <Text variant="caption" weight="400" tone="secondary">
                      {r.detail}
                    </Text>
                  </View>
                  <Toggle
                    accessibilityLabel={r.title}
                    value={s.categories[r.key]}
                    onValueChange={(enabled) => setCategory.mutate({ category: r.key, enabled })}
                  />
                </View>
              ))}
            </Section>
          ))}

          <Section label="Delivery" footnote="During quiet hours, offers and messages wait in a morning summary.">
            <DeliveryRow title="Quiet hours" value={s.quietEnabled ? `${clock(s.quietStart)} – ${clock(s.quietEnd)}` : 'Off'} onPress={pickQuiet} divider />
            <DeliveryRow title="Deal alerts per day" value={capLabel(s.dailyDealCap)} onPress={pickCap} />
          </Section>
        </>
      )}
    </ScrollView>
  );
}

function Section({ label, footnote, children }: { label: string; footnote?: string; children: React.ReactNode }) {
  const { colors } = useTheme();
  return (
    <View style={{ paddingTop: 22, paddingHorizontal: 16, gap: 6 }}>
      <Text variant="footnote" weight="600" tone="secondary" style={{ paddingHorizontal: 16 }}>
        {label}
      </Text>
      <View style={{ borderRadius: 16, backgroundColor: colors.background, overflow: 'hidden' }}>{children}</View>
      {footnote && (
        <Text variant="caption" weight="400" tone="secondary" style={{ paddingHorizontal: 16 }}>
          {footnote}
        </Text>
      )}
    </View>
  );
}

function DeliveryRow({ title, value, onPress, divider }: { title: string; value: string; onPress: () => void; divider?: boolean }) {
  const { colors } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${title}: ${value}. Change`}
      onPress={onPress}
      style={({ pressed }) => [styles.delivery, divider && { borderBottomWidth: 1, borderBottomColor: colors.separator }, { backgroundColor: pressed ? colors.surfacePressed : 'transparent' }]}>
      <Text variant="callout" style={{ flex: 1 }}>
        {title}
      </Text>
      <Text variant="subhead" weight="400" tone="secondary" numeric>
        {value}
      </Text>
      <Icon name="chevronRight" size={13} color={colors.textTertiary} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 11, paddingHorizontal: 16 },
  delivery: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 14, paddingHorizontal: 16 },
});
