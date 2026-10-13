import type { Metadata } from 'next';

import { Icon } from '@/components/Icon';

export const dynamic = 'force-static';

export const metadata: Metadata = {
  title: 'PickleDeals for iPhone',
  description: 'Price alerts, saves, and pre-owned chat and offers: the PickleDeals app for iPhone.',
  alternates: { canonical: '/app' },
};

const APP_STORE_URL = process.env.NEXT_PUBLIC_APP_STORE_URL;

const FEATURES = [
  { icon: 'bell', t: 'Price alerts', d: 'Set a target price and we’ll tell you when a store hits it.' },
  { icon: 'heart', t: 'Saves and follows', d: 'Keep products, deals and listings, and follow the brands you play.' },
  { icon: 'chat', t: 'Pre-owned chat and offers', d: 'Message sellers, make offers and share a meet-up spot without giving out your number.' },
  { icon: 'store', t: 'Sell your gear', d: 'List a paddle in under a minute, right from your camera roll.' },
] as const;

export default function GetTheAppPage() {
  return (
    <main className="page tight wrap" style={{ gap: 40 }}>
      <section style={{ display: 'flex', flexDirection: 'column', gap: 18, maxWidth: 680 }}>
        <span className="app-id">
          <img src="/apple-icon.png" alt="" width={72} height={72} style={{ borderRadius: 16 }} />
        </span>
        <div className="page-title">
          <h1 style={{ fontSize: 'clamp(32px, 5vw, 48px)' }}>PickleDeals for iPhone</h1>
          <p className="sub" style={{ fontSize: 18, lineHeight: 1.5 }}>
            Everything on the website, plus price alerts, saves, and pre-owned chat and offers. Sign up free with Apple, Google
            or email. No password needed.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          {APP_STORE_URL ? (
            <a href={APP_STORE_URL} className="btn btn-primary">
              Download on the App Store
            </a>
          ) : (
            <span className="btn btn-secondary" aria-disabled="true">
              Coming soon to the App Store
            </span>
          )}
          <a href="pickledeals://" className="btn btn-plain" style={{ border: '1px solid var(--border)' }}>
            Already have it? Open the app
          </a>
        </div>
      </section>
      <section className="grid g4" style={{ gap: 16 }}>
        {FEATURES.map((f) => (
          <div key={f.t} style={{ padding: 20, borderRadius: 20, background: 'var(--surface)', display: 'flex', flexDirection: 'column', gap: 8 }}>
            <Icon name={f.icon} size={22} />
            <b style={{ fontSize: 17 }}>{f.t}</b>
            <span className="muted" style={{ fontSize: 15, lineHeight: 1.45 }}>
              {f.d}
            </span>
          </div>
        ))}
      </section>
    </main>
  );
}
