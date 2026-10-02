import { Pressable, View } from 'react-native';

import { Text } from './Text';

/** Section title with an optional trailing action ("See all"), as on Deals home and search results. */
export function SectionHeader({ title, actionLabel, onAction, trailing }: { title: string; actionLabel?: string; onAction?: () => void; trailing?: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', paddingHorizontal: 16 }}>
      <Text variant="title2" accessibilityRole="header">
        {title}
      </Text>
      {actionLabel && onAction ? (
        <Pressable accessibilityRole="button" hitSlop={10} onPress={onAction}>
          <Text variant="subhead" weight="600" tone="secondary">
            {actionLabel}
          </Text>
        </Pressable>
      ) : trailing ? (
        <Text variant="subhead" weight="600" tone="secondary" numeric>
          {trailing}
        </Text>
      ) : null}
    </View>
  );
}
