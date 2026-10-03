/** Web build: no push (expo-notifications has no web support). Same API as push.ts. */
export type PushResult = 'registered' | 'denied' | 'unsupported' | 'no-project' | 'error';

export async function ensurePushRegistered(_opts: { ask: boolean }): Promise<PushResult> {
  return 'unsupported';
}

export function usePush() {}
