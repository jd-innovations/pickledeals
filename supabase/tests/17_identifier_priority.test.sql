begin;
select plan(3);

-- Two variants of one product share a store barcode (as Thrive's Ignite swing weights do). The first
-- variant learned the barcode; the second is known by its store ID. A record for the second variant,
-- carrying the shared barcode, must match the second variant.
insert into public.products (id, brand_id, category_id, slug, name, status)
values ('17171717-0000-0000-0000-000000000001', (select id from public.brands where slug = 'engage'),
        (select id from public.categories where slug = 'paddles'), 'engage-test-shared-barcode', 'Test Shared Barcode', 'active');
insert into public.product_variants (id, product_id, label, is_default, sort) values
  ('17171717-0000-0000-0000-0000000000a1', '17171717-0000-0000-0000-000000000001', '109', true, 0),
  ('17171717-0000-0000-0000-0000000000a2', '17171717-0000-0000-0000-000000000001', '110', false, 1);
insert into public.product_identifiers (variant_id, kind, value, retailer_id, source) values
  ('17171717-0000-0000-0000-0000000000a1', 'gtin', '00000017170009', null, 'learned'),
  ('17171717-0000-0000-0000-0000000000a1', 'retailer_sku', 'product-1717-109', (select id from public.retailers where slug = 'pickleball-grip-doctor'), 'review'),
  ('17171717-0000-0000-0000-0000000000a2', 'retailer_sku', 'product-1717-110', (select id from public.retailers where slug = 'pickleball-grip-doctor'), 'review');

create temp table rec110 as select jsonb_build_object(
  'retailer_slug', 'pickleball-grip-doctor', 'external_ref', 'product-1717-110', 'retailer_sku', 'product-1717-110',
  'url', 'https://pickleballgripdoctor.com/products/test-shared-barcode?utm_source=pickledeals&utm_medium=referral',
  'title', 'Test Shared Barcode – 110', 'brand', 'EngagePickleball', 'gtin', '00000017170009',
  'price_cents', 21999, 'shipping_cents', 0, 'in_stock', true) as rec;

select is((public.ingest_offers('shopify-gripdoctor', jsonb_build_array((select rec from rec110)), false, true) ->> 'matched')::int, 1,
  'the record matches by itself');
select is((select variant_id from public.retailer_offers where external_ref = 'product-1717-110'),
  '17171717-0000-0000-0000-0000000000a2'::uuid, 'the store ID wins over the barcode another variant learned');
select is_empty($$select 1 from public.retailer_offers where variant_id = '17171717-0000-0000-0000-0000000000a1'$$,
  'the sibling variant gets no offer');

select * from finish();
rollback;
