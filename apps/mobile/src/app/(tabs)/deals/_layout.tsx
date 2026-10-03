import { Stack } from 'expo-router';

import { sheetOptions, useStackOptions } from '@/design/navigation';

export default function DealsStack() {
  return (
    <Stack screenOptions={useStackOptions()}>
      <Stack.Screen name="index" options={{ title: 'Deals' }} />
      <Stack.Screen name="search" options={{ headerShown: false, animation: 'fade' }} />
      <Stack.Screen name="results" options={{ headerLargeTitle: false }} />
      <Stack.Screen name="browse" options={{ title: 'Browse' }} />
      <Stack.Screen name="category/[slug]" options={{ title: '' }} />
      <Stack.Screen name="brand/[slug]" />
      <Stack.Screen name="product/[slug]/index" options={{ title: '', headerLargeTitle: false }} />
      <Stack.Screen name="product/[slug]/offers" options={{ title: 'All offers', headerLargeTitle: false }} />
      <Stack.Screen name="product/[slug]/history" options={{ title: 'Price history', headerLargeTitle: false }} />
      <Stack.Screen name="product/[slug]/pre-owned" options={{ title: 'Pre-owned', headerLargeTitle: false }} />
      <Stack.Screen name="offer/[id]" options={{ title: '', headerLargeTitle: false }} />
      <Stack.Screen name="feed/[feed]" options={{ headerLargeTitle: false }} />
      <Stack.Screen name="collection/[slug]" options={{ headerLargeTitle: false }} />
      <Stack.Screen name="listing/[id]" options={{ headerShown: false }} />
      <Stack.Screen name="seller/[id]" options={{ title: '', headerLargeTitle: false }} />
      <Stack.Screen name="manage-listing" options={sheetOptions([0.7, 0.95])} />
      <Stack.Screen name="edit-listing" options={sheetOptions([0.9])} />
      <Stack.Screen
        name="price-alert"
        options={{ presentation: 'formSheet', headerShown: false, sheetAllowedDetents: [0.8], sheetGrabberVisible: true, sheetCornerRadius: 28 }}
      />
      <Stack.Screen
        name="filters"
        options={{ presentation: 'formSheet', headerShown: false, sheetAllowedDetents: [0.75, 1], sheetGrabberVisible: true, sheetCornerRadius: 28 }}
      />
    </Stack>
  );
}
