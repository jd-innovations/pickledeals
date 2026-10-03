import { router } from 'expo-router';
import { View } from 'react-native';

import { DealCard } from '@/commerce';
import { useGridCardWidth } from '@/features/catalog/components';
import { EmptyState } from '@/ui';

import type { Deal } from './api';
import { toCard } from './hooks';

export const openDealDetail = (d: Pick<Deal, 'offerId'>) => router.push({ pathname: '/deals/offer/[id]', params: { id: d.offerId } });

export function DealGrid({ deals }: { deals: Deal[] }) {
  const cardW = useGridCardWidth();
  if (deals.length === 0) {
    return <EmptyState icon="tag" title="No deals match" message="Try fewer filters, or check back — prices are re-checked through the day." />;
  }
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12, rowGap: 22, paddingHorizontal: 16 }}>
      {deals.map((d) => (
        <DealCard key={d.id} width={cardW} deal={toCard(d)} onPress={() => openDealDetail(d)} />
      ))}
    </View>
  );
}
