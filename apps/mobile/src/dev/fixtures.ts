import type { DealCardData, ListingCardData, RetailerOfferRowData } from '@/commerce';

/** Gallery-only sample data. Names are illustrative; prices are not real offers. */
export const sampleDeals: DealCardData[] = [
  {
    id: 'd1',
    brand: 'JOOLA',
    name: 'Perseus Pro IV 16mm',
    image: { kind: 'placeholder', art: 'paddle', c1: '#1F5FD1', c2: '#C8F03C', alt: 'Blue paddle' },
    retailer: 'CourtSide Pro Shop',
    priceDisplay: 'show',
    priceCents: 18900,
    referenceCents: 27900,
    badge: 'LOWEST PRICE',
    meta: 'CourtSide Pro Shop · Save $90',
  },
  {
    id: 'd2',
    brand: 'CRBN',
    name: '3X Power Series 16mm',
    image: { kind: 'placeholder', art: 'paddle', c1: '#26282B', c2: '#9BE15D', alt: 'Black paddle' },
    retailer: 'Amazon',
    priceDisplay: 'check_price',
    priceCents: null,
    referenceCents: null,
    badge: null,
    meta: 'Amazon',
  },
  {
    id: 'd3',
    brand: 'Selkirk',
    name: 'Core Line Tour Backpack',
    image: { kind: 'placeholder', art: 'bag', c1: '#1D3557', c2: '#E63946', alt: 'Navy backpack' },
    retailer: 'Selkirk.com',
    priceDisplay: 'show',
    priceCents: 8900,
    referenceCents: 11000,
    badge: null,
    sponsoredBy: 'Selkirk',
  },
  {
    id: 'd4',
    brand: 'Skechers',
    name: 'Viper Court Pro',
    image: { kind: 'placeholder', art: 'shoe', c1: '#FF5D8F', c2: '#1C1C1C', alt: 'Pink court shoe' },
    retailer: 'Skechers.com',
    priceDisplay: 'show',
    priceCents: 9400,
    referenceCents: 13500,
    badge: 'PROMO CODE',
    meta: 'Code COURT20 · ends 2d',
  },
];

export const sampleListings: ListingCardData[] = [
  {
    id: 'l1',
    title: 'JOOLA Perseus Pro IV 16mm',
    image: { kind: 'placeholder', art: 'paddle', c1: '#1F5FD1', c2: '#C8F03C', alt: 'Blue paddle' },
    conditionLabel: 'Excellent',
    askCents: 15000,
    bestNewCents: 18900,
    areaLabel: 'Lakewood Ranch',
    distance: '~3 mi',
  },
  {
    id: 'l2',
    title: 'Lobster Pickle Elite',
    image: { kind: 'placeholder', art: 'machine', c1: '#FF7F11', c2: '#FFFFFF', alt: 'Orange ball machine' },
    conditionLabel: 'Good',
    askCents: 52000,
    bestNewCents: 64900,
    areaLabel: 'Bradenton',
    distance: '~11 mi',
    status: 'pending',
  },
];

export const sampleOffers: RetailerOfferRowData[] = [
  { retailer: 'CourtSide Pro Shop', monogram: 'CS', detail: 'In stock · $6 shipping · checked 12m ago', priceCents: 18900, isBest: true },
  { retailer: 'JOOLA.com', monogram: 'J', detail: '$229, or $195 with code DINK15', priceCents: 19500, deltaLabel: '+$6' },
  { retailer: 'Baseline Sports', monogram: 'BL', detail: 'Free shipping', priceCents: 19900, deltaLabel: '+$10', sponsored: true },
  { retailer: 'Amazon', monogram: 'a', detail: 'Live price shown on Amazon', priceCents: null },
];
