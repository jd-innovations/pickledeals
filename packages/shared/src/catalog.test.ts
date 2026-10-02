import { describe, expect, it } from 'vitest';

import { buildCatalogPayload, dollarsToCents, slugify } from './catalog';
import { parseCsv } from './csv';

describe('parseCsv', () => {
  it('handles quotes, escaped quotes, commas and CRLF', () =>
    expect(parseCsv('a,b\r\n"x, y","say ""hi"""\r\n')).toEqual([
      ['a', 'b'],
      ['x, y', 'say "hi"'],
    ]));
  it('keeps newlines inside quotes and skips blank lines', () =>
    expect(parseCsv('a\n"1\n2"\n\n')).toEqual([['a'], ['1\n2']]));
});

describe('dollarsToCents', () => {
  it('is exact', () => expect(dollarsToCents('279.95')).toBe(27995));
  it('pads one decimal', () => expect(dollarsToCents('19.9')).toBe(1990));
  it('accepts $ and thousands separators', () => expect(dollarsToCents('$1,299.00')).toBe(129900));
  it('rejects junk and 3 decimals', () => {
    expect(dollarsToCents('12.345')).toBeNull();
    expect(dollarsToCents('abc')).toBeNull();
  });
});

describe('slugify', () => {
  it('normalizes names', () => expect(slugify('JOOLA Perseus Pro IV — 16mm!')).toBe('joola-perseus-pro-iv-16mm'));
  it('strips accents', () => expect(slugify('Café Grip')).toBe('cafe-grip'));
});

const brands = 'slug,name,website_url\njoola,JOOLA,https://joola.com\n';
const categories = 'slug,name,parent_slug,sort,variant_axes\npaddles,Paddles,,1,thickness\n';

describe('buildCatalogPayload', () => {
  it('groups variant rows into products', () => {
    const products = [
      'product_slug,brand_slug,category_slug,name,msrp_usd,variant,default,aliases,attributes,upc',
      'joola-perseus-pro-iv,joola,paddles,Perseus Pro IV,279.95,14mm,,perseus 4|pro iv,thickness_mm=14,',
      'joola-perseus-pro-iv,,,,,16mm,yes,,thickness_mm=16,012345678905',
    ].join('\n');
    const { payload, issues } = buildCatalogPayload({ brands, categories, products });
    expect(issues).toEqual([]);
    expect(payload.products).toHaveLength(1);
    const p = payload.products[0]!;
    expect(p.msrp_cents).toBe(27995);
    expect(p.aliases).toEqual(['perseus 4', 'pro iv']);
    expect(p.variants.map((v) => [v.label, v.is_default, v.attributes.thickness_mm])).toEqual([
      ['14mm', undefined, '14'],
      ['16mm', true, '16'],
    ]);
    expect(p.variants[1]!.identifiers).toEqual([{ kind: 'upc', value: '012345678905' }]);
  });

  it('reports bad rows with line numbers and unknown references', () => {
    const products = [
      'product_slug,brand_slug,category_slug,name,msrp_usd',
      'Bad Slug,joola,paddles,X,10',
      'ok-one,nobody,paddles,Y,ten',
      'ok-two,nobody,paddles,Z,10',
    ].join('\n');
    const { issues } = buildCatalogPayload({ brands, categories, products });
    expect(issues).toEqual([
      { file: 'products', line: 2, message: 'invalid product_slug "Bad Slug"' },
      { file: 'products', line: 3, message: 'MSRP must be a dollar amount like 279.95' },
      { file: 'products', line: 0, message: 'ok-two: unknown brand "nobody"' },
    ]);
  });
});
