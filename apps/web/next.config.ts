import type { NextConfig } from 'next';

const config: NextConfig = {
  // The shared package ships TypeScript source.
  transpilePackages: ['@pickledeals/shared'],
  poweredByHeader: false,
  async redirects() {
    // Short share links from the app (packages/shared/src/share.ts) land on the clean page addresses.
    return [
      { source: '/p/:slug', destination: '/product/:slug', permanent: true },
      { source: '/d/:id', destination: '/deal/:id', permanent: true },
      { source: '/l/:id', destination: '/listing/:id', permanent: true },
      { source: '/b/:slug', destination: '/brand/:slug', permanent: true },
      { source: '/deals/today', destination: '/deals', permanent: true },
    ];
  },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'X-Frame-Options', value: 'DENY' },
        ],
      },
      { source: '/.well-known/apple-app-site-association', headers: [{ key: 'Content-Type', value: 'application/json' }] },
    ];
  },
};

export default config;
