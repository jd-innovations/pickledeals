import { useState } from 'react';
import { ScrollView } from 'react-native';

import { useAuth } from '@/features/auth/authStore';
import { EmptyState, SegmentedControl } from '@/ui';

type Section = 'activity' | 'alerts' | 'saved';

export default function AlertsScreen() {
  const [section, setSection] = useState<Section>('activity');
  const user = useAuth((s) => s.user);
  const requireAuth = useAuth((s) => s.requireAuth);

  return (
    <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 120, gap: 16 }}>
      <SegmentedControl
        options={[
          { value: 'activity', label: 'Activity' },
          { value: 'alerts', label: 'Price alerts' },
          { value: 'saved', label: 'Saved' },
        ]}
        value={section}
        onChange={setSection}
      />
      {user ? (
        <EmptyState icon="bell" title="Nothing yet" message="Price drops, offers and nearby matches will show up here." />
      ) : (
        <EmptyState
          icon="bell"
          title="Get notified when prices drop"
          message="Save products and set a target price. We’ll tell you when it’s time to buy."
          actionLabel="Sign in"
          onAction={() => requireAuth('create_price_alert', () => {})}
        />
      )}
    </ScrollView>
  );
}
