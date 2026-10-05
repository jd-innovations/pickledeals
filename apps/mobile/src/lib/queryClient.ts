import { QueryClient } from '@tanstack/react-query';

import { PERSISTED_ROOTS, PERSIST_MAX_AGE } from './queryPersist';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60_000,
      retry: 2,
    },
  },
});

// Persisted reads must outlive the persisted cache, or they'd be dropped before they're restored.
for (const root of PERSISTED_ROOTS) queryClient.setQueryDefaults([root], { gcTime: PERSIST_MAX_AGE });
