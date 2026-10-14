import { LEGAL_URLS } from '@pickledeals/shared';
import Constants from 'expo-constants';
import { router } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useState } from 'react';
import { Alert, Pressable, ScrollView, View } from 'react-native';

import { useTheme } from '@/design/theme';
import { authErrorMessage, signOut } from '@/features/auth/api';
import { useAlerts, useSavedIds } from '@/features/alerts/hooks';
import { useAuth } from '@/features/auth/authStore';
import { useMyOffers, useUnreadThreads } from '@/features/chat/hooks';
import { useHomeArea, useMyListings } from '@/features/market/hooks';
import { avatarUrl, changeAvatar, removeAvatar } from '@/features/profile/avatar';
import { haptic } from '@/lib/haptics';
import { chooseAction } from '@/lib/dialog';
import { PersonAvatar } from '@/commerce';
import { Button, Group, Icon, ListRow, Text } from '@/ui';

const APPEARANCE_LABEL = { system: 'System', light: 'Light', dark: 'Dark' } as const;
const APP_VERSION = Constants.expoConfig?.version ?? '';

/**
 * D5 (revised): Profile is the canonical home of the Saved library, buying & selling and Messages.
 * Rows for features that land in later phases are listed without a destination.
 * The Location row is the saved home area (approximate, D2) used for "near you" and pre-owned alerts.
 */
export default function ProfileScreen() {
  const { colors, preference } = useTheme();
  const user = useAuth((s) => s.user);
  const profile = useAuth((s) => s.profile);
  const [signingOut, setSigningOut] = useState(false);
  const saved = useSavedIds();
  const alerts = useAlerts();
  const myListings = useMyListings();
  const home = useHomeArea();
  const unreadThreads = useUnreadThreads();
  const offersWaiting = (useMyOffers().data ?? []).filter((o) => o.awaitingMe).length;

  const onSignOut = async () => {
    setSigningOut(true);
    try {
      await signOut();
      haptic.success();
    } catch (e) {
      haptic.error();
      Alert.alert('Couldn’t sign out', authErrorMessage(e));
    } finally {
      setSigningOut(false);
    }
  };

  const name = profile?.displayName ?? ' ';
  const subtitle = profile
    ? [profile.areaLabel, `member since ${new Date(profile.memberSince).getFullYear()}`].filter(Boolean).join(' · ')
    : ' ';

  return (
    <ScrollView
      contentInsetAdjustmentBehavior="automatic"
      style={{ backgroundColor: colors.background }}
      contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 120, gap: 24 }}>
      {user ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
          <ProfilePhotoButton name={name} />
          <View style={{ flex: 1, gap: 2 }}>
            <Text variant="title2" numberOfLines={1}>
              {name}
            </Text>
            <Text variant="subhead" weight="400" tone="secondary" numberOfLines={1}>
              {subtitle.charAt(0).toUpperCase() + subtitle.slice(1)}
            </Text>
          </View>
          <Button label="Edit" variant="secondary" size="sm" onPress={() => router.push('/display-name')} />
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

      {user && (
        <>
          <Group label="Shopping">
            <ListRow title="Saved" value={String(saved.products.size + saved.deals.size + saved.listings.size)} onPress={() => router.push('/profile/saved')} />
            <ListRow title="Price alerts" value={String(alerts.data?.length ?? 0)} onPress={() => router.push('/alerts')} />
            <ListRow title="Followed brands" value={String(saved.brands.size)} onPress={() => router.push('/profile/brands')} last />
          </Group>
          <Group label="Buying & selling">
            <ListRow title="My listings" value={myListings.data ? String(myListings.data.filter((l) => l.status !== 'sold').length) : undefined} onPress={() => router.push('/profile/listings')} />
            <ListRow title="Location" value={home.data?.label ?? 'Not set'} onPress={() => router.push('/profile/location')} />
            <ListRow title="Offers" value={offersWaiting ? `${offersWaiting} to answer` : undefined} onPress={() => router.push('/profile/offers')} />
            <ListRow title="Messages" value={unreadThreads ? `${unreadThreads} unread` : undefined} onPress={() => router.push('/profile/messages')} last />
          </Group>
        </>
      )}

      <Group label="Settings">
        {user && <ListRow title="Notifications" onPress={() => router.push('/profile/notifications')} />}
        <ListRow title="Appearance" value={APPEARANCE_LABEL[preference]} onPress={() => router.push('/profile/appearance')} last={!user} />
        {user && <ListRow title="Account" onPress={() => router.push('/profile/account')} last />}
      </Group>

      <Group label="About">
        <ListRow title="Support" onPress={() => WebBrowser.openBrowserAsync(LEGAL_URLS.support)} />
        <ListRow title="Terms of Use" onPress={() => WebBrowser.openBrowserAsync(LEGAL_URLS.terms)} />
        <ListRow title="Privacy Policy" onPress={() => WebBrowser.openBrowserAsync(LEGAL_URLS.privacy)} />
        <ListRow title="Version" value={APP_VERSION} last />
      </Group>

      {__DEV__ && (
        <Group label="Developer">
          <ListRow title="Component gallery" onPress={() => router.push('/profile/gallery')} last />
        </Group>
      )}

      {user && <Button label="Sign out" variant="secondary" onPress={onSignOut} loading={signingOut} />}
    </ScrollView>
  );
}

/**
 * Your photo (owner decision Oct 11: optional; initials until you add one). Tap to take one, choose
 * one from the library, or remove it. The camera badge marks it as changeable.
 */
function ProfilePhotoButton({ name }: { name: string }) {
  const { colors } = useTheme();
  const path = useAuth((s) => s.profile?.avatarPath ?? null);
  const [busy, setBusy] = useState(false);
  const run = (task: () => Promise<unknown>) => async () => {
    setBusy(true);
    try {
      await task();
    } catch {
      haptic.error();
      Alert.alert('Couldn’t update your photo', 'Check your connection and try again.');
    } finally {
      setBusy(false);
    }
  };
  const open = () =>
    chooseAction(path ? 'Profile photo' : 'Add a profile photo', [
      { text: 'Take photo', onPress: run(() => changeAvatar('camera')) },
      { text: 'Choose from library', onPress: run(() => changeAvatar('library')) },
      ...(path ? [{ text: 'Remove photo', destructive: true, onPress: run(removeAvatar) }] : []),
    ]);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={path ? 'Profile photo. Change or remove' : 'Add a profile photo'}
      accessibilityState={{ busy }}
      disabled={busy}
      onPress={open}
      style={({ pressed }) => ({ opacity: pressed || busy ? 0.6 : 1 })}>
      <PersonAvatar name={name} uri={avatarUrl(path)} size={64} />
      <View
        style={{
          position: 'absolute',
          right: -2,
          bottom: -2,
          width: 24,
          height: 24,
          borderRadius: 12,
          backgroundColor: colors.interactive,
          borderWidth: 2,
          borderColor: colors.background,
          alignItems: 'center',
          justifyContent: 'center',
        }}>
        <Icon name="camera" size={12} color={colors.onInteractive} />
      </View>
    </Pressable>
  );
}
