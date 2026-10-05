import { describe, expect, it } from 'vitest';

import {
  affiliateUrl,
  amazonRecords,
  batches,
  detectDelimiter,
  discountLinkUrl,
  feedRecords,
  fromPublicJson,
  fromStorefront,
  shopifyRecords,
  toCents,
  unwrapTrackingUrl,
  type FeedColumns,
} from '../../../supabase/functions/_shared/integrations';

const AVANTLINK: FeedColumns = {
  external_ref: ['SKU', 'Product SKU'],
  title: ['Product Name'],
  brand: ['Brand Name'],
  upc: ['UPC'],
  mpn: ['Manufacturer Id'],
  price: ['Retail Price'],
  sale_price: ['Sale Price'],
  url: ['Product URL'],
  buy_link: ['Buy Link'],
  in_stock: ['In Stock'],
};

describe('toCents', () => {
  it('parses dollar strings and numbers', () => {
    expect(toCents('$1,234.50')).toBe(123450);
    expect(toCents('179.99')).toBe(17999);
    expect(toCents(229.99)).toBe(22999);
  });
  it('rejects zero, junk and missing values', () => {
    expect(toCents('0.00')).toBeNull();
    expect(toCents('call')).toBeNull();
    expect(toCents(null)).toBeNull();
  });
});

describe('feedRecords', () => {
  const tsv = [
    'SKU\tProduct Name\tBrand Name\tUPC\tManufacturer Id\tRetail Price\tSale Price\tBuy Link\tIn Stock',
    'SK-VAN\tVanguard Power Air Invikta\tSelkirk\t 012345678912 \tVPA-INV-16\t$249.99\t$219.99\thttps://www.avantlink.com/click.php?tt=cl&mi=1&pw=2&url=https%3A%2F%2Fwww.selkirk.com%2Fp%2Fvanguard\tyes',
    'SK-HAT\tSelkirk Hat\tSelkirk\t\t\t25.00\t0.00\thttps://www.avantlink.com/click.php?url=https%3A%2F%2Fwww.selkirk.com%2Fp%2Fhat\tOut of Stock',
    '\tNo SKU\tSelkirk\t\t\t10\t\thttps://www.selkirk.com/x\tyes',
    'SK-FREE\tFree thing\tSelkirk\t\t\t0\t\thttps://www.selkirk.com/free\tyes',
    'SK-VAN\tDuplicate\tSelkirk\t\t\t1\t\thttps://www.selkirk.com/dup\tyes',
  ].join('\n');

  it('detects tab-delimited feeds', () => expect(detectDelimiter(tsv)).toBe('\t'));

  it('maps rows, prefers a lower sale price and unwraps tracking links', () => {
    const { records, skipped, missingColumns } = feedRecords(tsv, AVANTLINK, 'selkirk-com');
    expect(missingColumns).toEqual([]);
    expect(records).toHaveLength(2);
    expect(records[0]).toEqual({
      retailer_slug: 'selkirk-com',
      url: 'https://www.selkirk.com/p/vanguard',
      external_ref: 'SK-VAN',
      retailer_sku: 'SK-VAN',
      price_cents: 21999,
      in_stock: true,
      title: 'Vanguard Power Air Invikta',
      brand: 'Selkirk',
      upc: '012345678912',
      mpn: 'VPA-INV-16',
    });
    expect(records[1]).toMatchObject({ external_ref: 'SK-HAT', price_cents: 2500, in_stock: false });
    expect(skipped.map((s) => s.reason)).toEqual(['no SKU', 'no price', 'duplicate SKU SK-VAN']);
  });

  it('reports missing required columns instead of guessing', () => {
    expect(feedRecords('Name,Cost\nA,1', AVANTLINK, 'selkirk-com').missingColumns).toEqual(['external_ref', 'price', 'url']);
  });

  it('handles quoted CSV with commas in fields', () => {
    const csv = 'SKU,Product Name,Retail Price,Product URL\n"A-1","Paddle, 16mm","$99.00",https://www.selkirk.com/a';
    expect(feedRecords(csv, AVANTLINK, 'selkirk-com').records[0]).toMatchObject({ title: 'Paddle, 16mm', price_cents: 9900 });
  });
});

describe('unwrapTrackingUrl', () => {
  it('returns the inner product URL of click links', () => {
    expect(unwrapTrackingUrl('https://www.avantlink.com/click.php?tt=cl&url=https%3A%2F%2Fwww.selkirk.com%2Fp%2Fa')).toBe('https://www.selkirk.com/p/a');
    expect(unwrapTrackingUrl('https://joola.sjv.io/c/1/2/3?u=https%3A%2F%2Fjoola.com%2Fp')).toBe('https://joola.com/p');
  });
  it('leaves plain URLs alone', () => expect(unwrapTrackingUrl('https://www.selkirk.com/p/a?color=red')).toBe('https://www.selkirk.com/p/a?color=red'));
});

describe('amazonRecords', () => {
  const response = {
    itemResults: {
      items: [
        {
          asin: 'B0TEST0001',
          itemInfo: { title: { displayValue: 'x', displayValues: ['JOOLA Perseus'] }, externalIds: { upCs: { displayValues: ['012345678905'] }, eaNs: { displayValues: ['0012345678905'] } } },
          offersV2: {
            listings: [
              { condition: { value: 'Used' }, price: { money: { amount: 120, currency: 'USD' } }, isBuyBoxWinner: true },
              { condition: { value: 'New' }, price: { money: { amount: 189.99, currency: 'USD' } }, availability: { type: 'IN_STOCK' }, isBuyBoxWinner: true },
            ],
          },
        },
        { asin: 'B0TEST0002', offersV2: { listings: [{ condition: { value: 'New' }, price: { money: { amount: 99, currency: 'USD' } }, violatesMAP: true }] } },
        { asin: 'B0TEST0003', offersV2: { listings: [] } },
        { asin: 'not-an-asin' },
      ],
    },
  };

  it('uses the new buy-box listing and learns UPC/EAN', () => {
    const [a] = amazonRecords(response);
    expect(a).toEqual({
      retailer_slug: 'amazon',
      url: 'https://www.amazon.com/dp/B0TEST0001',
      external_ref: 'B0TEST0001',
      asin: 'B0TEST0001',
      price_cents: 18999,
      in_stock: true,
      title: 'JOOLA Perseus',
      upc: '012345678905',
      ean: '0012345678905',
    });
  });

  it('never shows MAP-restricted or missing prices', () => {
    const [, map, none] = amazonRecords(response);
    expect(map).toMatchObject({ asin: 'B0TEST0002', price_cents: null });
    expect(none).toMatchObject({ asin: 'B0TEST0003', price_cents: null, in_stock: false });
    expect(amazonRecords(response)).toHaveLength(3);
  });

  it('batches ASINs ten at a time', () => expect(batches(Array.from({ length: 23 }, (_, i) => i)).map((b) => b.length)).toEqual([10, 10, 3]));
});

describe('affiliateUrl', () => {
  const product = new URL('https://www.selkirk.com/p/a?color=red');
  const hosts = ['avantlink.com', 'amazon.com'];

  it('adds query tags (Amazon)', () => {
    expect(affiliateUrl(new URL('https://www.amazon.com/dp/B0TEST0001'), { tag_template: 'tag=pickledeals-20', link_template: null, is_active: true }, hosts).toString()).toBe(
      'https://www.amazon.com/dp/B0TEST0001?tag=pickledeals-20',
    );
  });

  it('wraps the product URL in a network click URL', () => {
    const out = affiliateUrl(product, { tag_template: null, link_template: 'https://www.avantlink.com/click.php?tt=cl&mi=10060&pw=1&url={url}', is_active: true }, hosts);
    expect(out.hostname).toBe('www.avantlink.com');
    expect(out.searchParams.get('url')).toBe('https://www.selkirk.com/p/a?color=red');
  });

  it('refuses wrappers on hosts outside the allowlist', () => {
    const out = affiliateUrl(product, { tag_template: null, link_template: 'https://evil.example/r?to={url}', is_active: true }, hosts);
    expect(out.toString()).toBe(product.toString());
  });

  it('ignores inactive programs', () => {
    expect(affiliateUrl(product, { tag_template: 'tag=x', link_template: null, is_active: false }, hosts).toString()).toBe(product.toString());
  });
});

describe('shopifyRecords', () => {
  const cfg = {
    retailerSlug: 'pickleball-grip-doctor',
    storeUrl: 'https://pickleballgripdoctor.com/',
    utmSource: 'pickledeals',
    shipping: { flat_cents: 695, free_over_cents: 5000 },
  };
  // The Engage X2 as the store's public JSON returns it (Oct 2026): a Collective supplier product.
  const x2 = {
    id: 8001,
    handle: 'engage-x2-elongated-pickleball-paddle',
    title: 'Engage X2 Elongated Pickleball Paddle',
    vendor: 'EngagePickleball',
    product_type: 'Paddle',
    tags: 'EngagePickleball, Shopify Collective',
    options: [{ name: 'Shape' }],
    variants: [{ id: 9001, title: 'Elongated', price: '199.99', compare_at_price: '259.99', sku: 'X2E-AQU-001', barcode: '810957038755', option1: 'Elongated' }],
  };

  it('maps a Collective supplier product', () => {
    const { records, skipped } = shopifyRecords(fromPublicJson([x2]), cfg);
    expect(skipped).toEqual([]);
    expect(records).toEqual([
      {
        retailer_slug: 'pickleball-grip-doctor',
        url: 'https://pickleballgripdoctor.com/products/engage-x2-elongated-pickleball-paddle?utm_source=pickledeals&utm_medium=referral',
        external_ref: 'variant-9001',
        price_cents: 19999,
        shipping_cents: 0,
        title: 'Engage X2 Elongated Pickleball Paddle',
        retailer_sku: 'X2E-AQU-001',
        brand: 'EngagePickleball',
        upc: '810957038755',
        ships_from: 'EngagePickleball',
      },
    ]);
  });

  it('never uses compare-at as the price', () => {
    const [r] = shopifyRecords(fromPublicJson([x2]), cfg).records;
    expect(r!.price_cents).toBe(19999);
    expect(JSON.stringify(r)).not.toContain('259');
  });

  it("doesn't mark the store's own products as shipped by someone else", () => {
    const own = { ...x2, id: 8002, vendor: 'Pickleball Grip Doctor', tags: ['Grips'], variants: [{ ...x2.variants[0]!, id: 9002, price: '24.99', barcode: '' }] };
    const [r] = shopifyRecords(fromPublicJson([own]), cfg).records;
    expect(r!.ships_from).toBeUndefined();
    expect(r!.shipping_cents).toBe(695);
    expect(r!.upc).toBeUndefined();
  });

  it('keeps one record per variant, linked to that variant, and skips sold-out ones', () => {
    const paddle = {
      ...x2,
      options: [{ name: 'Thickness' }],
      variants: [
        { id: 1, title: '14mm', price: '189.99', barcode: '00012345678905', option1: '14mm', available: true },
        { id: 2, title: '16mm', price: '199.99', barcode: '4006381333931', option1: '16mm', available: false },
      ],
    };
    const { records, skipped } = shopifyRecords(fromPublicJson([paddle]), cfg);
    expect(records.map((r) => [r.external_ref, r.title, r.in_stock, r.gtin ?? r.ean])).toEqual([
      ['variant-1', 'Engage X2 Elongated Pickleball Paddle – 14mm', true, '00012345678905'],
    ]);
    expect(records[0]!.url).toContain('variant=1');
    expect(skipped).toEqual([{ ref: 'variant-2', reason: 'out of stock' }]);
  });

  it('collapses sizes into one record with available sizes', () => {
    const shoe = fromStorefront([
      {
        id: 'gid://shopify/Product/77',
        handle: 'court-shoe',
        title: 'Court Shoe',
        vendor: 'ASICS',
        productType: 'Shoes',
        tags: [],
        variants: {
          nodes: [
            { id: 'gid://shopify/ProductVariant/1', title: 'White / 9', price: { amount: '120.0', currencyCode: 'USD' }, availableForSale: true, selectedOptions: [{ name: 'Color', value: 'White' }, { name: 'Shoe Size', value: '9' }] },
            { id: 'gid://shopify/ProductVariant/2', title: 'White / 10', price: { amount: '110.0', currencyCode: 'USD' }, availableForSale: false, selectedOptions: [{ name: 'Color', value: 'White' }, { name: 'Shoe Size', value: '10' }] },
            { id: 'gid://shopify/ProductVariant/3', title: 'White / 11', price: { amount: '120.0', currencyCode: 'USD' }, availableForSale: true, selectedOptions: [{ name: 'Color', value: 'White' }, { name: 'Shoe Size', value: '11' }] },
          ],
        },
      },
    ]);
    const { records } = shopifyRecords(shoe, cfg);
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({ external_ref: 'product-77', price_cents: 12000, in_stock: true, available_sizes: ['9', '11'], title: 'Court Shoe' });
    expect(records[0]!.upc).toBeUndefined();
  });

  it('skips gift cards, digital items and unpriced or non-USD variants', () => {
    const products = fromStorefront([
      { id: '1', handle: 'gift-card', title: 'Gift card', productType: 'Gift Card', variants: { nodes: [{ id: '1', price: { amount: '25' } }] } },
      { id: '2', handle: 'ebook', title: 'Guide', variants: { nodes: [{ id: '2', requiresShipping: false, price: { amount: '9' } }] } },
      { id: '3', handle: 'cad', title: 'Paddle', variants: { nodes: [{ id: '3', price: { amount: '99', currencyCode: 'CAD' } }] } },
    ]);
    const { records, skipped } = shopifyRecords(products, cfg);
    expect(records).toEqual([]);
    expect(skipped.map((s) => s.reason)).toEqual(['gift card', 'nothing to ship', 'no price']);
  });
});

describe('shopifyRecords, cosmetic options', () => {
  it('lists one offer per store for colour variants, keeping thickness separate', () => {
    const paddle = fromPublicJson([
      {
        id: 5,
        handle: 'profoam',
        title: 'ProFoam',
        vendor: 'EngagePickleball',
        tags: ['Shopify Collective'],
        options: [{ name: 'Color' }, { name: 'Thickness' }],
        variants: [
          { id: 1, price: '219.99', option1: 'Fusion-Sunset', option2: '14 mm', available: false, barcode: '810957038700' },
          { id: 2, price: '209.99', option1: 'Arctic-Gold', option2: '14 mm', available: true },
          { id: 3, price: '219.99', option1: 'Fusion-Sunset', option2: '16 mm', available: true },
        ],
      },
    ]);
    const { records } = shopifyRecords(paddle, { retailerSlug: 'r', storeUrl: 'https://example.com' });
    expect(records.map((r) => [r.external_ref, r.title, r.price_cents, r.in_stock, r.available_sizes, r.upc])).toEqual([
      ['product-5-14-mm', 'ProFoam – 14 mm', 20999, true, undefined, '810957038700'],
      ['product-5-16-mm', 'ProFoam – 16 mm', 21999, true, undefined, undefined],
    ]);
  });

  it('collapses a colour-only product into a single offer', () => {
    const grip = fromPublicJson([
      { id: 6, handle: 'trigger', title: 'PGD Trigger', vendor: 'Pickleball Grip Doctor', options: [{ name: 'Color' }], variants: ['Pink', 'Black'].map((c, i) => ({ id: i + 1, price: '24.99', option1: c, available: true })) },
    ]);
    const { records } = shopifyRecords(grip, { retailerSlug: 'r', storeUrl: 'https://example.com' });
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({ external_ref: 'product-6', title: 'PGD Trigger', url: 'https://example.com/products/trigger' });
  });
});

describe('discountLinkUrl', () => {
  const product = new URL('https://pickleballgripdoctor.com/products/engage-x2?utm_source=pickledeals&utm_medium=referral');
  const template = '/discount/{code}?redirect={path}';

  it('applies the code at checkout and lands on the product page', () => {
    const url = discountLinkUrl(product, 'DINK15', template);
    expect(url.origin).toBe('https://pickleballgripdoctor.com');
    expect(url.pathname).toBe('/discount/DINK15');
    expect(url.searchParams.get('redirect')).toBe('/products/engage-x2?utm_source=pickledeals&utm_medium=referral');
  });

  it('leaves the link alone without a template or with an odd code', () => {
    expect(discountLinkUrl(product, 'DINK15', null)).toBe(product);
    expect(discountLinkUrl(product, 'bad code/../x', template)).toBe(product);
  });

  it('never leaves the product host', () => {
    expect(discountLinkUrl(product, 'X1', '//evil.example/{code}?r={path}')).toBe(product);
  });
});

describe('shopifyRecords, pre-orders', () => {
  it('treats pre-order / backorder variants as out of stock', () => {
    const products = fromStorefront([
      {
        id: 'gid://shopify/Product/1',
        handle: 'engage-x2',
        title: 'Engage X2 Elongated Pickleball Paddle',
        vendor: 'EngagePickleball',
        tags: ['Shopify Collective'],
        variants: { nodes: [{ id: 'gid://shopify/ProductVariant/9', price: { amount: '199.99', currencyCode: 'USD' }, availableForSale: true, currentlyNotInStock: true }] },
      },
    ]);
    const { records, skipped } = shopifyRecords(products, { retailerSlug: 'r', storeUrl: 'https://example.com' });
    expect(records).toEqual([]);
    expect(skipped).toEqual([{ ref: 'variant-9', reason: 'out of stock' }]);
  });
});
