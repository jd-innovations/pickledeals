import type { Metadata } from 'next';

import { Icon, type IconName } from '@/components/Icon';
import { PartnerForm } from '@/components/client/PartnerForm';

export const dynamic = 'force-static';

export const metadata: Metadata = {
  title: 'Partner with PickleDeals',
  description: 'For pickleball brands and stores on Shopify: connect your store, offer an exclusive promo code, or book a sponsored placement.',
  alternates: { canonical: '/partners' },
};

const FACTS = ['Offers ranked by price after codes, never by commission', 'Products and prices sync from Shopify automatically', 'Shoppers check out on your store, not ours'];

const OFFERS: { icon: IconName; tag: string; paid?: boolean; t: string; d: string }[] = [
  { icon: 'store', tag: 'Free', t: 'Connect your Shopify store', d: 'Your products, prices and stock sync automatically through Shopify, and show up next to every other store’s offer for the same item.' },
  { icon: 'tag', tag: 'Free', t: 'Exclusive promo codes', d: 'Give PickleDeals shoppers a code of their own. It’s applied with a Shopify discount link, so nobody has to copy it, and it’s tagged “exclusive”.' },
  { icon: 'star', tag: 'Paid', paid: true, t: 'Sponsored placement', d: 'A featured spot on the home page or in a category, always labeled “Sponsored”. Pricing on request.' },
];

const STEPS = [
  { t: 'Apply', d: 'Tell us about your brand or store. We check that it runs on Shopify.' },
  { t: 'We reply', d: 'Usually within two business days, with what we need to connect your store.' },
  { t: 'Connect', d: 'You give us read-only access to your public product catalog through Shopify. No orders, no customer data.' },
  { t: 'Go live', d: 'Your products appear in the app and on pickledeals.app, matched to the right items, with prices checked through the day.' },
];

const RULES = [
  { t: 'Ranked by price only', d: 'Offers are ordered by price after codes. Partnering never moves your offer up.' },
  { t: 'Sponsored is always labeled', d: 'Paid spots say “Sponsored” wherever they appear.' },
  { t: 'Your store, your checkout', d: 'Shoppers buy on your Shopify store. We never take payment or hold stock.' },
  { t: 'Shopify stores only, for now', d: 'It’s how we keep products and prices accurate without manual updates.' },
];

/** "Partner with PickleDeals" (approved mockup: preview/WebPartners.dc.html). Shopify stores only. */
export default function PartnersPage() {
  return (
    <main className="page wrap" style={{ paddingTop: 40 }}>
      <section className="partner-top">
        <div className="partner-pitch">
          <span className="partner-eyebrow">
            <Icon name="store" size={14} stroke={2} />
            For brands and stores on Shopify
          </span>
          <h1>Get your gear in front of pickleball players</h1>
          <p className="lede">
            PickleDeals compares prices and promo codes across pickleball stores, in the iPhone app and on the web. Connect your Shopify store and your products show up wherever players are
            comparing.
          </p>
          <ul className="perks">
            {FACTS.map((f) => (
              <li key={f}>{f}</li>
            ))}
          </ul>
        </div>
        <PartnerForm />
      </section>

      <section className="section">
        <h2 className="partner-h2">Ways to partner</h2>
        <div className="partner-offers">
          {OFFERS.map((o) => (
            <div key={o.t} className="partner-offer">
              <div className="row">
                <span className="ic">
                  <Icon name={o.icon} size={20} />
                </span>
                <span className={`pill${o.paid ? '' : ' soft'}`}>{o.tag}</span>
              </div>
              <h3>{o.t}</h3>
              <p>{o.d}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="two-col">
        <div className="section">
          <h2 className="partner-h2">How it works</h2>
          <ol className="partner-steps">
            {STEPS.map((s, i) => (
              <li key={s.t}>
                <span className="n num" aria-hidden="true">
                  {i + 1}
                </span>
                <span>
                  <b>{s.t}</b>
                  <span>{s.d}</span>
                </span>
              </li>
            ))}
          </ol>
        </div>
        <div className="section">
          <h2 className="partner-h2">Our rules</h2>
          <div className="specs" style={{ padding: '6px 20px' }}>
            {RULES.map((r) => (
              <div key={r.t} style={{ padding: '14px 0', borderBottom: '1px solid var(--separator)', display: 'flex', flexDirection: 'column', gap: 2 }}>
                <b style={{ fontSize: 15 }}>{r.t}</b>
                <span className="muted" style={{ fontSize: 14, lineHeight: 1.5 }}>
                  {r.d}
                </span>
              </div>
            ))}
          </div>
        </div>
      </section>
    </main>
  );
}
