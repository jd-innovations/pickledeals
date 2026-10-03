import { Stack } from 'expo-router';

import { sheetOptions, useStackOptions } from '@/design/navigation';

export default function ProfileStack() {
  const options = useStackOptions();
  return (
    <Stack screenOptions={options}>
      <Stack.Screen name="index" options={{ title: 'Profile' }} />
      <Stack.Screen name="appearance" options={{ title: 'Appearance' }} />
      <Stack.Screen name="account" options={{ title: 'Account' }} />
      <Stack.Screen name="saved" options={{ title: 'Saved' }} />
      <Stack.Screen name="brands" options={{ title: 'Followed brands' }} />
      <Stack.Screen name="listings" options={{ title: 'My listings' }} />
      <Stack.Screen name="messages" options={{ title: 'Messages' }} />
      <Stack.Screen name="offers" options={{ title: 'Offers' }} />
      <Stack.Screen name="notifications" options={{ title: 'Notifications' }} />
      <Stack.Screen name="location" options={sheetOptions([0.6, 0.9])} />
      <Stack.Screen name="listing/[id]" options={{ headerShown: false }} />
      <Stack.Screen name="seller/[id]" options={{ title: '', headerLargeTitle: false }} />
      <Stack.Screen name="manage-listing" options={sheetOptions([0.7, 0.95])} />
      <Stack.Screen name="edit-listing" options={sheetOptions([0.9])} />
      <Stack.Screen name="gallery" options={{ title: 'Components' }} />
    </Stack>
  );
}
