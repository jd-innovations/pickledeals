import { describe, expect, it } from 'vitest';

import { checkApplication, normalizeStoreHost, shopifyFromHeaders, shopifyFromMeta } from '../../../supabase/functions/_shared/partners';

describe('normalizeStoreHost', () => {
  it('reduces whatever people paste to a bare host', () => {
    expect(normalizeStoreHost('https://www.CourtGear.com/collections/all?x=1')).toBe('www.courtgear.com');
    expect(normalizeStoreHost('courtgear.myshopify.com')).toBe('courtgear.myshopify.com');
    expect(normalizeStoreHost('  courtgear.com/ ')).toBe('courtgear.com');
  });

  it('refuses anything that could reach a private network', () => {
    for (const bad of ['localhost', 'http://127.0.0.1', '10.0.0.5', 'printer.local', 'https://user:pw@shop.com', 'shop.com:8080', 'ftp://shop.com', 'nodot', '']) {
      expect(normalizeStoreHost(bad)).toBeNull();
    }
  });
});

describe('checkApplication', () => {
  const ok = { company: 'CourtGear', name: 'Alex Rivera', email: 'Alex@CourtGear.com', store: 'courtgear.com', interests: ['store', 'sponsored', 'store'], message: '' };

  it('accepts a complete form and tidies it', () => {
    const r = checkApplication(ok);
    expect(r.ok && r.value).toMatchObject({ email: 'alex@courtgear.com', storeHost: 'courtgear.com', interests: ['store', 'sponsored'], message: null });
  });

  it('says which field needs fixing', () => {
    expect(checkApplication({ ...ok, email: 'nope' })).toMatchObject({ ok: false, field: 'email' });
    expect(checkApplication({ ...ok, store: 'localhost' })).toMatchObject({ ok: false, field: 'store' });
    expect(checkApplication({ ...ok, interests: ['free_money'] })).toMatchObject({ ok: false, field: 'interests' });
    expect(checkApplication({ ...ok, company: ' ' })).toMatchObject({ ok: false, field: 'company' });
    expect(checkApplication({ ...ok, message: 'x'.repeat(2001) })).toMatchObject({ ok: false, field: 'message' });
  });
});

describe('Shopify check', () => {
  it('trusts /meta.json with a myshopify domain', () => {
    expect(shopifyFromMeta({ name: 'CourtGear', myshopify_domain: 'courtgear.myshopify.com' })).toEqual({ shopify: true, myshopifyDomain: 'courtgear.myshopify.com', shopName: 'CourtGear' });
    expect(shopifyFromMeta({ name: 'Not Shopify' })).toEqual({ shopify: false });
    expect(shopifyFromMeta('<html>')).toEqual({ shopify: false });
  });

  it('falls back to Shopify response headers', () => {
    expect(shopifyFromHeaders(new Headers({ 'x-shopid': '123' })).shopify).toBe(true);
    expect(shopifyFromHeaders(new Headers({ 'powered-by': 'Shopify' })).shopify).toBe(true);
    expect(shopifyFromHeaders(new Headers({ server: 'nginx' })).shopify).toBe(false);
  });
});
