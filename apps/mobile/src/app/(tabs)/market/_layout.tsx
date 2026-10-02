import { Stack } from 'expo-router';

import { useStackOptions } from '@/design/navigation';

export default function MarketplaceStack() {
  return (
    <Stack screenOptions={useStackOptions()}>
      <Stack.Screen name="index" options={{ title: 'Marketplace' }} />
    </Stack>
  );
}
