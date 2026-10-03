import { View } from 'react-native';

import { useTheme } from '@/design/theme';

import { AreaLabel } from './AreaLabel';
import type { AreaMapProps } from './types';

/** Web stand-in for the static area map (react-native-maps has no web build): the same circle on plain land. */
export function AreaMap({ height, label, labelStyle = 'badge', areaName }: AreaMapProps) {
  const { colors } = useTheme();
  const d = Math.round(height * 0.75);
  return (
    <View style={{ height, backgroundColor: colors.mapLand, alignItems: 'center', justifyContent: 'center' }} accessible accessibilityLabel={areaName ? `Map of the approximate area around ${areaName}` : 'Map of the approximate area'}>
      <View style={{ position: 'absolute', left: 0, right: 0, top: '38%', height: 3, backgroundColor: colors.mapRoad }} />
      <View style={{ position: 'absolute', top: 0, bottom: 0, left: '62%', width: 3, backgroundColor: colors.mapRoad }} />
      <View style={{ width: d, height: d, borderRadius: d / 2, backgroundColor: colors.mapArea, borderWidth: 1.5, borderStyle: 'dashed', borderColor: colors.textTertiary }} />
      {label && <AreaLabel label={label} strong={labelStyle === 'title'} />}
    </View>
  );
}
