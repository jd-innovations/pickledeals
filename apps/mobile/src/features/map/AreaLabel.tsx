import { View } from 'react-native';

import { useTheme } from '@/design/theme';
import { Text } from '@/ui';

/** Glass caption pinned to the corner of an area map ("Approximate area" / "Lakewood Ranch, FL"). */
export function AreaLabel({ label, strong }: { label: string; strong?: boolean }) {
  const { colors } = useTheme();
  return (
    <View style={{ position: 'absolute', left: 10, bottom: 10, paddingHorizontal: strong ? 10 : 9, paddingVertical: strong ? 6 : 5, borderRadius: strong ? 10 : 9, backgroundColor: colors.glass }}>
      <Text variant={strong ? 'footnote' : 'caption'} weight={strong ? '700' : '600'} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}
