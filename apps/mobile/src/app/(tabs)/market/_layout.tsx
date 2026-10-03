import { Stack } from 'expo-router';

import { sheetOptions, useStackOptions } from '@/design/navigation';

export default function MarketplaceStack() {
  return (
    <Stack screenOptions={useStackOptions()}>
      <Stack.Screen name="index" options={{ title: 'Pre-owned' }} />
      <Stack.Screen name="map" options={{ headerShown: false, title: 'Map' }} />
      <Stack.Screen name="listing/[id]" options={{ headerShown: false }} />
      <Stack.Screen name="seller/[id]" options={{ title: '', headerLargeTitle: false }} />
      <Stack.Screen name="filters" options={sheetOptions([0.75, 1])} />
      <Stack.Screen name="location" options={sheetOptions([0.6, 0.9])} />
      <Stack.Screen name="manage-listing" options={sheetOptions([0.7, 0.95])} />
      <Stack.Screen name="edit-listing" options={sheetOptions([0.9])} />
    </Stack>
  );
}
