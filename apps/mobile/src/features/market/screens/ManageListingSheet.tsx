import { dollarsToCents, formatPrice, radius } from '@pickledeals/shared';
import * as Haptics from 'expo-haptics';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';

import { PersonAvatar, ProductImage } from '@/commerce';
import { useTheme } from '@/design/theme';
import { avatarUrl } from '@/features/profile/avatar';
import { useBuyerCandidates } from '@/features/reviews/hooks';
import { confirm as confirmDialog } from '@/lib/dialog';
import { Button, IconButton, SegmentedControl, Skeleton, Text } from '@/ui';

import { conditionLabel, useMarketNav } from '../components';
import { listingImage, listingTitle, useListingMutations, useMyListings } from '../hooks';

type Status = 'active' | 'pending' | 'sold';
const HELP: Record<Status, string> = {
  active: 'Visible to everyone. Buyers can save it and, soon, message and send offers.',
  pending: 'Still visible, marked Pending. People who saved it get a heads-up.',
  sold: 'Marked sold for good and moved out of search. This can’t be undone.',
};

/** Manage listing (formSheet, design: "Manage listing"): status, edit, delete. */
export default function ManageListingSheet() {
  const { id = '' } = useLocalSearchParams<{ id: string }>();
  const { colors } = useTheme();
  const { data } = useMyListings();
  const l = data?.find((x) => x.id === id);
  const { setStatus } = useListingMutations();
  const { openEdit } = useMarketNav();
  const [status, setLocal] = useState<Status | null>(null);
  const [soldFor, setSoldFor] = useState('');
  // undefined = not chosen yet (defaults to the accepted offer's buyer); null = nobody on PickleDeals.
  const [buyer, setBuyer] = useState<string | null | undefined>(undefined);
  const selling = (status ?? l?.status) === 'sold' && l?.status !== 'sold';
  const candidates = useBuyerCandidates(id, selling).data ?? [];

  if (!l) {
    return (
      <View style={{ padding: 20, gap: 12 }}>
        <Skeleton height={56} />
        <Skeleton height={44} />
      </View>
    );
  }

  const current = l.status as Status;
  const chosen = status ?? current;
  const changed = chosen !== current;

  const picked = buyer === undefined ? (candidates.find((c) => c.accepted)?.buyerId ?? null) : buyer;

  const run = (next: 'active' | 'pending' | 'sold' | 'removed', soldPriceCents?: number) =>
    setStatus.mutate(
      { id: l.id, status: next, soldPriceCents, buyerId: next === 'sold' ? (picked ?? undefined) : undefined },
      {
        onSuccess: () => {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
          router.back();
        },
        onError: (e) => Alert.alert('Couldn’t update the listing', e.message),
      },
    );

  const confirm = async () => {
    if (!changed) return router.back();
    if (chosen !== 'sold') return run(chosen);
    const cents = soldFor ? (dollarsToCents(soldFor) ?? undefined) : undefined;
    if (await confirmDialog('Mark as sold?', 'Sold listings leave search and can’t be reactivated.', 'Mark as sold')) run('sold', cents);
  };

  const remove = async () => {
    if (await confirmDialog('Delete listing?', 'It disappears from the marketplace and from everyone’s saved items.', 'Delete', true)) run('removed');
  };

  return (
    <ScrollView contentContainerStyle={{ padding: 20, gap: 18 }} keyboardShouldPersistTaps="handled">
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <ProductImage source={listingImage(l)} width={56} round={12} padding={5} />
        <View style={{ flex: 1 }}>
          <Text variant="headline" weight="700" numberOfLines={1}>
            {listingTitle(l)}
          </Text>
          <Text variant="footnote" tone="secondary" numeric>
            {formatPrice(l.priceCents)} · {conditionLabel(l.condition)} · {l.saves} {l.saves === 1 ? 'save' : 'saves'}
          </Text>
        </View>
        <IconButton icon="close" label="Close" size={32} tone="surface" onPress={() => router.back()} />
      </View>

      <View style={{ gap: 8 }}>
        <Text variant="badge" tone="tertiary" style={{ fontSize: 13 }}>
          STATUS
        </Text>
        <SegmentedControl
          options={[
            { value: 'active', label: 'Active' },
            { value: 'pending', label: 'Pending' },
            { value: 'sold', label: 'Sold' },
          ]}
          value={chosen}
          onChange={setLocal}
        />
        <Text variant="footnote" tone="secondary">
          {HELP[chosen]}
        </Text>
      </View>

      {chosen === 'sold' && changed && (
        <View style={{ gap: 8 }}>
          <Text variant="badge" tone="tertiary" style={{ fontSize: 13 }}>
            SOLD FOR (OPTIONAL)
          </Text>
          <View style={[styles.price, { backgroundColor: colors.surface }]}>
            <Text variant="headline">$</Text>
            <TextInput
              accessibilityLabel="Sold price"
              value={soldFor}
              onChangeText={(t) => setSoldFor(t.replace(/[^\d]/g, ''))}
              keyboardType="number-pad"
              placeholder={String(Math.round(l.priceCents / 100))}
              placeholderTextColor={colors.textTertiary}
              style={{ flex: 1, fontSize: 17, fontWeight: '600', color: colors.textPrimary, padding: 0, fontVariant: ['tabular-nums'] }}
            />
          </View>
          <Text variant="caption" weight="400" tone="secondary">
            Kept private. It only feeds the anonymous “sells for” range other sellers see.
          </Text>
        </View>
      )}

      {chosen === 'sold' && changed && candidates.length > 0 && (
        <View style={{ gap: 8 }}>
          <Text variant="badge" tone="tertiary" style={{ fontSize: 13 }}>
            WHO’S BUYING? (OPTIONAL)
          </Text>
          <View accessibilityRole="radiogroup" style={{ borderRadius: 14, borderWidth: 1, borderColor: colors.border, overflow: 'hidden' }}>
            {[...candidates.map((c) => ({ key: c.buyerId, name: c.name, detail: c.detail, uri: avatarUrl(c.avatarPath) })), { key: null, name: 'Someone outside PickleDeals', detail: 'Skip linking a buyer', uri: null }].map((b, i) => {
              const on = picked === b.key;
              return (
                <Pressable
                  key={b.key ?? 'outside'}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: on }}
                  onPress={() => setBuyer(b.key)}
                  style={({ pressed }) => [styles.buyer, i > 0 && { borderTopWidth: 1, borderTopColor: colors.separator }, pressed && { backgroundColor: colors.surface }]}>
                  {b.key ? <PersonAvatar name={b.name} uri={b.uri} size={32} /> : <View style={[styles.outside, { backgroundColor: colors.surfacePressed }]}><Text variant="subhead" weight="700">·</Text></View>}
                  <View style={{ flex: 1 }}>
                    <Text variant="subhead" weight="600" numberOfLines={1}>
                      {b.name}
                    </Text>
                    <Text variant="caption" weight="400" tone="secondary" numberOfLines={1} numeric>
                      {b.detail}
                    </Text>
                  </View>
                  <View style={{ width: 22, height: 22, borderRadius: 11, borderWidth: on ? 7 : 1.5, borderColor: on ? colors.interactive : colors.border }} />
                </Pressable>
              );
            })}
          </View>
          <Text variant="caption" weight="400" tone="secondary">
            Linking the buyer lets them review the sale on your profile. Other chats see that it sold.
          </Text>
        </View>
      )}

      <Button label={changed ? `Mark as ${chosen}` : current === 'active' ? 'Keep active' : 'Done'} fullWidth loading={setStatus.isPending} onPress={confirm} />
      <View style={{ flexDirection: 'row', justifyContent: 'space-around' }}>
        <Button
          label="Edit listing"
          variant="link"
          size="sm"
          onPress={() => {
            router.back();
            openEdit(l.id);
          }}
        />
        <Button label="Delete listing" variant="link" size="sm" onPress={remove} />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  buyer: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: 12 },
  outside: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  price: { minHeight: 48, borderRadius: radius.control + 2, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, gap: 6 },
});
