import type { Metadata } from 'next';

import { Unsubscribe } from '@/components/client/Unsubscribe';

export const metadata: Metadata = { title: 'Email settings', robots: { index: false } };

/** One-click unsubscribe landing for missed-message emails (link in each email's footer). */
export default function UnsubscribePage() {
  return (
    <main className="page tight wrap">
      <Unsubscribe />
    </main>
  );
}
