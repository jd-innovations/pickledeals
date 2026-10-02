import type { AuthIntent } from '@pickledeals/shared';
import { useLocalSearchParams } from 'expo-router';
import { useEffect } from 'react';
import { Alert, View } from 'react-native';

import { INTENT_COPY, useAuth } from '@/features/auth/authStore';
import { Button, Text } from '@/ui';

/**
 * D6 auth sheet (formSheet). Phase 1 wires Sign in with Apple + email code to Supabase Auth.
 * In development a test sign-in exercises the "resume the original intent" path end to end.
 */
export default function SignInSheet() {
  const { intent } = useLocalSearchParams<{ intent?: AuthIntent }>();
  const completeSignIn = useAuth((s) => s.completeSignIn);
  const cancel = useAuth((s) => s.cancel);

  useEffect(() => () => {
    // Swiping the sheet away abandons the pending action.
    if (!useAuth.getState().user) cancel();
  }, [cancel]);

  const notYet = () => Alert.alert('Coming in Phase 1', 'Sign in with Apple and email codes connect to Supabase Auth in Phase 1.');

  return (
    <View style={{ flex: 1, padding: 24, paddingTop: 32, gap: 14 }}>
      <Text variant="title1">Sign in</Text>
      <Text variant="body" tone="secondary">
        {intent ? INTENT_COPY[intent] : 'Save products, set price alerts, sell gear and message players.'}
      </Text>
      <View style={{ gap: 10, marginTop: 8 }}>
        <Button label="Continue with Apple" onPress={notYet} fullWidth />
        <Button label="Continue with email" variant="secondary" onPress={notYet} fullWidth />
        {__DEV__ && (
          <Button label="Developer: test sign-in" variant="link" size="sm" onPress={() => completeSignIn({ id: 'dev-user', displayName: 'Dana H.' })} />
        )}
      </View>
      <Text variant="caption" weight="400" tone="tertiary" align="center" style={{ marginTop: 'auto' }}>
        Browsing never requires an account.
      </Text>
    </View>
  );
}
