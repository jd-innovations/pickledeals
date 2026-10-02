import { Stack } from 'expo-router';

import { useStackOptions } from '@/design/navigation';

export default function DealsStack() {
  return (
    <Stack screenOptions={useStackOptions()}>
      <Stack.Screen name="index" options={{ title: 'Deals' }} />
      <Stack.Screen name="search" options={{ headerShown: false, animation: 'fade' }} />
      <Stack.Screen name="results" options={{ headerLargeTitle: false }} />
      <Stack.Screen name="browse" options={{ title: 'Browse' }} />
      <Stack.Screen name="category/[slug]" options={{ title: '' }} />
      <Stack.Screen name="brand/[slug]" />
      <Stack.Screen name="product/[slug]" />
    </Stack>
  );
}
