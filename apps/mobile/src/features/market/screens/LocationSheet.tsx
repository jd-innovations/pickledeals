import { useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useState } from 'react';
import { Alert, Platform, ScrollView, StyleSheet, View } from 'react-native';

import { useTheme } from '@/design/theme';
import { useAuth } from '@/features/auth/authStore';
import { Button, Group, ListRow, SegmentedControl, Text, TextField, Toggle } from '@/ui';

import { setHomeArea } from '../api';
import { RADIUS_OPTIONS } from '../components';
import { geocodeArea, getDeviceArea, type DeviceArea } from '../device';
import { useHomeArea, useMarketFilters, useViewer } from '../hooks';

const radiusValue = (m: number | null) => RADIUS_OPTIONS.find((r) => r.m === m)?.label ?? '25 mi';

/** "Where are you?" (formSheet). D2: only the snapped point is ever stored; we never show coordinates. */
export default function LocationSheet() {
  const { colors } = useTheme();
  const qc = useQueryClient();
  const signedIn = useAuth((s) => !!s.user);
  const uid = useAuth((s) => s.user?.id);
  const home = useHomeArea();
  const viewer = useViewer();
  const { f, set } = useMarketFilters();
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState<'gps' | 'search' | null>(null);
  const [remember, setRemember] = useState(true);
  const [pending, setPending] = useState<DeviceArea | null>(null);
  const [label, setLabel] = useState('');

  const choose = async (area: DeviceArea) => {
    if (!area.label) {
      // Web can't reverse-geocode: ask for a neighbourhood/city name buyers will see.
      setPending(area);
      return;
    }
    await commit(area, area.label);
  };

  const commit = async (area: DeviceArea, areaLabel: string) => {
    viewer.set({ point: { lat: area.lat, lng: area.lng }, label: areaLabel });
    if (signedIn && remember) {
      await setHomeArea(area.lat, area.lng, areaLabel, f.radiusM ?? undefined).catch(() => {});
      qc.invalidateQueries({ queryKey: ['me', uid] });
      useAuth.getState().refreshProfile().catch(() => null);
    }
    router.back();
  };

  const useGps = async () => {
    setBusy('gps');
    try {
      const area = await getDeviceArea();
      if (area === 'denied') {
        Alert.alert('Location is off', 'Allow location for PickleDeals in Settings, or search for your city or ZIP instead.');
        return;
      }
      await choose(area);
    } catch {
      Alert.alert('Couldn’t find you', 'Try again, or search for your city or ZIP.');
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
      else await choose(area);
    } finally {
      setBusy(null);
    }
  };

  const useSaved = () => {
    viewer.set({ point: null, label: null });
    router.back();
  };

  return (
    <ScrollView contentContainerStyle={{ padding: 20, gap: 20 }} keyboardShouldPersistTaps="handled">
      <View style={{ gap: 6 }}>
        <Text variant="title2">Your area</Text>
        <Text variant="subhead" weight="400" tone="secondary">
          We sort by distance using an approximate area (about 1 km). Nobody sees your exact location.
        </Text>
      </View>

      {pending ? (
        <View style={{ gap: 12 }}>
          <TextField label="Area name buyers and sellers see" placeholder="e.g. Lakewood Ranch, FL" value={label} onChangeText={setLabel} maxLength={40} autoFocus />
          <Button label="Use this area" fullWidth disabled={label.trim().length < 2} onPress={() => commit(pending, label.trim())} />
        </View>
      ) : (
        <>
          <Button label="Use current location" icon="pin" iconPosition="leading" fullWidth loading={busy === 'gps'} onPress={useGps} />
          {Platform.OS !== 'web' && (
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
          {signedIn && home.data?.label && (
            <Group>
              <ListRow title={`Saved area: ${home.data.label}`} value={viewer.point ? 'Use' : 'In use'} onPress={useSaved} last />
            </Group>
          )}
        </>
      )}

      <View style={{ gap: 10 }}>
        <Text variant="headline">Distance</Text>
        <SegmentedControl
          options={RADIUS_OPTIONS.map((r) => ({ value: r.label, label: r.label }))}
          value={radiusValue(f.radiusM)}
          onChange={(v) => set({ ...f, radiusM: RADIUS_OPTIONS.find((r) => r.label === v)!.m })}
        />
      </View>

      {signedIn && (
        <View style={[styles.switchRow, { borderColor: colors.separator }]}>
          <View style={{ flex: 1, gap: 2 }}>
            <Text variant="headline">Remember this area</Text>
            <Text variant="footnote" tone="secondary">
              Used next time and for pre-owned price alerts nearby.
            </Text>
          </View>
          <Toggle accessibilityLabel="Remember this area" value={remember} onValueChange={setRemember} />
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingTop: 16, borderTopWidth: StyleSheet.hairlineWidth },
});
