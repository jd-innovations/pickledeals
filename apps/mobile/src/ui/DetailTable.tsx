import { View } from 'react-native';

import { useTheme } from '@/design/theme';
import { Text } from './Text';

/**
 * Label/value table in the design's Specs style: grey label left, bold value right, a hairline
 * between rows. Long values wrap under themselves; labels keep at most ~45% of the row, so neither
 * side gets squeezed into a sliver.
 */
export function DetailTable({ rows }: { rows: { label: string; value: string }[] }) {
  const { colors } = useTheme();
  return (
    <View>
      {rows.map(({ label, value }, i) => (
        <View
          key={`${label}-${i}`}
          accessible
          accessibilityLabel={`${label}, ${value}`}
          style={{
            flexDirection: 'row',
            alignItems: 'flex-start',
            gap: 16,
            paddingVertical: 11,
            borderBottomWidth: i === rows.length - 1 ? 0 : 1,
            borderBottomColor: colors.separator,
          }}>
          <Text variant="subhead" weight="400" tone="secondary" style={{ maxWidth: '45%', flexShrink: 0 }}>
            {label}
          </Text>
          <Text variant="subhead" weight="600" numeric style={{ flex: 1, textAlign: 'right' }}>
            {value}
          </Text>
        </View>
      ))}
    </View>
  );
}
