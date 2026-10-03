import { minTouchTarget, radius } from '@pickledeals/shared';
import * as Haptics from 'expo-haptics';
import type { ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, TextInput, View, type TextInputProps, type ViewStyle } from 'react-native';

import { useTheme } from '@/design/theme';
import { Icon, type IconName } from './Icon';
import { Text } from './Text';

/** Circular icon-only button. `surface` sits on content; `glass` floats over imagery. */
export function IconButton({
  icon,
  label,
  onPress,
  filled,
  tone = 'surface',
  size = 40,
}: {
  icon: IconName;
  label: string;
  onPress?: () => void;
  filled?: boolean;
  tone?: 'surface' | 'glass' | 'solid';
  size?: number;
}) {
  const { colors } = useTheme();
  const bg = { surface: colors.surface, glass: colors.glass, solid: colors.interactive }[tone];
  const fg = tone === 'solid' ? colors.onInteractive : colors.textPrimary;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={(minTouchTarget - size) / 2 > 0 ? (minTouchTarget - size) / 2 : 0}
      onPress={onPress}
      style={({ pressed }) => [
        { width: size, height: size, borderRadius: size / 2, backgroundColor: bg, alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.7 : 1 },
        tone === 'glass' && { borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
      ]}>
      <Icon name={icon} size={size * 0.46} color={fg} filled={filled} />
    </Pressable>
  );
}

export function Chip({
  label,
  selected,
  count,
  onPress,
  outlined,
  glass,
}: {
  label: string;
  selected?: boolean;
  count?: number;
  onPress?: () => void;
  outlined?: boolean;
  /** Floating over a map (design: MarketMap chips). */
  glass?: boolean;
}) {
  const { colors } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: !!selected }}
      onPress={() => {
        Haptics.selectionAsync().catch(() => {});
        onPress?.();
      }}
      style={({ pressed }) => [
        styles.chip,
        {
          backgroundColor: selected ? colors.interactive : outlined ? 'transparent' : glass ? colors.glass : colors.surface,
          borderWidth: selected ? 0 : outlined ? 1 : glass ? StyleSheet.hairlineWidth : 0,
          borderColor: colors.border,
          opacity: pressed ? 0.75 : 1,
        },
      ]}>
      <Text variant="subhead" weight="600" style={{ color: selected ? colors.onInteractive : colors.textPrimary }}>
        {label}
      </Text>
      {count != null && count > 0 && (
        <View style={[styles.count, { backgroundColor: selected ? colors.onInteractive : colors.interactive }]}>
          <Text variant="caption" weight="700" numeric style={{ color: selected ? colors.interactive : colors.onInteractive }}>
            {count}
          </Text>
        </View>
      )}
    </Pressable>
  );
}

export function ChipRow({ children }: { children: ReactNode }) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingHorizontal: 16 }}>
      {children}
    </ScrollView>
  );
}

export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
}: {
  options: readonly { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  const { colors, scheme } = useTheme();
  return (
    <View accessibilityRole="tablist" style={[styles.segment, { backgroundColor: colors.surface }]}>
      {options.map((o) => {
        const on = o.value === value;
        return (
          <Pressable
            key={o.value}
            accessibilityRole="tab"
            accessibilityState={{ selected: on }}
            onPress={() => {
              Haptics.selectionAsync().catch(() => {});
              onChange(o.value);
            }}
            style={[
              styles.segmentItem,
              on && { backgroundColor: colors.surfaceElevated, shadowColor: '#000', shadowOpacity: scheme === 'dark' ? 0 : 0.12, shadowRadius: 3, shadowOffset: { width: 0, height: 1 } },
            ]}>
            <Text variant="subhead" weight="600" tone={on ? 'primary' : 'secondary'}>
              {o.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function SearchField({
  placeholder,
  onPress,
  style,
  ...input
}: TextInputProps & { onPress?: () => void; style?: ViewStyle }) {
  const { colors } = useTheme();
  const content = (
    <View style={[styles.search, { backgroundColor: colors.surface }, style]}>
      <Icon name="search" size={17} color={colors.textSecondary} />
      {onPress ? (
        <Text variant="body" tone="secondary">
          {placeholder}
        </Text>
      ) : (
        <TextInput
          accessibilityLabel={placeholder}
          accessibilityRole="search"
          placeholder={placeholder}
          placeholderTextColor={colors.textSecondary}
          style={{ flex: 1, fontSize: 17, color: colors.textPrimary }}
          returnKeyType="search"
          clearButtonMode="while-editing"
          {...input}
        />
      )}
    </View>
  );
  return onPress ? (
    <Pressable accessibilityRole="search" accessibilityLabel={placeholder} onPress={onPress}>
      {content}
    </Pressable>
  ) : (
    content
  );
}

export function ListRow({
  title,
  value,
  onPress,
  icon,
  last,
}: {
  title: string;
  value?: string;
  onPress?: () => void;
  icon?: IconName;
  last?: boolean;
}) {
  const { colors } = useTheme();
  return (
    <Pressable
      accessibilityRole={onPress ? 'button' : undefined}
      onPress={onPress}
      style={({ pressed }) => [styles.row, { backgroundColor: pressed && onPress ? colors.surfacePressed : 'transparent' }]}>
      {icon && <Icon name={icon} size={18} color={colors.textPrimary} />}
      <View style={[styles.rowInner, !last && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.separator }]}>
        <Text variant="body" style={{ flex: 1 }}>
          {title}
        </Text>
        {value ? (
          <Text variant="subhead" tone="secondary" weight="400" numeric>
            {value}
          </Text>
        ) : null}
        {onPress && <Icon name="chevronRight" size={13} color={colors.textTertiary} weight="semibold" />}
      </View>
    </Pressable>
  );
}

export function Group({ label, children }: { label?: string; children: ReactNode }) {
  const { colors } = useTheme();
  return (
    <View style={{ gap: 6 }}>
      {label ? (
        <Text variant="footnote" tone="secondary" weight="600" style={{ paddingHorizontal: 16 }}>
          {label}
        </Text>
      ) : null}
      <View style={{ borderRadius: radius.card, backgroundColor: colors.surface, overflow: 'hidden' }}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  chip: { height: 36, paddingHorizontal: 14, borderRadius: radius.capsule, flexDirection: 'row', alignItems: 'center', gap: 6 },
  count: { minWidth: 20, height: 20, paddingHorizontal: 6, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  segment: { height: 36, borderRadius: radius.control, padding: 2, flexDirection: 'row' },
  segmentItem: { flex: 1, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  search: { height: 44, borderRadius: 22, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', gap: 8 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingLeft: 16 },
  rowInner: { flex: 1, minHeight: 50, flexDirection: 'row', alignItems: 'center', gap: 8, paddingRight: 16 },
});
