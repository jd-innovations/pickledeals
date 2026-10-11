import type { Metadata } from 'next';

import { OpenInApp } from '@/components/client/OpenInApp';

export const metadata: Metadata = { title: 'Open in PickleDeals', robots: { index: false } };

/** Links in notification emails: hands the in-app route to the app (universal link, else the app scheme). */
export default function OpenPage() {
  return (
    <main className="page tight wrap">
      <OpenInApp />
    </main>
  );
}
