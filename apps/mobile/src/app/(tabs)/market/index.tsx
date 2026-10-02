import { ScrollView, View } from 'react-native';

import { EmptyState, SearchField, SegmentedControl } from '@/ui';
import { useState } from 'react';

export default function MarketplaceScreen() {
  const [view, setView] = useState<'grid' | 'map'>('grid');
  return (
    <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={{ paddingBottom: 120, gap: 16, paddingHorizontal: 16 }}>
      <SearchField placeholder="Search pre-owned gear" onPress={() => {}} />
      <SegmentedControl
        options={[
          { value: 'grid', label: 'Grid' },
          { value: 'map', label: 'Map' },
        ]}
        value={view}
        onChange={setView}
      />
      <View>
        <EmptyState
          icon={view === 'grid' ? 'grid' : 'map'}
          title="Pre-owned listings arrive soon"
          message="Browsing is open to everyone. Listings land in Phase 6 and the map in Phase 7."
        />
      </View>
    </ScrollView>
  );
}
