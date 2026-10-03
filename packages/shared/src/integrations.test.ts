import { describe, expect, it } from 'vitest';

import {
  affiliateUrl,
  amazonRecords,
  batches,
  detectDelimiter,
  feedRecords,
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
