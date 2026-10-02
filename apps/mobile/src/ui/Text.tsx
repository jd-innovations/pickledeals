import { type, type TypeVariant } from '@pickledeals/shared';
import { Text as RNText, type TextProps as RNTextProps, type TextStyle } from 'react-native';

import { useTheme } from '@/design/theme';

export type TextTone = 'primary' | 'secondary' | 'tertiary' | 'inverse';

export type TextProps = RNTextProps & {
  variant?: TypeVariant;
  tone?: TextTone;
  /** Tabular numerals — use for every price and count. */
  numeric?: boolean;
  weight?: TextStyle['fontWeight'];
  strike?: boolean;
  align?: TextStyle['textAlign'];
};

const DENSE: TypeVariant[] = ['badge', 'priceCard', 'caption'];

export function Text({
  variant = 'body',
  tone = 'primary',
  numeric,
  weight,
  strike,
  align,
  style,
  ...rest
}: TextProps) {
  const { colors } = useTheme();
  const t = type[variant];
  const color = {
    primary: colors.textPrimary,
    secondary: colors.textSecondary,
    tertiary: colors.textTertiary,
    inverse: colors.onInteractive,
  }[tone];

  return (
    <RNText
      maxFontSizeMultiplier={DENSE.includes(variant) ? 1.3 : 2}
      style={[
        {
          fontSize: t.size,
          lineHeight: t.line,
          fontWeight: weight ?? t.weight,
          letterSpacing: t.tracking,
          color,
          textAlign: align,
        },
        numeric && { fontVariant: ['tabular-nums'] },
        strike && { textDecorationLine: 'line-through' },
        style,
      ]}
      {...rest}
    />
  );
}
