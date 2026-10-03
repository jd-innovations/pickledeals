import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { router, type Href } from 'expo-router';
import { useEffect } from 'react';
import { Platform } from 'react-native';

import { useAuth } from '@/features/auth/authStore';

import { registerPushToken } from './api';

/**
 * Push foundation (Phase 5). Permission is asked in context — after the first price alert — never
 * on launch. Tokens are registered to the signed-in user; taps open the notification's route.
 * Needs a development build with an EAS project id (Expo Go and web skip push).
 */

export type PushResult = 'registered' | 'denied' | 'unsupported' | 'no-project' | 'error';

// Native only: the web build uses push.web.ts.
Notifications.setNotificationHandler({
  handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: true }),
});

const projectId = (): string | undefined =>
  (Constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined)?.eas?.projectId ?? Constants.easConfig?.projectId;

export async function ensurePushRegistered({ ask }: { ask: boolean }): Promise<PushResult> {
  if (Platform.OS !== 'ios' && Platform.OS !== 'android') return 'unsupported';
  try {
    let { status } = await Notifications.getPermissionsAsync();
    if (status === 'undetermined' && ask) {
      ({ status } = await Notifications.requestPermissionsAsync({ ios: { allowAlert: true, allowBadge: true, allowSound: true } }));
    }
    if (status !== 'granted') return 'denied';
    const id = projectId();
    if (!id) return 'no-project';
    const token = await Notifications.getExpoPushTokenAsync({ projectId: id });
    await registerPushToken(token.data, Platform.OS, Device.modelName ?? undefined);
    return 'registered';
  } catch {
    return 'error';
  }
}

/** Root-layout hook: re-registers on sign-in (no prompt) and routes notification taps. */
export function usePush() {
  const userId = useAuth((s) => s.user?.id);

  useEffect(() => {
    if (userId) ensurePushRegistered({ ask: false }).catch(() => {});
  }, [userId]);

  const last = Notifications.useLastNotificationResponse();
  useEffect(() => {
    const route = last?.notification.request.content.data?.route;
    if (typeof route === 'string' && route.startsWith('/')) router.push(route as Href);
  }, [last]);
}
