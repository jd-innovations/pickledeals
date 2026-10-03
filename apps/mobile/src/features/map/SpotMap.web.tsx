import { View } from 'react-native';

import { useTheme } from '@/design/theme';

import type { SpotMapProps } from './types';

/** Web stand-in for the meet-up spot map (react-native-maps has no web build). */
export function SpotMap({ height }: SpotMapProps) {
  const { colors } = useTheme();
  return (
    <View style={{ height, backgroundColor: colors.mapLand, alignItems: 'center', justifyContent: 'center' }}>
      <View style={{ position: 'absolute', left: 0, right: 0, top: '45%', height: 3, backgroundColor: colors.mapRoad }} />
      <View style={{ position: 'absolute', top: 0, bottom: 0, left: '35%', width: 3, backgroundColor: colors.mapRoad }} />
      <SpotDot color={colors.interactive} ring={colors.surfaceElevated} />
    </View>
  );
}

export function SpotDot({ color, ring }: { color: string; ring: string }) {
  return <View style={{ width: 26, height: 26, borderRadius: 13, backgroundColor: color, borderWidth: 3, borderColor: ring }} />;
}
