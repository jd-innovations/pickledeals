import { describe, expect, it } from 'vitest';

import type { Deal } from '@/data/deals';
import type { RankedOffer } from '@/data/offers';

import { productArt } from './art';
import { dealButtonLabel, dealMeta, dealPercent, deltaLabel, monogram, offerDetail } from './copy';
import { FEED_PATHS, feedFromSegment } from './links';
import { goUrl, storageUrl } from './urls';

const offer = (o: Partial<RankedOffer> = {}): RankedOffer => ({
  offerId: 'o1',
  variantId: 'v1',
  retailer: { slug: 'joola-com', name: 'JOOLA.com' },
  priceDisplay: 'show',
  priceCents: 22900,
  shippingCents: 0,
  deliveredCents: 17900,
  promo: { id: 'p1', code: 'DINK15', discountCents: 5000 },
  rank: 1,
  inStock: true,
  sizes: [],
  checkedAt: '2026-10-11T12:00:00Z',
  priceSource: 'feed',
  trackingExcluded: false,
  shipsFrom: null,
  ownershipNote: null,
  codeAutoApplied: false,
  shippingPolicy: null,
  ...o,
});

const deal = (d: Partial<Deal> = {}): Deal => ({
  id: 'd1',
  kind: 'sale',
  headline: '',
  isStaffPick: false,
  startsAt: '2026-10-01T00:00:00Z',
  endsAt: null,
  product: { id: 'p', slug: 'joola-perseus-pro-iv', name: 'Perseus Pro IV' },
  variant: { id: 'v', label: '16mm', hasSiblings: true },
  brand: { slug: 'joola', name: 'JOOLA' },
  category: { slug: 'paddles', name: 'Paddles' },
  offerId: 'o1',
  retailer: { slug: 'joola-com', name: 'JOOLA.com' },
  priceDisplay: 'show',
  priceCents: 17900,
  wasCents: 27900,
  msrpCents: null,
  discountPct: null,
  drop7dCents: 0,
  inStock: true,
  promo: null,
  quality: null,
  offerCount: 1,
  badges: [],
  image: null,
  ...d,
});

describe('offer copy', () => {
  it('describes an offer with its code and shipping', () => {
    expect(offerDetail(offer())).toBe('$229, or $179 with code DINK15 · free shipping');
    expect(offerDetail(offer({ priceDisplay: 'check_price', priceCents: null }))).toBe('Price shown at the store');
  });

  it('labels the main button like the app', () => {
    expect(dealButtonLabel(offer())).toBe('Copy code & get deal');
    expect(dealButtonLabel(offer({ promo: null }))).toBe('Get deal at JOOLA.com');
    expect(dealButtonLabel(offer({ promo: null, retailer: { slug: 'x', name: 'Pickleball Grip Doctor' } }))).toBe('Get deal');
  });

  it('compares against the best price, never for check-price offers (D1)', () => {
    expect(deltaLabel(offer({ deliveredCents: 19500 }), 17900)).toBe('+$16');
    expect(deltaLabel(offer(), 17900)).toBe('Best price');
    expect(deltaLabel(offer({ priceDisplay: 'check_price' }), 17900)).toBe('');
  });
});

describe('deal copy', () => {
  it('shows a discount only when there is a price (D1)', () => {
    expect(dealPercent(deal())).toBe(35);
    expect(dealPercent(deal({ priceDisplay: 'check_price', priceCents: null }))).toBeNull();
  });

  it('prefers ending soon, then the code, then the drop', () => {
    const soon = new Date(Date.now() + 5 * 3600_000).toISOString();
    expect(dealMeta(deal({ endsAt: soon }), () => 'Ends in 5h')).toBe('Ends in 5h');
    expect(dealMeta(deal({ promo: { id: 'p', code: 'X' } }), () => '')).toBe('JOOLA.com · with code');
    expect(dealMeta(deal({ drop7dCents: 4000 }), () => '')).toBe('JOOLA.com · dropped $40');
  });

  it('makes short store monograms', () => {
    expect(monogram('Pickleball Grip Doctor')).toBe('PGD');
    expect(monogram('JOOLA.com')).toBe('JOOLA');
    expect(monogram('Selkirk')).toBe('SELK');
  });
});

describe('links and art', () => {
  it('maps feed addresses both ways', () => {
    expect(FEED_PATHS.price_drops).toBe('/deals/price-drops');
    expect(feedFromSegment('price-drops')).toBe('price_drops');
    expect(feedFromSegment('nope')).toBeNull();
  });

  it('routes Get deal through the go redirect with a web placement', () => {
    expect(goUrl('o1', 'product', 'p1')).toMatch(/\/functions\/v1\/go\?o=o1&pl=web_product&p=p1$/);
    expect(storageUrl('catalog', 'a b/c.png')).toMatch(/\/storage\/v1\/object\/public\/catalog\/a%20b\/c\.png$/);
  });

  it('gives a product the same placeholder art every time', () => {
    expect(productArt('joola-perseus-pro-iv', 'paddles')).toEqual(productArt('joola-perseus-pro-iv', 'paddles'));
    expect(productArt('any', 'balls').kind).toBe('ball');
  });
});
