import { setListingStatus } from '@/features/market/api';
import { confirm } from '@/lib/dialog';
import { queryClient } from '@/lib/queryClient';

/**
 * Accepting never changes the listing (§8); the seller decides. Right after accepting we offer the
 * natural next step: mark it Pending so other buyers know.
 */
export async function afterAccept(listingId: string) {
  const yes = await confirm('Mark the listing Pending?', 'Other buyers will see it’s on hold. You can mark it Sold after the handover, or Active again if it falls through.', 'Mark Pending');
  if (!yes) return;
  try {
    await setListingStatus(listingId, 'pending');
  } finally {
    queryClient.invalidateQueries({ queryKey: ['market'] });
    queryClient.invalidateQueries({ queryKey: ['me'] });
    queryClient.invalidateQueries({ queryKey: ['chat'] });
  }
}
