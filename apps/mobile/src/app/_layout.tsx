import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { DarkTheme, DefaultTheme, Stack, ThemeProvider as NavigationThemeProvider, type NativeStackNavigationOptions } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { useStackOptions } from '@/design/navigation';
import { ThemeProvider, useTheme } from '@/design/theme';
import { useTimeZoneSync } from '@/features/alerts/hooks';
import { usePush } from '@/features/alerts/push';
import { startAuthListener } from '@/features/auth/authStore';
import { useInboxChannel } from '@/features/chat/hooks';
import { queryClient } from '@/lib/queryClient';
import { persistOptions } from '@/lib/queryPersist';

function RootNavigator() {
  const { colors, scheme } = useTheme();
  usePush();
  useTimeZoneSync();
  useInboxChannel();
  const stack = useStackOptions();
  const base = scheme === 'dark' ? DarkTheme : DefaultTheme;
  const sheet: NativeStackNavigationOptions = {
    presentation: 'formSheet',
    sheetAllowedDetents: [0.62],
    sheetGrabberVisible: true,
    sheetCornerRadius: 28,
    contentStyle: { backgroundColor: colors.surfaceElevated },
  };
  return (
    <NavigationThemeProvider
      value={{
        ...base,
        colors: {
          ...base.colors,
          primary: colors.textPrimary,
          background: colors.background,
          card: colors.background,
          text: colors.textPrimary,
          border: colors.separator,
        },
      }}>
      <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.background } }}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="sign-in" options={sheet} />
        <Stack.Screen name="display-name" options={sheet} />
        <Stack.Screen name="terms-agree" options={sheet} />
        {/* Chat lives above the tabs (no tab bar), reachable from listings, Profile → Messages and pushes. */}
        <Stack.Screen name="conversation/[id]" />
        <Stack.Screen name="meetup" options={{ ...sheet, sheetAllowedDetents: [0.9] }} />
        <Stack.Screen name="report" options={{ ...sheet, sheetAllowedDetents: [0.85, 1] }} />
        <Stack.Screen name="make-offer" options={{ ...sheet, sheetAllowedDetents: [0.94] }} />
        <Stack.Screen name="counter-offer" options={{ ...sheet, sheetAllowedDetents: [0.75, 0.94] }} />
        <Stack.Screen name="listing/[id]" />
        <Stack.Screen name="seller/[id]" options={{ ...stack, headerShown: true, title: '' }} />
      </Stack>
    </NavigationThemeProvider>
  );
}

export default function RootLayout() {
  useEffect(startAuthListener, []);
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <PersistQueryClientProvider client={queryClient} persistOptions={persistOptions}>
        <ThemeProvider>
          <RootNavigator />
        </ThemeProvider>
      </PersistQueryClientProvider>
    </GestureHandlerRootView>
  );
}
