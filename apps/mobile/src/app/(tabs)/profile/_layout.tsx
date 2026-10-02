import { Stack } from 'expo-router';

import { useStackOptions } from '@/design/navigation';

export default function ProfileStack() {
  const options = useStackOptions();
  return (
    <Stack screenOptions={options}>
      <Stack.Screen name="index" options={{ title: 'Profile' }} />
      <Stack.Screen name="appearance" options={{ title: 'Appearance' }} />
      <Stack.Screen name="gallery" options={{ title: 'Components' }} />
    </Stack>
  );
}
