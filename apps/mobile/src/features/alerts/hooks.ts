import type { AuthIntent } from '@pickledeals/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { Alert } from 'react-native';

import { haptic } from '@/lib/haptics';
import { useAuth } from '@/features/auth/authStore';

import {
  createSavedSearch,
  deleteAlert,
  deleteSavedSearch,
  fetchAlerts,
  fetchBestPrices,
  fetchFollowedBrands,
  fetchNotifications,
  fetchSavedDeals,
  fetchSavedIds,
  fetchSavedProducts,
  fetchSavedSearches,
  markRead,
  setAlertStatus,
  setSaved,
  updateSavedSearch,
  upsertAlert,
  type SavedIds,
  type SaveKind,
  fetchNotificationSettings,
  setNotificationCategory,
  setNotificationSettings,
  type NotificationCategory,
  type NotificationSettings,
} from './api';

export const meKeys = {
  savedIds: (uid: string) => ['me', uid, 'saved-ids'] as const,
  savedProducts: (uid: string) => ['me', uid, 'saved-products'] as const,
  brands: (uid: string) => ['me', uid, 'brands'] as const,
  alerts: (uid: string) => ['me', uid, 'alerts'] as const,
  searches: (uid: string) => ['me', uid, 'searches'] as const,
  notifications: (uid: string) => ['me', uid, 'notifications'] as const,
};

const EMPTY: SavedIds = { products: new Set(), deals: new Set(), brands: new Set(), listings: new Set() };

export function useSavedIds() {
  const uid = useAuth((s) => s.user?.id);
  const q = useQuery({ queryKey: meKeys.savedIds(uid ?? ''), queryFn: fetchSavedIds, enabled: !!uid, staleTime: 5 * 60_000 });
  return uid ? (q.data ?? EMPTY) : EMPTY;
}

const INTENT: Record<SaveKind, AuthIntent> = { product: 'save_product', deal: 'save_deal', brand: 'follow_brand', listing: 'save_listing' };
const SET_KEY = { product: 'products', deal: 'deals', brand: 'brands', listing: 'listings' } as const;

/**
 * Save / follow toggle with the D6 auth flow: guests sign in first and the save resumes.
 * Optimistic: the heart fills immediately and rolls back if the write fails.
 */
export function useToggleSave() {
  const qc = useQueryClient();
  const requireAuth = useAuth((s) => s.requireAuth);
  const mutation = useMutation({
    mutationFn: ({ uid, kind, id, saved }: { uid: string; kind: SaveKind; id: string; saved: boolean }) => setSaved(uid, kind, id, saved),
    onMutate: async ({ uid, kind, id, saved }) => {
      const key = meKeys.savedIds(uid);
      await qc.cancelQueries({ queryKey: key });
      const prev = qc.getQueryData<SavedIds>(key);
      const base = prev ?? EMPTY;
      const nextSet = new Set(base[SET_KEY[kind]]);
      if (saved) nextSet.add(id);
      else nextSet.delete(id);
      qc.setQueryData<SavedIds>(key, { ...base, [SET_KEY[kind]]: nextSet });
      return { prev, key };
    },
    onError: (_e, _v, ctx) => {
      if (ctx) qc.setQueryData(ctx.key, ctx.prev);
      haptic.error();
      Alert.alert('Couldn’t update', 'Check your connection and try again.');
    },
    onSettled: (_d, _e, { uid }) => {
      qc.invalidateQueries({ queryKey: ['me', uid] });
    },
  });

  return (kind: SaveKind, id: string, currentlySaved: boolean) =>
    requireAuth(INTENT[kind], () => {
      const uid = useAuth.getState().user?.id;
      if (!uid) return;
      // After sign-in, "save" means save — don't toggle off something that was already saved.
      const saved = qc.getQueryData<SavedIds>(meKeys.savedIds(uid))?.[SET_KEY[kind]].has(id) ?? currentlySaved;
      mutation.mutate({ uid, kind, id, saved: !saved });
    });
}

export function useSavedProducts() {
  const uid = useAuth((s) => s.user?.id);
  return useQuery({ queryKey: meKeys.savedProducts(uid ?? ''), queryFn: fetchSavedProducts, enabled: !!uid });
}

export function useSavedDeals() {
  const uid = useAuth((s) => s.user?.id);
  return useQuery({ queryKey: ['me', uid ?? '', 'saved-deals'], queryFn: fetchSavedDeals, enabled: !!uid });
}

export function useFollowedBrands() {
  const uid = useAuth((s) => s.user?.id);
  return useQuery({ queryKey: meKeys.brands(uid ?? ''), queryFn: fetchFollowedBrands, enabled: !!uid });
}

export function useAlerts() {
  const uid = useAuth((s) => s.user?.id);
  return useQuery({ queryKey: meKeys.alerts(uid ?? ''), queryFn: fetchAlerts, enabled: !!uid });
}

export function useAlertPrices(productIds: string[]) {
  return useQuery({ queryKey: ['alert-prices', ...productIds], queryFn: () => fetchBestPrices(productIds), enabled: productIds.length > 0, staleTime: 60_000 });
}

export function useSavedSearches() {
  const uid = useAuth((s) => s.user?.id);
  return useQuery({ queryKey: meKeys.searches(uid ?? ''), queryFn: fetchSavedSearches, enabled: !!uid });
}

export function useNotifications() {
  const uid = useAuth((s) => s.user?.id);
  return useQuery({ queryKey: meKeys.notifications(uid ?? ''), queryFn: fetchNotifications, enabled: !!uid, refetchInterval: 60_000 });
}

export function useUnreadCount() {
  const { data } = useNotifications();
  return (data ?? []).filter((n) => !n.readAt).length;
}

/** Mutations that refresh the user's lists afterwards. */
export function useMeMutations() {
  const qc = useQueryClient();
  const uid = useAuth((s) => s.user?.id ?? '');
  const refresh = () => qc.invalidateQueries({ queryKey: ['me', uid] });
  return {
    saveAlert: useMutation({ mutationFn: (a: Parameters<typeof upsertAlert>[1]) => upsertAlert(uid, a), onSuccess: refresh }),
    setAlertStatus: useMutation({ mutationFn: ({ id, status }: { id: string; status: 'active' | 'paused' }) => setAlertStatus(id, status), onSuccess: refresh }),
    deleteAlert: useMutation({ mutationFn: deleteAlert, onSuccess: refresh }),
    createSearch: useMutation({ mutationFn: (s: Parameters<typeof createSavedSearch>[1]) => createSavedSearch(uid, s), onSuccess: refresh }),
    updateSearch: useMutation({ mutationFn: ({ id, notify }: { id: string; notify: boolean }) => updateSavedSearch(id, { notify }), onSuccess: refresh }),
    deleteSearch: useMutation({ mutationFn: deleteSavedSearch, onSuccess: refresh }),
    markRead: useMutation({ mutationFn: (ids?: string[]) => markRead(ids), onSuccess: refresh }),
  };
}

// --- Notification settings (Phase 10) ----------------------------------------------------------

export function useNotificationSettings() {
  const uid = useAuth((s) => s.user?.id ?? '');
  return useQuery({ queryKey: ['me', uid, 'notification-settings'], queryFn: fetchNotificationSettings, enabled: !!uid });
}

/** Optimistic: toggles flip immediately and roll back on error. */
export function useNotificationSettingsMutations() {
  const qc = useQueryClient();
  const uid = useAuth((s) => s.user?.id ?? '');
  const key = ['me', uid, 'notification-settings'];
  const optimistic = (patch: (s: NotificationSettings) => NotificationSettings) => async () => {
    await qc.cancelQueries({ queryKey: key });
    const prev = qc.getQueryData<NotificationSettings>(key);
    if (prev) qc.setQueryData(key, patch(prev));
    return { prev };
  };
  const rollback = (_e: unknown, _v: unknown, ctx?: { prev?: NotificationSettings }) => {
    haptic.error();
    if (ctx?.prev) qc.setQueryData(key, ctx.prev);
  };
  const settle = () => qc.invalidateQueries({ queryKey: key });
  return {
    setCategory: useMutation({
      mutationFn: ({ category, enabled }: { category: NotificationCategory; enabled: boolean }) => setNotificationCategory(category, enabled),
      onMutate: (v) => optimistic((s) => ({ ...s, categories: { ...s.categories, [v.category]: v.enabled } }))(),
      onError: rollback,
      onSettled: settle,
    }),
    setDelivery: useMutation({
      mutationFn: setNotificationSettings,
      onMutate: (v) =>
        optimistic((s) => ({
          ...s,
          quietEnabled: v.quietEnabled ?? s.quietEnabled,
          quietStart: v.quietStart ?? s.quietStart,
          quietEnd: v.quietEnd ?? s.quietEnd,
          dailyDealCap: v.dailyDealCap === undefined ? s.dailyDealCap : v.dailyDealCap,
        }))(),
      onError: rollback,
      onSettled: settle,
    }),
  };
}

/** Quiet hours and the weekly digest use local time: keep the account's zone in step with the device. */
export function useTimeZoneSync() {
  const uid = useAuth((s) => s.user?.id);
  useEffect(() => {
    if (!uid) return;
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (tz) setNotificationSettings({ tz }).catch(() => {});
  }, [uid]);
}
