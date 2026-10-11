import { describe, expect, it } from 'vitest';

import { appRouteForLink, shareUrl } from './share';

const OFFER = '7d1c2b3a-0000-4000-8000-000000000001';
const DEAL = '7d1c2b3a-0000-4000-8000-000000000002';

describe('shareUrl', () => {
  it('builds short links', () => {
    expect(shareUrl({ kind: 'product', slug: 'joola-perseus-pro-iv' })).toBe('https://pickledeals.app/p/joola-perseus-pro-iv');
    expect(shareUrl({ kind: 'deal', offerId: OFFER, dealId: DEAL })).toBe(`https://pickledeals.app/d/${OFFER}?deal=${DEAL}`);
    expect(shareUrl({ kind: 'deal', offerId: OFFER })).toBe(`https://pickledeals.app/d/${OFFER}`);
    expect(shareUrl({ kind: 'listing', id: OFFER })).toBe(`https://pickledeals.app/l/${OFFER}`);
    expect(shareUrl({ kind: 'brand', slug: 'joola' })).toBe('https://pickledeals.app/b/joola');
  });
});

describe('appRouteForLink', () => {
  it('maps every share link back to its screen', () => {
    for (const t of [
      { kind: 'product', slug: 'joola-perseus-pro-iv' },
      { kind: 'deal', offerId: OFFER, dealId: DEAL },
      { kind: 'listing', id: OFFER },
      { kind: 'brand', slug: 'joola' },
    ] as const) {
      expect(appRouteForLink(shareUrl(t))).not.toBeNull();
    }
    expect(appRouteForLink('https://pickledeals.app/p/joola-perseus-pro-iv')).toBe('/deals/product/joola-perseus-pro-iv');
    expect(appRouteForLink(`https://pickledeals.app/d/${OFFER}?deal=${DEAL}`)).toBe(`/deals/offer/${OFFER}?deal=${DEAL}`);
    expect(appRouteForLink(`/l/${OFFER}`)).toBe(`/market/listing/${OFFER}`);
    expect(appRouteForLink('pickledeals://b/joola')).toBe('/deals/brand/joola');
  });

  it('opens email links', () => {
    expect(appRouteForLink('https://pickledeals.app/open?to=%2Fconversation%2Fabc')).toBe('/conversation/abc');
    expect(appRouteForLink('https://pickledeals.app/open?to=https%3A%2F%2Fevil.example')).toBe('/');
  });

  it('leaves everything else alone', () => {
    expect(appRouteForLink('/deals/product/joola')).toBeNull();
    expect(appRouteForLink('https://pickledeals.app/privacy')).toBeNull();
    expect(appRouteForLink('/p/Bad_Slug')).toBeNull();
    expect(appRouteForLink('/l/not-a-uuid')).toBeNull();
    expect(appRouteForLink('/p/joola/extra')).toBeNull();
    expect(appRouteForLink(`/d/${OFFER}?deal=nope`)).toBe(`/deals/offer/${OFFER}`);
  });
});
