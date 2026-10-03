import { dollarsToCents, radius } from '@pickledeals/shared';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Alert, ScrollView, StyleSheet, Switch, TextInput, View } from 'react-native';

import { useTheme } from '@/design/theme';
import { Button, Skeleton, Text } from '@/ui';

import type { MyListing } from '../api';
import { listingTitle, useListingMutations, useMyListings } from '../hooks';

const dollars = (c: number | null) => (c == null ? '' : String(Math.round(c / 100)));

/** Edit price, description and offer settings (formSheet). Server re-checks prohibited terms. */
export default function EditListingSheet() {
  const { id = '' } = useLocalSearchParams<{ id: string }>();
  const { data } = useMyListings();
  const l = data?.find((x) => x.id === id);
  if (!l) {
    return (
      <View style={{ padding: 20, gap: 12 }}>
        <Skeleton height={48} />
        <Skeleton height={120} />
      </View>
    );
  }
  return <EditForm l={l} />;
}

function EditForm({ l }: { l: MyListing }) {
  const { colors } = useTheme();
  const { update } = useListingMutations();
  const [price, setPrice] = useState(dollars(l.priceCents));
  const [description, setDescription] = useState(l.description);
  const [acceptsOffers, setAcceptsOffers] = useState(l.acceptsOffers);
  const [floor, setFloor] = useState(dollars(l.hideBelowCents));
  const [pickup, setPickup] = useState(l.pickup);
  const [ships, setShips] = useState(l.ships);

  const priceCents = dollarsToCents(price);
  const valid = priceCents != null && priceCents >= 100 && (pickup || ships);

  const save = () =>
    update.mutate(
      {
        id: l.id,
        changes: {
          price_cents: priceCents!,
          description: description.trim(),
          accepts_offers: acceptsOffers,
          hide_offers_below_cents: acceptsOffers && floor ? dollarsToCents(floor) : null,
          pickup,
          ships,
        },
      },
      { onSuccess: () => router.back(), onError: (e) => Alert.alert('Couldn’t save', e.message) },
    );

  const toggle = (label: string, detail: string, value: boolean, set: (v: boolean) => void, last?: boolean) => (
    <View style={[styles.row, !last && { borderBottomWidth: 1, borderBottomColor: colors.separator }]}>
      <View style={{ flex: 1 }}>
        <Text variant="subhead" weight="600">
          {label}
        </Text>
        <Text variant="caption" weight="400" tone="secondary">
          {detail}
        </Text>
      </View>
      <Switch accessibilityLabel={label} value={value} onValueChange={set} trackColor={{ true: colors.interactive, false: colors.border }} />
    </View>
  );

  return (
    <View style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={{ padding: 20, gap: 18 }} keyboardShouldPersistTaps="handled">
        <View style={{ gap: 4 }}>
          <Text variant="title2">Edit listing</Text>
          <Text variant="footnote" tone="secondary" numberOfLines={1}>
            {listingTitle(l)}
          </Text>
        </View>

        <View style={[styles.field, { backgroundColor: colors.surface }]}>
          <Text variant="caption" tone="secondary">
            Price
          </Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <Text variant="title2">$</Text>
            <TextInput
              accessibilityLabel="Price in dollars"
              value={price}
              onChangeText={(t) => setPrice(t.replace(/[^\d]/g, ''))}
              keyboardType="number-pad"
              style={{ flex: 1, fontSize: 22, fontWeight: '700', color: colors.textPrimary, padding: 0, fontVariant: ['tabular-nums'] }}
            />
          </View>
        </View>

        <View style={[styles.field, { backgroundColor: colors.surface }]}>
          <Text variant="caption" tone="secondary">
            Description
          </Text>
          <TextInput
            accessibilityLabel="Description"
            value={description}
            onChangeText={setDescription}
            multiline
            maxLength={1000}
            style={{ minHeight: 96, fontSize: 16, lineHeight: 22, color: colors.textPrimary, padding: 0, textAlignVertical: 'top' }}
          />
          <Text variant="caption" weight="400" tone="tertiary" align="right" numeric>
            {description.length} / 1000
          </Text>
        </View>

        <View style={[styles.box, { borderColor: colors.border }]}>
          {toggle('Accept offers', 'Buyers can send structured offers', acceptsOffers, setAcceptsOffers)}
          {acceptsOffers && (
            <View style={[styles.row, { borderBottomWidth: 1, borderBottomColor: colors.separator }]}>
              <Text variant="subhead" weight="600" style={{ flex: 1 }}>
                Hide offers below
              </Text>
              <Text variant="subhead" tone="secondary">
                $
              </Text>
              <TextInput
                accessibilityLabel="Hide offers below, in dollars"
                value={floor}
                onChangeText={(t) => setFloor(t.replace(/[^\d]/g, ''))}
                keyboardType="number-pad"
                placeholder="None"
                placeholderTextColor={colors.textTertiary}
                style={{ width: 70, fontSize: 15, color: colors.textPrimary, padding: 0, textAlign: 'right', fontVariant: ['tabular-nums'] }}
              />
            </View>
          )}
          {toggle('Local pickup', 'Meet up in your area', pickup, setPickup)}
          {toggle('Will ship', 'You and the buyer arrange postage', ships, setShips, true)}
        </View>
      </ScrollView>
      <View style={[styles.footer, { borderTopColor: colors.separator }]}>
        <Button label="Save changes" fullWidth disabled={!valid} loading={update.isPending} onPress={save} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  field: { padding: 12, paddingHorizontal: 14, borderRadius: radius.card, gap: 6 },
  box: { borderRadius: radius.card, borderWidth: 1 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingVertical: 12 },
  footer: { padding: 16, paddingBottom: 28, borderTopWidth: StyleSheet.hairlineWidth },
});
