import { Stack } from 'expo-router';

import { useStackOptions } from '@/design/navigation';

export default function AlertsStack() {
  return (
    <Stack screenOptions={useStackOptions()}>
      <Stack.Screen name="index" options={{ title: 'Alerts' }} />
    </Stack>
  );
}
