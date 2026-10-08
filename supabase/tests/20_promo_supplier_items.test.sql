begin;
select plan(3);

-- Two active products with Grip Doctor offers: one shipped by a supplier (Collective), one by the store.
insert into public.products (id, brand_id, category_id, slug, name, status) values
  ('20202020-aaaa-0000-0000-000000000001', (select id from public.brands where slug = 'engage'), (select id from public.categories where slug = 'paddles'), 'engage-test-supplier-item', 'Test Supplier Item', 'active'),
  ('20202020-aaaa-0000-0000-000000000002', (select id from public.brands where slug = 'pickleball-grip-doctor'), (select id from public.categories where slug = 'grips'), 'pgd-test-own-item', 'Test Own Item', 'active');
insert into public.product_variants (id, product_id, label, is_default) values
  ('20202020-bbbb-0000-0000-000000000001', '20202020-aaaa-0000-0000-000000000001', 'Standard', true),
  ('20202020-bbbb-0000-0000-000000000002', '20202020-aaaa-0000-0000-000000000002', 'Standard', true);
insert into public.retailer_offers (variant_id, retailer_id, url, price_cents, shipping_cents, price_display, ships_from)
select v, (select id from public.retailers where slug = 'pickleball-grip-doctor'), 'https://pickleballgripdoctor.com/products/' || s, 10000, 0, 'show', sf
  from (values ('20202020-bbbb-0000-0000-000000000001'::uuid, 'test-supplier', 'Engage'),
               ('20202020-bbbb-0000-0000-000000000002'::uuid, 'test-own', null)) x(v, s, sf);

insert into public.promo_codes (retailer_id, code, title, discount_type, discount_value, verified_at, is_exclusive, supplier_items_only)
values ((select id from public.retailers where slug = 'pickleball-grip-doctor'), 'TESTSUPPLIER5', '5% off partner brands', 'percent', 5, now(), true, true);

select is((select promo_code from public.variant_offer_ranking where variant_id = '20202020-bbbb-0000-0000-000000000001'), 'TESTSUPPLIER5',
  'a supplier-items code applies to an offer shipped by a supplier');
select is((select delivered_cents from public.variant_offer_ranking where variant_id = '20202020-bbbb-0000-0000-000000000001'), 9500,
  'and takes 5% off');
select is((select promo_code from public.variant_offer_ranking where variant_id = '20202020-bbbb-0000-0000-000000000002'), null,
  'but not to the store''s own items');

select * from finish();
rollback;
