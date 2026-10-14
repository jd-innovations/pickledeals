import { palette } from '@pickledeals/shared';
import { Pressable, StyleSheet, View } from 'react-native';

import { useTheme, type AppearancePreference } from '@/design/theme';
import { haptic } from '@/lib/haptics';
import { Icon, Text } from '@/ui';

const OPTIONS: { value: AppearancePreference; label: string }[] = [
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
  { value: 'system', label: 'System' },
];

/** A tiny screen in each theme; System is split light | dark. Colours come from the shared palette. */
function Preview({ value }: { value: AppearancePreference }) {
  const halves = value === 'system' ? [palette.light, palette.dark] : [palette[value]];
  return (
    <View style={styles.preview}>
      {halves.map((p, i) => (
        <View key={i} style={{ flex: 1, backgroundColor: p.background, padding: 8, gap: 5 }}>
          <View style={{ height: 5, width: '70%', borderRadius: 3, backgroundColor: p.textPrimary }} />
          <View style={{ height: 4, width: '45%', borderRadius: 2, backgroundColor: p.textPrimary, opacity: 0.5 }} />
          <View style={{ flex: 1, borderRadius: 6, backgroundColor: p.imageTile }} />
        </View>
      ))}
    </View>
  );
}

/**
 * Appearance, inline in Profile › Settings (approved design, Oct 14): the icon and title, then Light /
 * Dark / System as small previews. Sits as the last block of a Group, under a row separator.
 */
export function ThemePicker() {
  const { colors, preference, setPreference } = useTheme();
  return (
    <View style={styles.block}>
      <View style={styles.title}>
        <Icon name="appearance" size={20} color={colors.textPrimary} />
        <Text variant="body">Appearance</Text>
      </View>
      <View accessibilityRole="radiogroup" accessibilityLabel="Appearance" style={styles.options}>
        {OPTIONS.map((o) => {
          const on = preference === o.value;
          return (
            <Pressable
              key={o.value}
              accessibilityRole="radio"
              accessibilityState={{ checked: on }}
              accessibilityLabel={o.value === 'system' ? 'System, follows your iPhone' : o.label}
              onPress={() => {
                if (on) return;
                haptic.tick();
                setPreference(o.value);
              }}
              style={styles.option}>
              <View style={[styles.frame, { borderColor: on ? colors.interactive : colors.border, borderWidth: on ? 2.5 : 1 }]}>
                <Preview value={o.value} />
              </View>
              <Text variant="subhead" weight={on ? '700' : '500'} tone={on ? 'primary' : 'secondary'}>
                {o.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  block: { paddingHorizontal: 16, paddingTop: 14, paddingBottom: 16, gap: 12 },
  title: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  options: { flexDirection: 'row', gap: 10 },
  option: { flex: 1, alignItems: 'center', gap: 8 },
  frame: { alignSelf: 'stretch', height: 72, borderRadius: 12, overflow: 'hidden' },
  preview: { flex: 1, flexDirection: 'row' },
});
