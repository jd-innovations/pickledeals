import { router } from 'expo-router';
import { useState } from 'react';
import { Alert, ScrollView, View } from 'react-native';

import { useTheme } from '@/design/theme';
import { AuthCanceled, deleteAccount } from '@/features/auth/api';
import { useAuth } from '@/features/auth/authStore';
import { Button, Group, ListRow, Text } from '@/ui';

const PROVIDER_LABEL: Record<string, string> = { apple: 'Apple', email: 'Email code' };

/** Account details and permanent deletion (App Store Guideline 5.1.1(v)). */
export default function AccountScreen() {
  const { colors } = useTheme();
  const user = useAuth((s) => s.user);
  const [deleting, setDeleting] = useState(false);

  if (!user) return null;
  const usesApple = user.providers.includes('apple');

  const runDelete = async () => {
    setDeleting(true);
    try {
      await deleteAccount();
      router.dismissTo('/profile');
      Alert.alert('Account deleted', 'Your PickleDeals account and its data have been removed.');
    } catch (e) {
      if (!(e instanceof AuthCanceled)) Alert.alert('Couldn’t delete account', e instanceof Error ? e.message : String(e));
    } finally {
      setDeleting(false);
    }
  };

  const confirmDelete = () =>
    Alert.alert(
      'Delete your account?',
      `This permanently removes your profile and everything tied to it. It can’t be undone.${usesApple ? ' You’ll confirm with Apple next.' : ''}`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete account', style: 'destructive', onPress: runDelete },
      ],
    );

  return (
    <ScrollView
      contentInsetAdjustmentBehavior="automatic"
      style={{ backgroundColor: colors.background }}
      contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 120, gap: 24 }}>
      <Group label="Sign-in">
        <ListRow title="Email" value={user.email ?? 'Hidden by Apple'} />
        <ListRow title="Signed in with" value={user.providers.map((p) => PROVIDER_LABEL[p] ?? p).join(', ')} last />
      </Group>

      <View style={{ gap: 10 }}>
        <Button label="Delete account" variant="outline" onPress={confirmDelete} loading={deleting} />
        <Text variant="footnote" weight="400" tone="secondary" style={{ paddingHorizontal: 4 }}>
          Deleting your account is permanent and removes your profile and everything tied to it.
        </Text>
      </View>
    </ScrollView>
  );
}
