import type { Ref } from 'react';
import { StyleSheet, TextInput, View, type TextInputProps, type ViewStyle } from 'react-native';

import { useTheme } from '@/design/theme';

import { Text } from './Text';

type TextFieldProps = TextInputProps & {
  label: string;
  hint?: string | null;
  error?: string | null;
  containerStyle?: ViewStyle;
  ref?: Ref<TextInput>;
};

/** Labelled field from the design (Sell › Details): surface tile, small secondary label, 16pt input. */
export function TextField({ label, hint, error, containerStyle, style, ref, ...input }: TextFieldProps) {
  const { colors } = useTheme();
  const message = error ?? hint;
  return (
    <View style={[{ gap: 6 }, containerStyle]}>
      <View style={[styles.field, { backgroundColor: colors.surface }]}>
        <Text variant="caption" weight="600" tone="secondary">
          {label}
        </Text>
        <TextInput
          ref={ref}
          accessibilityLabel={label}
          placeholderTextColor={colors.textTertiary}
          selectionColor={colors.textPrimary}
          style={[styles.input, { color: colors.textPrimary }, style]}
          {...input}
        />
      </View>
      {message ? (
        <Text variant="footnote" tone={error ? 'primary' : 'secondary'} weight={error ? '600' : '400'} style={{ paddingHorizontal: 4 }} accessibilityLiveRegion="polite">
          {message}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  field: { paddingVertical: 12, paddingHorizontal: 14, borderRadius: 16, gap: 6 },
  input: { fontSize: 16, lineHeight: 21, padding: 0 },
});
