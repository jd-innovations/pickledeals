import AsyncStorage from '@react-native-async-storage/async-storage';
import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister';
import type { Query } from '@tanstack/react-query';
import type { PersistQueryClientOptions } from '@tanstack/react-query-persist-client';
import Constants from 'expo-constants';

/**
 * Offline cache (Phase 13). Public catalog, deals and retailer-offer reads are written to the device
 * so the app opens with content when there's no signal; everything else stays in memory only.
 *
 * Never persisted:
 * - `market`: feed keys carry the device point, which never leaves memory (D2).
 * - `me`, `chat`, alerts, etc.: personal data.
 * - catalog search: one entry per keystroke, not worth the disk.
 * - anything holding a live Amazon API price: those can't be shown once an hour old or cached (§9).
 */
export const PERSISTED_ROOTS = new Set(['catalog', 'deals', 'offers']);
export const PERSIST_MAX_AGE = 24 * 60 * 60_000;

function shouldPersist(query: Query): boolean {
  if (query.state.status !== 'success') return false;
  const [root, kind] = query.queryKey;
  if (typeof root !== 'string' || !PERSISTED_ROOTS.has(root)) return false;
  if (root === 'catalog' && kind === 'search') return false;
  return !JSON.stringify(query.state.data).includes('"priceSource":"api"');
}

export const persistOptions: Omit<PersistQueryClientOptions, 'queryClient'> = {
  persister: createAsyncStoragePersister({ storage: AsyncStorage, key: 'pd.query-cache.v1', throttleTime: 2_000 }),
  maxAge: PERSIST_MAX_AGE,
  // A new app version may change response shapes; start from an empty cache.
  buster: Constants.expoConfig?.version ?? '',
  dehydrateOptions: { shouldDehydrateQuery: shouldPersist },
};
