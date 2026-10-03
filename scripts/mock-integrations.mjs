// Local stand-ins for the Amazon Creators API and an AvantLink-style product datafeed (Phase 12).
// The ingest function reaches it from Docker at http://host.docker.internal:54399 (see
// supabase/functions/.env.example). Prices drift on every request so freshness is visible.
//
//   node scripts/mock-integrations.mjs            # port 54399
//   GET  /feeds/selkirk.tsv                       # AvantLink-like TSV (Buy Link is a click URL)
//   POST /auth/o2/token                           # client_credentials → bearer token
//   POST /catalog/v1/getItems                     # GetItems for DEV ASINs (one is ItemNotAccessible)
import { createServer } from 'node:http';

const PORT = Number(process.env.MOCK_PORT ?? 54399);
let tick = 0;
const drift = (cents) => cents - (tick % 3) * 100;

const ITEMS = {
  DEV0000001: { title: 'JOOLA Perseus Pro IV 16mm', upc: '840011111116', cents: 21999 },
  DEV0000002: { title: 'JOOLA Perseus CFS 16mm', upc: '840011111123', cents: 15499 },
  DEV0000003: { title: 'CRBN 3X Power Series 16mm', cents: 22499, map: true },
};

const FEED = [
  ['SKU', 'Product Name', 'Brand Name', 'UPC', 'Manufacturer Id', 'Retail Price', 'Sale Price', 'Buy Link', 'In Stock'],
  ['SK-VPA-INV-16', 'Vanguard Power Air Invikta 16mm', 'Selkirk', '850022222216', 'VPA-INV-16', '249.99', '229.99', 'https://www.selkirk.com/products/vanguard-power-air-invikta'],
  ['SK-LUXX-EPIC', 'LUXX Control Air Epic', 'Selkirk', '', '', '299.99', '0.00', 'https://www.selkirk.com/products/luxx-control-air-epic'],
  ['SK-CAP-TRK', 'Selkirk Performance Trucker Hat', 'Selkirk', '', '', '28.00', '0.00', 'https://www.selkirk.com/products/performance-trucker-hat'],
  ['SK-CORE-BAG', 'Core Line Backpack', 'Selkirk', '', '', '89.99', '79.99', 'https://www.selkirk.com/products/core-line-backpack'],
];

function feed() {
  return FEED.map((row, i) => {
    if (i === 0) return row.join('\t');
    const [sku, name, brand, upc, mpn, price, sale, url] = row;
    const click = `https://www.avantlink.com/click.php?tt=cl&mi=10060&pw=000000&url=${encodeURIComponent(url)}`;
    const salePrice = sale === '0.00' ? sale : (Number(sale) - (tick % 2)).toFixed(2);
    return [sku, name, brand, upc, mpn, price, salePrice, click, 'yes'].join('\t');
  }).join('\n');
}

function getItems(itemIds) {
  const items = [];
  const errors = [];
  for (const asin of itemIds) {
    const item = ITEMS[asin];
    if (!item) {
      errors.push({ code: 'ItemNotAccessible', message: `The ItemId ${asin} is not accessible through the Creators API.` });
      continue;
    }
    items.push({
      asin,
      detailPageURL: `https://www.amazon.com/dp/${asin}?tag=mock-20`,
      itemInfo: { title: { displayValues: [item.title] }, ...(item.upc ? { externalIds: { upCs: { displayValues: [item.upc] } } } : {}) },
      offersV2: {
        listings: [
          {
            availability: { type: 'IN_STOCK' },
            condition: { value: 'New' },
            price: { money: { amount: drift(item.cents) / 100, currency: 'USD', displayAmount: `$${(drift(item.cents) / 100).toFixed(2)}` } },
            merchantInfo: { id: 'ATVPDKIKX0DER', name: 'Amazon.com' },
            isBuyBoxWinner: true,
            violatesMAP: !!item.map,
          },
        ],
      },
    });
  }
  return { itemResults: { items }, ...(errors.length ? { errors } : {}) };
}

const json = (res, status, body) => {
  res.writeHead(status, { 'content-type': 'application/json' });
  res.end(JSON.stringify(body));
};

createServer((req, res) => {
  let body = '';
  req.on('data', (c) => (body += c));
  req.on('end', () => {
    tick++;
    console.log(new Date().toISOString(), req.method, req.url);
    if (req.method === 'GET' && req.url?.startsWith('/feeds/selkirk.tsv')) {
      res.writeHead(200, { 'content-type': 'text/tab-separated-values' });
      return res.end(feed());
    }
    if (req.method === 'POST' && req.url === '/auth/o2/token') {
      const b = JSON.parse(body || '{}');
      if (b.grant_type !== 'client_credentials' || !b.client_id) return json(res, 400, { error: 'invalid_request', error_description: 'bad grant' });
      return json(res, 200, { access_token: 'mock-token', token_type: 'bearer', expires_in: 3600 });
    }
    if (req.method === 'POST' && req.url === '/catalog/v1/getItems') {
      if (req.headers.authorization !== 'Bearer mock-token') return json(res, 401, { errors: [{ code: 'Unauthorized', message: 'bad token' }] });
      const b = JSON.parse(body || '{}');
      if (!Array.isArray(b.itemIds) || b.itemIds.length > 10 || !b.partnerTag) return json(res, 400, { errors: [{ code: 'InvalidParameterValue', message: 'itemIds' }] });
      return json(res, 200, getItems(b.itemIds));
    }
    json(res, 404, { error: 'not found' });
  });
}).listen(PORT, () => console.log(`mock integrations on http://localhost:${PORT}`));
