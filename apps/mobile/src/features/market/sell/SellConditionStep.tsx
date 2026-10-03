import { LISTING_CONDITIONS } from '@pickledeals/shared';
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';

import { useTheme } from '@/design/theme';
import { Text } from '@/ui';

import { useSellDraft } from '../hooks';
import { SellFrame } from './SellFrame';

/** Step 3 — condition. Buyers see the exact description on the listing. */
export default function SellConditionStep() {
  const { colors } = useTheme();
  const { draft, update } = useSellDraft();
  return (
    <SellFrame step={3} title="Condition" subtitle="Buyers see this exact description on your listing." ctaDisabled={!draft.condition} onContinue={() => router.push('/sell/price')}>
      <View accessibilityRole="radiogroup" accessibilityLabel="Condition" style={{ gap: 10 }}>
        {LISTING_CONDITIONS.map((c) => {
          const on = draft.condition === c.value;
          return (
            <Pressable
              key={c.value}
              accessibilityRole="radio"
              accessibilityState={{ checked: on }}
              onPress={() => {
                Haptics.selectionAsync().catch(() => {});
                update({ condition: c.value });
              }}
              style={[styles.card, { borderWidth: on ? 2 : 1, borderColor: on ? colors.interactive : colors.border }]}>
              <View style={[styles.ring, { borderWidth: on ? 2 : 1.5, borderColor: on ? colors.interactive : colors.border }]}>
                {on && <View style={[styles.dot, { backgroundColor: colors.interactive }]} />}
              </View>
              <View style={{ flex: 1, gap: 4 }}>
                <Text variant="headline" weight="700">
                  {c.label}
                </Text>
                <Text variant="subhead" weight="400" tone="secondary" style={{ lineHeight: 20 }}>
                  {c.description}
                </Text>
              </View>
            </Pressable>
          );
        })}
      </View>
    </SellFrame>
  );
}

const styles = StyleSheet.create({
  card: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, padding: 16, borderRadius: 18 },
  ring: { marginTop: 2, width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  dot: { width: 10, height: 10, borderRadius: 5 },
});
