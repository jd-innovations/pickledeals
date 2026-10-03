import { router } from 'expo-router';
import type { ReactNode } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTheme } from '@/design/theme';
import { Button, IconButton, Text } from '@/ui';

export const SELL_STEPS = 6;

/** Shared chrome for the 6 sell steps (design: close/back · "Sell an item" · n/6 · progress bar). */
export function SellFrame({
  step,
  title,
  subtitle,
  heading = 'Sell an item',
  children,
  footer,
  ctaLabel = 'Continue',
  ctaDisabled,
  ctaLoading,
  onContinue,
}: {
  step: number;
  title?: string;
  subtitle?: string;
  heading?: string;
  children: ReactNode;
  footer?: ReactNode;
  ctaLabel?: string;
  ctaDisabled?: boolean;
  ctaLoading?: boolean;
  onContinue: () => void;
}) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const first = step === 1;
  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.background }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={{ paddingTop: insets.top + 8, paddingHorizontal: 16, gap: 14 }}>
        <View style={styles.bar}>
          <IconButton
            icon={first ? 'close' : 'chevronLeft'}
            label={first ? 'Close' : 'Back'}
            onPress={() => (first ? router.navigate('/market') : router.canGoBack() ? router.back() : router.replace('/sell'))}
          />
          <Text variant="headline">{heading}</Text>
          <Text variant="subhead" weight="400" tone="secondary" align="right" style={{ width: 40 }} numeric>
            {step}/{SELL_STEPS}
          </Text>
        </View>
        <View accessible accessibilityLabel={`Step ${step} of ${SELL_STEPS}`} style={styles.progress}>
          {Array.from({ length: SELL_STEPS }, (_, i) => (
            <View key={i} style={[styles.seg, { backgroundColor: i < step ? colors.interactive : colors.border }]} />
          ))}
        </View>
      </View>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 20, paddingBottom: 24, gap: 18 }}>
        {!!(title || subtitle) && (
          <View style={{ gap: 6 }}>
            {!!title && <Text variant="title1">{title}</Text>}
            {!!subtitle && (
              <Text variant="subhead" weight="400" tone="secondary">
                {subtitle}
              </Text>
            )}
          </View>
        )}
        {children}
      </ScrollView>
      <View style={{ paddingHorizontal: 16, paddingTop: 12, paddingBottom: Math.max(insets.bottom, 12) + 4, gap: 10 }}>
        {footer}
        <Button label={ctaLabel} fullWidth disabled={ctaDisabled} loading={ctaLoading} onPress={onContinue} />
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  bar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  progress: { flexDirection: 'row', gap: 4 },
  seg: { flex: 1, height: 4, borderRadius: 2 },
});
