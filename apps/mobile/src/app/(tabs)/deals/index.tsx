import { router } from 'expo-router';
import { ScrollView, View } from 'react-native';

import { ShopByCategory } from '@/features/catalog/ShopByCategory';
import { Chip, ChipRow, EmptyState, SearchField } from '@/ui';

const FEEDS = ['Today', 'Price drops', 'Ending soon', 'Promo codes', 'Under $50', 'New'];

export default function DealsScreen() {
  return (
    <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={{ paddingBottom: 120, gap: 16 }}>
      <View style={{ paddingHorizontal: 16 }}>
        <SearchField placeholder="Search paddles, shoes, brands" onPress={() => router.push('/deals/search')} />
      </View>
      <ChipRow>
        {FEEDS.map((f, i) => (
          <Chip key={f} label={f} selected={i === 0} />
        ))}
      </ChipRow>
      <ShopByCategory />
      <EmptyState icon="tag" title="Deals are on the way" message="Retailer offers and the deals feed connect to this catalog next." />
    </ScrollView>
  );
}
