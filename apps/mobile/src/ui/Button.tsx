import { radius } from '@pickledeals/shared';
import * as Haptics from 'expo-haptics';
import type { ReactNode } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View, type PressableProps, type ViewStyle } from 'react-native';

import { useTheme } from '@/design/theme';
import { Icon, type IconName } from './Icon';
import { Text } from './Text';

type Variant = 'primary' | 'secondary' | 'outline' | 'link';
type Size = 'lg' | 'md' | 'sm';

export type ButtonProps = Omit<PressableProps, 'style' | 'children'> & {
  label: string;
  variant?: Variant;
  size?: Size;
  icon?: IconName;
  iconPosition?: 'leading' | 'trailing';
  /** ON state (saved, alert set): filled icon in an accent token. */
  iconFilled?: boolean;
  iconColor?: string;
  /** A custom leading mark (e.g. a provider logo), shown before the label. */
  leading?: ReactNode;
  loading?: boolean;
  fullWidth?: boolean;
  /** Cap the label (e.g. 1): it truncates instead of wrapping the button to two lines. */
  numberOfLines?: number;
  style?: ViewStyle;
};

const HEIGHT: Record<Size, number> = { lg: 54, md: 46, sm: 36 };

export function Button({
  label,
  variant = 'primary',
  size = 'lg',
  icon,
  iconPosition = 'trailing',
  iconFilled,
  iconColor,
  leading,
  loading,
  fullWidth,
  numberOfLines,
  disabled,
  onPress,
  style,
  ...rest
}: ButtonProps) {
  const { colors } = useTheme();
  const fg = variant === 'primary' ? colors.onInteractive : colors.textPrimary;
  const bg = { primary: colors.interactive, secondary: colors.chip, outline: 'transparent', link: 'transparent' }[variant];

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!disabled, busy: !!loading }}
      disabled={disabled || loading}
      onPress={(e) => {
        if (variant === 'primary') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
        onPress?.(e);
      }}
      style={({ pressed }) => [
        styles.base,
        {
          minHeight: variant === 'link' ? undefined : HEIGHT[size],
          paddingVertical: variant === 'link' ? 0 : 6,
          paddingHorizontal: variant === 'link' ? 0 : size === 'sm' ? 14 : 22,
          backgroundColor: pressed && variant === 'primary' ? colors.interactivePressed : bg,
          borderColor: colors.border,
          borderWidth: variant === 'outline' ? StyleSheet.hairlineWidth * 2 : 0,
          opacity: disabled ? 0.4 : pressed && variant !== 'primary' ? 0.7 : 1,
          alignSelf: fullWidth ? 'stretch' : 'auto',
        },
        style,
      ]}
      {...rest}>
      {loading ? (
        <ActivityIndicator color={fg} />
      ) : (
        <View style={styles.row}>
          {leading}
          {icon && iconPosition === 'leading' && <Icon name={icon} size={size === 'sm' ? 14 : 16} color={iconColor ?? fg} filled={iconFilled} weight="semibold" />}
          <Text
            variant={size === 'sm' ? 'footnote' : 'headline'}
            weight="700"
            numberOfLines={numberOfLines}
            style={{ color: fg, flexShrink: 1, textDecorationLine: variant === 'link' ? 'underline' : 'none' }}>
            {label}
          </Text>
          {icon && iconPosition === 'trailing' && <Icon name={icon} size={size === 'sm' ? 14 : 16} color={iconColor ?? fg} filled={iconFilled} weight="semibold" />}
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: { borderRadius: radius.capsule, alignItems: 'center', justifyContent: 'center' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
});
