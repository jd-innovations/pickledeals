import { Alert, ScrollView, View } from 'react-native';

import { useAuth } from '@/features/auth/authStore';
import { Button, SearchField, Text } from '@/ui';

/** Sell tab root = step 1 of the sell flow (native tabs can't open a modal on tap; see D5). */
export default function SellScreen() {
  const requireAuth = useAuth((s) => s.requireAuth);
  const start = (custom: boolean) =>
    requireAuth('create_listing', () =>
      Alert.alert(custom ? 'Custom item' : 'Select product', 'The sell flow is built in Phase 6.'),
    );

  return (
    <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 120, gap: 16 }}>
      <Text variant="title1">What are you selling?</Text>
      <Text variant="subhead" weight="400" tone="secondary">
        Pick your item from the catalog and we fill in the brand, model and specs. Listing is free.
      </Text>
      <SearchField placeholder="Search the catalog" onPress={() => start(false)} />
      <View style={{ alignItems: 'flex-start' }}>
        <Button label="Can’t find it? List a custom item" variant="link" size="sm" onPress={() => start(true)} />
      </View>
    </ScrollView>
  );
}
