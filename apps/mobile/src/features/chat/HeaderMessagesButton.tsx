import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { useTheme } from '@/design/theme';
import { useAuth } from '@/features/auth/authStore';
import { IconButton, Text } from '@/ui';

import { useUnreadThreads } from './hooks';

/**
 * Header shortcut to Messages (Deals and Marketplace), with the unread-thread count. Messages open
 * inside the current tab's stack, so back returns here; guests get the sign-in sheet first.
 */
export function HeaderMessagesButton({ tab }: { tab: 'deals' | 'market' }) {
  const { colors } = useTheme();
  const unread = useUnreadThreads();
  const open = () =>
    useAuth.getState().requireAuth('view_messages', () => router.push(tab === 'deals' ? '/deals/messages' : '/market/messages'));
  return (
    <View>
      <IconButton icon="message" label={unread ? `Messages, ${unread} unread` : 'Messages'} size={34} onPress={open} />
      {unread > 0 && (
        <View pointerEvents="none" style={[styles.badge, { backgroundColor: colors.interactive, borderColor: colors.background }]}>
          <Text variant="caption" weight="700" numeric style={{ color: colors.onInteractive, fontSize: 10, lineHeight: 12 }}>
            {unread > 9 ? '9+' : String(unread)}
          </Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    position: 'absolute',
    top: -3,
    right: -3,
    minWidth: 16,
    height: 16,
    paddingHorizontal: 3,
    borderRadius: 8,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
