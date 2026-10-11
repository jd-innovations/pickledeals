import type { Metadata } from 'next';

import { LegalDoc } from '@/components/LegalDoc';

export const dynamic = 'force-static';

export const metadata: Metadata = { title: 'Terms of Use', description: 'The terms for using PickleDeals.', alternates: { canonical: '/terms' } };

export default function TermsPage() {
  return <LegalDoc name="terms" />;
}
