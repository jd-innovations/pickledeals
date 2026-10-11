import type { Metadata } from 'next';
import Link from 'next/link';

export const dynamic = 'force-static';

export const metadata: Metadata = {
  title: 'Affiliate disclosure',
  description: 'How PickleDeals earns money from store links, and why it never changes which offer is listed first.',
  alternates: { canonical: '/affiliate-disclosure' },
};

export default function AffiliateDisclosurePage() {
  return (
    <main className="page tight wrap">
      <article className="doc">
        <h1>Affiliate disclosure</h1>
        <p className="meta">Effective October 11, 2026</p>
        <p>
          Some links on PickleDeals are affiliate links. When you click one and buy something, the store may pay us a commission. It costs you nothing extra, and it’s how we keep PickleDeals
          free.
        </p>
        <h2>Commissions never change the order</h2>
        <p>
          Offers are ranked by price after promo codes, lowest first. A store that pays us a commission isn’t moved up, and a store that doesn’t isn’t moved down. When we show “Today’s best
          deal” or a staff pick, we choose it for the price and the product, not the commission.
        </p>
        <h2>Stores we’re connected to</h2>
        <p>
          PickleDeals’ owner also owns Pickleball Grip Doctor. We say so next to its offers. It’s ranked by price like every other store; when two prices tie exactly, it’s listed first.
        </p>
        <h2>Prices and codes</h2>
        <p>
          Prices and codes come from the stores and can change. Prices on PickleDeals don’t include tax or shipping, which the store settles at checkout. The price at the store’s checkout is
          the one that applies. If something looks wrong, tell us at <a href="mailto:support@pickledeals.app">support@pickledeals.app</a>.
        </p>
        <p>
          More about your data is in our <Link href="/privacy">Privacy Policy</Link>.
        </p>
      </article>
    </main>
  );
}
