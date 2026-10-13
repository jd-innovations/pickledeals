import Link from 'next/link';

import { Icon } from './Icon';
import { SearchBox, SectionTabs, ThemeButton, ThemeSwitch } from './client/Chrome';

function Logo({ height }: { height?: number }) {
  return (
    <span className="logo" style={height ? { lineHeight: 0 } : undefined}>
      <img className="light-logo" src="/brand/pd-logo-black.svg" alt="PickleDeals" width={120} height={32} style={height ? { height } : undefined} />
      <img className="dark-logo" src="/brand/pd-logo-white.svg" alt="PickleDeals" width={120} height={32} style={height ? { height } : undefined} />
    </span>
  );
}

export function SiteHeader() {
  return (
    <>
      <div className="appbar-strip">
        <div className="wrap">
          <span>Price alerts, saves and pre-owned chat live in the app. Sign up free, no password needed.</span>
          <Link href="/app">Get PickleDeals for iPhone ›</Link>
        </div>
      </div>
      <header className="site-header">
        <div className="wrap row">
          <Link href="/" aria-label="PickleDeals home" className="logo-link">
            <Logo />
          </Link>
          <SearchBox />
          <span className="header-spacer desktop-only" />
          <ThemeButton />
          <Link href="/app" className="btn btn-primary btn-sm desktop-only">
            <Icon name="phone" size={16} stroke={2} />
            Get the app
          </Link>
        </div>
        <SectionTabs />
      </header>
    </>
  );
}

/** Phone browsers: the "Open in app" banner above the header. */
export function AppBanner() {
  return (
    <div className="app-banner mobile-only">
      <span className="icon" aria-hidden="true">
        PD
      </span>
      <span className="t">
        PickleDeals for iPhone
        <span>Price alerts, saves and chat</span>
      </span>
      <Link href="/app" className="btn btn-primary btn-xs">
        Open
      </Link>
    </div>
  );
}

const COLS = [
  {
    h: 'Deals',
    links: [
      ['Today’s deals', '/deals'],
      ['Price drops', '/deals/price-drops'],
      ['Promo codes', '/promo-codes'],
      ['Ending soon', '/deals/ending-soon'],
      ['New deals', '/deals/new'],
    ],
  },
  {
    h: 'Shop',
    links: [
      ['Paddles', '/category/paddles'],
      ['Shoes', '/category/shoes'],
      ['Balls', '/category/balls'],
      ['Bags', '/category/bags'],
      ['All categories', '/categories'],
    ],
  },
  {
    h: 'Pre-owned',
    links: [
      ['Pre-owned near you', '/marketplace'],
      ['Paddles', '/marketplace?category=paddles'],
      ['All brands', '/brands'],
    ],
  },
  {
    h: 'PickleDeals',
    links: [
      ['Get the app', '/app'],
      ['Partner with us', '/partners'],
      ['Support', '/support'],
      ['Affiliate disclosure', '/affiliate-disclosure'],
      ['Privacy', '/privacy'],
      ['Terms', '/terms'],
    ],
  },
] as const;

export function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="wrap cols">
        <div className="about">
          <Logo height={30} />
          <p>Pickleball deals, promo codes and pre-owned gear. Prices checked through the day.</p>
          <Link href="/app" className="btn btn-primary btn-sm">
            Get the iPhone app
          </Link>
        </div>
        {COLS.map((c) => (
          <nav key={c.h} className="col" aria-label={c.h}>
            <b>{c.h}</b>
            {c.links.map(([label, href]) => (
              <Link key={href} href={href}>
                {label}
              </Link>
            ))}
          </nav>
        ))}
      </div>
      <div className="wrap legal">
        <p>
          PickleDeals may earn a commission when you buy through links on this site, at no extra cost to you. Prices and codes come from the stores and can change; the price at the store’s
          checkout is the one that applies.
        </p>
        <div className="bottom">
          <span>© 2026 JD Innovations LLC · Bradenton, Florida</span>
          <ThemeSwitch />
        </div>
      </div>
    </footer>
  );
}
