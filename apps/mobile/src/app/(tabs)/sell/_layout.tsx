import { Stack } from 'expo-router';

import { useStackOptions } from '@/design/navigation';

/** The sell flow draws its own header (close/back, step count, progress bar — design: SellStart…SellPreview). */
export default function SellStack() {
  return <Stack screenOptions={{ ...useStackOptions(), headerShown: false }} />;
}
