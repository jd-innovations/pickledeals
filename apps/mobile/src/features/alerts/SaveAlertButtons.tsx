import { router } from 'expo-router';
import { View } from 'react-native';

import { haptic } from '@/lib/haptics';
import { useTheme } from '@/design/theme';
import { useAuth } from '@/features/auth/authStore';
import { Button } from '@/ui';

import { useAlerts, useSavedIds, useToggleSave } from './hooks';
import type { SaveKind } from './api';

/**
 * Save + Price alert pair (product and deal pages). ON states use the accent tokens: saved = filled red
 * heart, alert set = filled yellow bell labelled "Alert set". `save` is what the heart saves: the product
 * on its page, the deal on a deal page (the same save as the deal card's heart).
 */
export function SaveAlertButtons({
  save,
  product,
  variantId,
  showAlert = true,
}: {
  save: { kind: Extract<SaveKind, 'product' | 'deal'>; id: string };
  product: { id: string; slug: string };
  variantId?: string;
  /** Alerts never track Amazon: hide for products sold only there. */
  showAlert?: boolean;
}) {
  const { colors } = useTheme();
  const saved = useSavedIds();
  const toggleSave = useToggleSave();
  const requireAuth = useAuth((s) => s.requireAuth);
  const alerts = useAlerts();
  const isSaved = (save.kind === 'deal' ? saved.deals : saved.products).has(save.id);
  const alertSet = !!alerts.data?.some((a) => a.product.id === product.id && a.status === 'active');
  const openAlert = () =>
    requireAuth('create_price_alert', () => router.push({ pathname: '/deals/price-alert', params: { slug: product.slug, variant: variantId ?? '' } }));

  return (
    <View style={{ flexDirection: 'row', gap: 10 }}>
      <Button
        label={isSaved ? 'Saved' : 'Save'}
        variant="secondary"
        size="md"
        icon="heart"
        iconFilled={isSaved}
        iconColor={isSaved ? colors.saved : undefined}
        style={{ flex: 1 }}
        onPress={() => {
          haptic.tap();
          toggleSave(save.kind, save.id, isSaved);
        }}
      />
      {showAlert && (
        <Button
          label={alertSet ? 'Alert set' : 'Price alert'}
          variant="secondary"
          size="md"
          icon="bell"
          iconFilled={alertSet}
          iconColor={alertSet ? colors.alert : undefined}
          style={{ flex: 1 }}
          onPress={openAlert}
        />
      )}
    </View>
  );
}

/** Header shortcut to the Saved library, opened inside the current tab's stack (back returns here). */
export function openSaved(tab: 'deals' | 'market') {
  useAuth.getState().requireAuth('view_saved', () => router.push(tab === 'deals' ? '/deals/saved' : '/market/saved'));
}
