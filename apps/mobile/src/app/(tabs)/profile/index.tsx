import { router } from 'expo-router';
import { ScrollView, View } from 'react-native';

import { useTheme } from '@/design/theme';
import { useAuth } from '@/features/auth/authStore';
import { Button, Group, ListRow, Text } from '@/ui';

const APPEARANCE_LABEL = { system: 'System', light: 'Light', dark: 'Dark' } as const;

export default function ProfileScreen() {
  const { colors, preference } = useTheme();
  const user = useAuth((s) => s.user);
  const signOut = useAuth((s) => s.signOut);

  return (
    <ScrollView
      contentInsetAdjustmentBehavior="automatic"
      style={{ backgroundColor: colors.background }}
      contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 120, gap: 24 }}>
      {user ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
          <View style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: colors.surfacePressed, alignItems: 'center', justifyContent: 'center' }}>
            <Text variant="title1">{user.displayName.charAt(0)}</Text>
          </View>
          <Text variant="title2">{user.displayName}</Text>
        </View>
      ) : (
        <View style={{ gap: 12, padding: 20, borderRadius: 20, backgroundColor: colors.surface }}>
          <Text variant="headline">Sign in to save, sell and message</Text>
          <Text variant="subhead" weight="400" tone="secondary">
            Browsing stays open to everyone — an account is only needed when you act.
          </Text>
          <Button label="Sign in" size="md" onPress={() => router.push('/sign-in')} />
        </View>
      )}

      <Group label="Settings">
        <ListRow title="Appearance" value={APPEARANCE_LABEL[preference]} onPress={() => router.push('/profile/appearance')} />
        <ListRow title="Notifications" value="Phase 10" last />
      </Group>

      {__DEV__ && (
        <Group label="Developer">
          <ListRow title="Component gallery" onPress={() => router.push('/profile/gallery')} last />
        </Group>
      )}

      {user && <Button label="Sign out" variant="secondary" onPress={signOut} />}
    </ScrollView>
  );
}
