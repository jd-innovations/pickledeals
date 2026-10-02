import { router } from 'expo-router';
import { ScrollView, View } from 'react-native';

import { Chip, ChipRow, EmptyState, SearchField } from '@/ui';

const FEEDS = ['Today', 'Price drops', 'Ending soon', 'Promo codes', 'Under $50', 'New'];

export default function DealsScreen() {
  return (
    <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={{ paddingBottom: 120, gap: 16 }}>
      <View style={{ paddingHorizontal: 16 }}>
        <SearchField placeholder="Search paddles, shoes, brands" onPress={() => {}} />
      </View>
      <ChipRow>
        {FEEDS.map((f, i) => (
          <Chip key={f} label={f} selected={i === 0} />
        ))}
      </ChipRow>
      <EmptyState
        icon="tag"
        title="Deals are on the way"
        message="The deals feed connects to the catalog and retailer offers in Phases 2–4."
        actionLabel={__DEV__ ? 'Open component gallery' : undefined}
        onAction={() => router.push('/profile/gallery')}
      />
    </ScrollView>
  );
}
