import { describe, expect, it } from 'vitest';

import { buildOfferRecords } from './offers';

const header = 'retailer_slug,url,price_usd,shipping_usd,in_stock,available_sizes,product_slug,variant_label,title,upc';

describe('buildOfferRecords', () => {
  it('parses money exactly and sizes', () => {
    const { records, issues } = buildOfferRecords(
      `${header}\ncourtside,https://courtside.example/p/1,189.99,6,yes,9|9.5|10,skechers-viper-court-pro,,,\n`,
    );
    expect(issues).toEqual([]);
    expect(records[0]).toMatchObject({ price_cents: 18999, shipping_cents: 600, in_stock: true, available_sizes: ['9', '9.5', '10'] });
  });

  it('allows a missing price (check-price retailers) and identifier-only rows', () => {
    const { records } = buildOfferRecords(`${header}\namazon,https://www.amazon.com/dp/X,,,,,,,,012345678905\n`);
    expect(records[0]).toMatchObject({ retailer_slug: 'amazon', upc: '012345678905' });
    expect(records[0]!.price_cents).toBeUndefined();
  });

  it('reports bad rows by line', () => {
    const { issues } = buildOfferRecords(
      `${header}\nBad Slug,https://x.example,1,,,,a,,,\nshop,http://insecure.example,1,,,,a,,,\nshop,https://x.example,1.999,,,,a,,,\nshop,https://x.example,10,,,,,,,\n`,
    );
    expect(issues.map((i) => i.line)).toEqual([2, 3, 4, 5]);
  });
});
