import type { Metadata } from 'next';

import { LegalDoc } from '@/components/LegalDoc';

export const dynamic = 'force-static';

export const metadata: Metadata = { title: 'Support', description: 'Get help with PickleDeals.', alternates: { canonical: '/support' } };

export default function SupportPage() {
  return <LegalDoc name="support" />;
}
