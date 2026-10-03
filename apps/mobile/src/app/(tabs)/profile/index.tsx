import { router } from 'expo-router';
import { useState } from 'react';
import { Alert, ScrollView, View } from 'react-native';

import { useTheme } from '@/design/theme';
import { authErrorMessage, signOut } from '@/features/auth/api';
import { useAlerts, useSavedIds } from '@/features/alerts/hooks';
import { useAuth } from '@/features/auth/authStore';
import { useMyOffers, useUnreadThreads } from '@/features/chat/hooks';
import { useHomeArea, useMyListings } from '@/features/market/hooks';
import { Button, Group, ListRow, Text } from '@/ui';

const APPEARANCE_LABEL = { system: 'System', light: 'Light', dark: 'Dark' } as const;

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
    } catch (e) {
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
          <View style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: colors.surfacePressed, alignItems: 'center', justifyContent: 'center' }}>
            <Text variant="title1">{name.charAt(0)}</Text>
          </View>
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

      {__DEV__ && (
        <Group label="Developer">
          <ListRow title="Component gallery" onPress={() => router.push('/profile/gallery')} last />
        </Group>
      )}

      {user && <Button label="Sign out" variant="secondary" onPress={onSignOut} loading={signingOut} />}
    </ScrollView>
  );
}
