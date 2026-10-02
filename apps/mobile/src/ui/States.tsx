import { radius } from '@pickledeals/shared';
import { useEffect } from 'react';
import { StyleSheet, View, type DimensionValue } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';

import { useTheme } from '@/design/theme';
import { Button } from './Button';
import { Icon, type IconName } from './Icon';
import { Text } from './Text';

export function EmptyState({
  icon,
  title,
  message,
  actionLabel,
  onAction,
}: {
  icon: IconName;
  title: string;
  message: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  const { colors } = useTheme();
  return (
    <View style={styles.state}>
      <Icon name={icon} size={30} color={colors.textPrimary} weight="regular" />
      <Text variant="headline" align="center">
        {title}
      </Text>
      <Text variant="subhead" weight="400" tone="secondary" align="center">
        {message}
      </Text>
      {actionLabel && <Button label={actionLabel} variant="secondary" size="sm" onPress={onAction} style={{ marginTop: 8 }} />}
    </View>
  );
}

export function ErrorState({ title, message, onRetry }: { title: string; message: string; onRetry?: () => void }) {
  return (
    <View style={styles.state}>
      <Text variant="headline" align="center">
        {title}
      </Text>
      <Text variant="subhead" weight="400" tone="secondary" align="center">
        {message}
      </Text>
      {onRetry && <Button label="Try again" variant="secondary" size="sm" onPress={onRetry} style={{ marginTop: 8 }} />}
    </View>
  );
}

/** Shimmer-free pulse: calmer than a sweep, and cheap. */
export function Skeleton({ width = '100%', height = 12, round = 6 }: { width?: DimensionValue; height?: number; round?: number }) {
  const { colors } = useTheme();
  const o = useSharedValue(1);
  useEffect(() => {
    o.set(withRepeat(withTiming(0.5, { duration: 700 }), -1, true));
  }, [o]);
  const anim = useAnimatedStyle(() => ({ opacity: o.get() }));
  return <Animated.View style={[{ width, height, borderRadius: round, backgroundColor: colors.surface }, anim]} />;
}

export function CardSkeleton({ width }: { width: number }) {
  return (
    <View style={{ width, gap: 8 }}>
      <Skeleton width={width} height={width} round={radius.tile} />
      <Skeleton width="45%" height={10} />
      <Skeleton width="85%" height={13} />
      <Skeleton width="40%" height={15} />
    </View>
  );
}

const styles = StyleSheet.create({
  state: { alignItems: 'center', gap: 8, paddingVertical: 32, paddingHorizontal: 24 },
});
