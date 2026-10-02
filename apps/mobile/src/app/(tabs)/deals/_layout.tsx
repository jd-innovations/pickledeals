import { Stack } from 'expo-router';

import { useStackOptions } from '@/design/navigation';

export default function DealsStack() {
  return (
    <Stack screenOptions={useStackOptions()}>
      <Stack.Screen name="index" options={{ title: 'Deals' }} />
    </Stack>
  );
}
