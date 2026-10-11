import { ImageResponse } from 'next/og';

export const alt = 'PickleDeals: pickleball deals, promo codes and pre-owned gear';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

/** Default link-preview card for pages without a product photo. */
export default function OpenGraphImage() {
  return new ImageResponse(
    (
      <div style={{ width: '100%', height: '100%', background: '#0A0A0A', color: '#FFFFFF', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', padding: 72 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 24 }}>
          <div style={{ width: 112, height: 112, borderRadius: 26, background: '#FFFFFF', color: '#0A0A0A', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 52, fontWeight: 800 }}>PD</div>
          <div style={{ fontSize: 56, fontWeight: 800, letterSpacing: -2 }}>PickleDeals</div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ fontSize: 68, fontWeight: 800, letterSpacing: -2, lineHeight: 1.05 }}>Pickleball deals, promo codes and pre-owned gear</div>
          <div style={{ fontSize: 30, color: '#A6A6A6' }}>Prices compared across stores, checked through the day.</div>
        </div>
      </div>
    ),
    size,
  );
}
