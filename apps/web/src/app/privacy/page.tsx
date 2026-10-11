import type { Metadata } from 'next';

import { LegalDoc } from '@/components/LegalDoc';

export const dynamic = 'force-static';

export const metadata: Metadata = { title: 'Privacy Policy', description: 'How PickleDeals collects, uses and protects your information.', alternates: { canonical: '/privacy' } };

export default function PrivacyPage() {
  return <LegalDoc name="privacy" />;
}
