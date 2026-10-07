import { router } from 'expo-router';
import { View } from 'react-native';

import { DealCard } from '@/commerce';
import { useSavedIds, useToggleSave } from '@/features/alerts/hooks';
import { useGridCardWidth } from '@/features/catalog/components';
import { EmptyState } from '@/ui';

import type { Deal } from './api';
import { toCard } from './hooks';

export const openDealDetail = (d: Pick<Deal, 'offerId' | 'id'>) => router.push({ pathname: '/deals/offer/[id]', params: { id: d.offerId, deal: d.id } });

export function DealGrid({ deals }: { deals: Deal[] }) {
  const cardW = useGridCardWidth();
  const saved = useSavedIds();
  const toggle = useToggleSave();
  if (deals.length === 0) {
    return <EmptyState icon="tag" title="No deals match" message="Try fewer filters, or check back — prices are re-checked through the day." />;
  }
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12, rowGap: 22, paddingHorizontal: 16 }}>
      {deals.map((d) => (
        <DealCard
          key={d.id}
          width={cardW}
          deal={toCard(d)}
          saved={saved.deals.has(d.id)}
          onToggleSave={() => toggle('deal', d.id, saved.deals.has(d.id))}
          onPress={() => openDealDetail(d)}
        />
      ))}
    </View>
  );
}
