import { radius } from '@pickledeals/shared';
import * as Haptics from 'expo-haptics';
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
  loading?: boolean;
  fullWidth?: boolean;
  style?: ViewStyle;
};

const HEIGHT: Record<Size, number> = { lg: 54, md: 46, sm: 36 };

export function Button({
  label,
  variant = 'primary',
  size = 'lg',
  icon,
  iconPosition = 'trailing',
  loading,
  fullWidth,
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
          height: variant === 'link' ? undefined : HEIGHT[size],
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
          {icon && iconPosition === 'leading' && <Icon name={icon} size={size === 'sm' ? 14 : 16} color={fg} weight="semibold" />}
          <Text variant={size === 'sm' ? 'footnote' : 'headline'} weight="700" style={{ color: fg, textDecorationLine: variant === 'link' ? 'underline' : 'none' }}>
            {label}
          </Text>
          {icon && iconPosition === 'trailing' && <Icon name={icon} size={size === 'sm' ? 14 : 16} color={fg} weight="semibold" />}
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: { borderRadius: radius.capsule, alignItems: 'center', justifyContent: 'center' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
});
