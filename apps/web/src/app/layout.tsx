import type { Metadata, Viewport } from 'next';
import { Geist } from 'next/font/google';
import type { ReactNode } from 'react';

import { AppBanner, SiteFooter, SiteHeader } from '@/components/Chrome';
import { TabBar } from '@/components/client/Chrome';
import { SaveInAppProvider } from '@/components/client/SaveInApp';
import { SITE_URL } from '@/lib/urls';
import { THEME_BOOT, THEME_CSS } from '@/lib/theme';

import './globals.css';

const geist = Geist({ subsets: ['latin'], variable: '--font-geist', display: 'swap' });

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: 'PickleDeals — pickleball deals, promo codes and pre-owned gear', template: '%s · PickleDeals' },
  description: 'Pickleball deals and promo codes from paddle, shoe and gear stores, checked through the day, plus pre-owned paddles near you.',
  applicationName: 'PickleDeals',
  openGraph: { siteName: 'PickleDeals', type: 'website', locale: 'en_US' },
  twitter: { card: 'summary_large_image' },
  appleWebApp: { title: 'PickleDeals' },
};

export const viewport: Viewport = {
  viewportFit: 'cover',
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#FFFFFF' },
    { media: '(prefers-color-scheme: dark)', color: '#0B0B0C' },
  ],
};

export default function RootLayout({ children, modal }: { children: ReactNode; modal: ReactNode }) {
  return (
    <html lang="en" className={geist.variable} suppressHydrationWarning>
      <head>
        <style dangerouslySetInnerHTML={{ __html: THEME_CSS }} />
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOT }} />
      </head>
      <body>
        <SaveInAppProvider siteUrl={SITE_URL}>
          <a href="#main" className="sr-only">
            Skip to content
          </a>
          <AppBanner />
          <SiteHeader />
          <div id="main">{children}</div>
          <SiteFooter />
          <TabBar />
          {modal}
        </SaveInAppProvider>
      </body>
    </html>
  );
}
