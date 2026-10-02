import { palette } from '@pickledeals/shared';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { useTheme, type AppearancePreference } from '@/design/theme';
import { Icon, Text } from '@/ui';

const OPTIONS: { value: AppearancePreference; label: string }[] = [
  { value: 'system', label: 'System' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
];

function Preview({ value }: { value: AppearancePreference }) {
  const halves = value === 'system' ? [palette.light, palette.dark] : [palette[value]];
  return (
    <View style={styles.preview}>
      {halves.map((p, i) => (
        <View key={i} style={{ flex: 1, backgroundColor: p.background, padding: 8, gap: 5 }}>
          <View style={{ height: 6, width: '70%', borderRadius: 3, backgroundColor: p.textPrimary }} />
          <View style={{ flex: 1, borderRadius: 6, backgroundColor: p.imageTile }} />
          <View style={{ height: 12, borderRadius: 6, backgroundColor: p.textPrimary }} />
        </View>
      ))}
    </View>
  );
}

export default function AppearanceScreen() {
  const { colors, preference, setPreference } = useTheme();
  return (
    <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={{ padding: 16, gap: 12 }}>
      <View accessibilityRole="radiogroup" style={[styles.card, { backgroundColor: colors.surface }]}>
        {OPTIONS.map((o) => {
          const on = preference === o.value;
          return (
            <Pressable
              key={o.value}
              accessibilityRole="radio"
              accessibilityState={{ checked: on }}
              accessibilityLabel={o.label}
              onPress={() => setPreference(o.value)}
              style={styles.option}>
              <View style={[styles.frame, { borderColor: on ? colors.interactive : colors.border, borderWidth: on ? 2.5 : 1 }]}>
                <Preview value={o.value} />
              </View>
              <Text variant="subhead" weight="600">
                {o.label}
              </Text>
              <View style={[styles.radio, { backgroundColor: on ? colors.interactive : 'transparent', borderColor: on ? colors.interactive : colors.border }]}>
                {on && <Icon name="check" size={12} color={colors.onInteractive} weight="bold" />}
              </View>
            </Pressable>
          );
        })}
      </View>
      <Text variant="footnote" tone="secondary" style={{ paddingHorizontal: 16 }}>
        System follows your iPhone’s setting.
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: 20, paddingVertical: 18, paddingHorizontal: 12, flexDirection: 'row', justifyContent: 'space-around' },
  option: { alignItems: 'center', gap: 10 },
  frame: { width: 84, height: 150, borderRadius: 16, overflow: 'hidden' },
  preview: { flex: 1, flexDirection: 'row' },
  radio: { width: 22, height: 22, borderRadius: 11, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
});
