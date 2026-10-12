import { Image } from 'expo-image';
import { View } from 'react-native';

import { useTheme } from '@/design/theme';
import { Text } from '@/ui';

const initial = (name: string) => name.trim().charAt(0).toUpperCase() || '?';

/**
 * A person: their profile photo when they have one, otherwise their initial on the neutral circle
 * (design: initials avatar). Photos are square JPEGs, so they simply fill the circle.
 */
export function PersonAvatar({ name, uri, size }: { name: string; uri: string | null | undefined; size: number }) {
  const { colors } = useTheme();
  const variant = size >= 56 ? 'title1' : size >= 40 ? 'headline' : size > 30 ? 'subhead' : 'caption';
  return (
    <View
      accessible={false}
      style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: colors.surfacePressed, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
      {uri ? (
        <Image source={{ uri }} style={{ width: size, height: size }} contentFit="cover" transition={120} recyclingKey={uri} />
      ) : (
        <Text variant={variant} weight="700" style={size <= 30 ? { fontSize: 11 } : undefined}>
          {initial(name)}
        </Text>
      )}
    </View>
  );
}
