import { radius, snapToCell } from '@pickledeals/shared';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, Platform, StyleSheet, Switch, TextInput, View } from 'react-native';

import { useTheme } from '@/design/theme';
import { AreaMap } from '@/features/map';
import { Button, Icon, Text, TextField } from '@/ui';

import { geocodeArea, getDeviceArea, type DeviceArea } from '../device';
import { useSellDraft, useViewer } from '../hooks';
import { SellFrame } from './SellFrame';

/** Step 5 — description, approximate location (D2) and handover options. */
export default function SellDetailsStep() {
  const { colors } = useTheme();
  const { draft, update } = useSellDraft();
  const viewer = useViewer();
  const [busy, setBusy] = useState<'gps' | 'search' | null>(null);
  const [pending, setPending] = useState<DeviceArea | null>(null);
  const [label, setLabel] = useState('');
  // "Change" (or no area yet) offers current location or a city/ZIP search, like the Marketplace sheet.
  const [choosing, setChoosing] = useState(false);
  const [query, setQuery] = useState('');

  // Reuse the area the buyer side already knows about, if any (still only a point the server snaps).
  useEffect(() => {
    if (!draft.location && viewer.point && viewer.label) update({ location: { ...viewer.point, label: viewer.label, postalCode: null } });
  }, [draft.location, viewer.point, viewer.label, update]);

  const searchable = Platform.OS !== 'web'; // expo-location geocoding is native-only

  const choose = (area: DeviceArea) => {
    if (area.label) {
      update({ location: { lat: area.lat, lng: area.lng, label: area.label, postalCode: area.postalCode } });
      setChoosing(false);
    } else {
      setPending(area);
      setLabel('');
    }
  };

  const locate = async () => {
    setBusy('gps');
    try {
      const area = await getDeviceArea();
      if (area === 'denied') {
        Alert.alert(
          'Location is off',
          searchable
            ? 'Search for your city or ZIP instead, or allow location for PickleDeals in Settings. Buyers only ever see an approximate area.'
            : 'Allow location for PickleDeals in Settings. We only use it to show buyers an approximate area.',
        );
        setChoosing(true);
        return;
      }
      choose(area);
    } catch {
      Alert.alert('Couldn’t find you', searchable ? 'Try again, or search for your city or ZIP.' : 'Try again in a moment.');
    } finally {
      setBusy(null);
    }
  };

  const find = async () => {
    if (!query.trim()) return;
    setBusy('search');
    try {
      const area = await geocodeArea(query.trim());
      if (!area) Alert.alert('No match', 'Try a city name or a 5-digit ZIP.');
      else choose(area);
    } finally {
      setBusy(null);
    }
  };

  const valid = !!draft.location && (draft.pickup || draft.ships);

  return (
    <SellFrame step={5} title="Details & handover" ctaLabel="Preview listing" ctaDisabled={!valid} onContinue={() => router.push('/sell/preview')}>
      <View style={[styles.field, { backgroundColor: colors.surface }]}>
        <Text variant="caption" tone="secondary">
          Description
        </Text>
        <TextInput
          accessibilityLabel="Description"
          value={draft.description}
          onChangeText={(t) => update({ description: t })}
          multiline
          maxLength={1000}
          placeholder="How much it’s been played, any flaws, what’s included…"
          placeholderTextColor={colors.textTertiary}
          style={{ minHeight: 96, fontSize: 16, lineHeight: 22, color: colors.textPrimary, padding: 0, textAlignVertical: 'top' }}
        />
        <Text variant="caption" weight="400" tone="tertiary" align="right" numeric>
          {draft.description.length} / 1000
        </Text>
      </View>

      <View style={{ gap: 10 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' }}>
          <Text variant="headline" weight="700">
            Location
          </Text>
          {draft.location && !pending && (
            <Button label={choosing ? 'Cancel' : 'Change'} variant="link" size="sm" onPress={() => setChoosing(!choosing)} />
          )}
        </View>
        {pending ? (
          <View style={{ gap: 10 }}>
            <TextField label="Area name buyers see" placeholder="e.g. Lakewood Ranch, FL" value={label} onChangeText={setLabel} maxLength={40} autoFocus />
            <Button
              label="Use this area"
              size="md"
              disabled={label.trim().length < 2}
              onPress={() => {
                update({ location: { lat: pending.lat, lng: pending.lng, label: label.trim(), postalCode: null } });
                setPending(null);
                setChoosing(false);
              }}
            />
          </View>
        ) : draft.location && !choosing ? (
          <View style={{ borderRadius: 18, overflow: 'hidden' }}>
            {/* Preview the exact cell the server will snap to — what buyers will see (D2). */}
            <AreaMap center={snapToCell(draft.location.lat, draft.location.lng)} height={150} label={draft.location.label} labelStyle="title" areaName={draft.location.label} />
          </View>
        ) : (
          <View style={{ gap: 10 }}>
            <Button label="Use my approximate location" icon="pin" iconPosition="leading" variant="secondary" loading={busy === 'gps'} onPress={locate} />
            {searchable && (
              <View style={{ flexDirection: 'row', gap: 10, alignItems: 'flex-end' }}>
                <TextField
                  label="Or search"
                  placeholder="City or ZIP"
                  value={query}
                  onChangeText={setQuery}
                  onSubmitEditing={find}
                  returnKeyType="search"
                  autoCapitalize="words"
                  containerStyle={{ flex: 1 }}
                />
                <Button label="Find" variant="secondary" size="md" loading={busy === 'search'} onPress={find} />
              </View>
            )}
          </View>
        )}
        <View style={{ flexDirection: 'row', gap: 6 }}>
          <Icon name="shield" size={14} color={colors.textSecondary} />
          <Text variant="footnote" tone="secondary" style={{ flex: 1, lineHeight: 18 }}>
            Buyers see this area and a distance, never your address. Share a meet-up spot in chat when you’re ready.
          </Text>
        </View>
      </View>

      <View style={{ borderRadius: radius.card, borderWidth: 1, borderColor: colors.border }}>
        {[
          { label: 'Local pickup', detail: 'Meet up in your area', value: draft.pickup, set: (v: boolean) => update({ pickup: v }) },
          { label: 'Will ship', detail: 'You and the buyer arrange postage', value: draft.ships, set: (v: boolean) => update({ ships: v }) },
        ].map((r, i) => (
          <View key={r.label} style={[styles.row, i === 0 && { borderBottomWidth: 1, borderBottomColor: colors.separator }]}>
            <View style={{ flex: 1 }}>
              <Text variant="subhead" weight="600">
                {r.label}
              </Text>
              <Text variant="caption" weight="400" tone="secondary">
                {r.detail}
              </Text>
            </View>
            <Switch accessibilityLabel={r.label} value={r.value} onValueChange={r.set} trackColor={{ true: colors.interactive, false: colors.border }} />
          </View>
        ))}
      </View>
      {!draft.pickup && !draft.ships && (
        <Text variant="footnote" tone="secondary">
          Choose pickup, shipping or both.
        </Text>
      )}
    </SellFrame>
  );
}

const styles = StyleSheet.create({
  field: { padding: 12, paddingHorizontal: 14, borderRadius: radius.card, gap: 6 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingVertical: 12 },
});
