import { regionAround, type LatLng, type MapRegion } from '@pickledeals/shared';
import { useQuery } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { useTheme } from '@/design/theme';
import { ListingMap, SpotDot } from '@/features/map';
import { fetchListingCells } from '@/features/market/api';
import { useViewer } from '@/features/market/hooks';
import { Button, Skeleton, Text, TextField } from '@/ui';

import { useSendMessage } from '../hooks';

const SARASOTA: LatLng = { lat: 27.3364, lng: -82.5307 };

/**
 * Suggest a meet-up spot (design: Conversation "Meet-up spot · shared privately"). Pan the map under
 * the fixed pin. The exact point is sent only as a private chat message (D2, §8).
 */
export default function MeetupSheet() {
  const { conversation = '', listing = '' } = useLocalSearchParams<{ conversation: string; listing?: string }>();
  const { colors } = useTheme();
  const viewer = useViewer((s) => s.point);
  const { send } = useSendMessage(conversation);
  const area = useQuery({ queryKey: ['market', 'cells', [listing]], queryFn: () => fetchListingCells([listing]), enabled: !!listing && !viewer, staleTime: Infinity });
  const start = viewer ?? area.data?.get(listing) ?? (area.isPending && listing && !viewer ? null : SARASOTA);
  const [center, setCenter] = useState<MapRegion | null>(null);
  const [label, setLabel] = useState('');

  const share = () => {
    const at = center ?? (start && regionAround(start, 600));
    if (!at) return;
    send({ kind: 'location_share', lat: at.latitude, lng: at.longitude, label: label.trim() || undefined });
    if (router.canGoBack()) router.back();
    else router.replace({ pathname: '/conversation/[id]', params: { id: conversation } });
  };

  return (
    <View style={{ flex: 1, padding: 20, gap: 14 }}>
      <View style={{ gap: 4 }}>
        <Text variant="title3" weight="700">
          Suggest a meet-up spot
        </Text>
        <Text variant="footnote" tone="secondary">
          Move the map to put the pin on a public place: a park, a court or a café.
        </Text>
      </View>
      <View style={{ height: 260, borderRadius: 18, overflow: 'hidden' }}>
        {start ? (
          <>
            <ListingMap
              initialRegion={regionAround(start, 600)}
              pins={[]}
              selectedId={null}
              onRegionChange={setCenter}
              onSelectPin={() => {}}
              onSelectCell={() => {}}
              onPressMap={() => {}}
            />
            <View pointerEvents="none" style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' }}>
              <SpotDot color={colors.interactive} ring={colors.surfaceElevated} />
            </View>
          </>
        ) : (
          <Skeleton height={260} />
        )}
      </View>
      <TextField label="Place name (optional)" placeholder="e.g. Lakewood Ranch park courts" value={label} onChangeText={setLabel} maxLength={80} />
      <Button label="Share this spot" icon="pin" iconPosition="leading" disabled={!start} onPress={share} />
      <Text variant="caption" weight="400" tone="secondary" align="center">
        Only the two of you can see it. Meet in daylight, somewhere public.
      </Text>
    </View>
  );
}
