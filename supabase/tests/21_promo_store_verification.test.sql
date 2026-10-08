begin;
select plan(5);

insert into public.products (id, brand_id, category_id, slug, name, status) values
  ('21212121-aaaa-0000-0000-000000000001', (select id from public.brands where slug = 'engage'), (select id from public.categories where slug = 'paddles'), 'engage-test-verify-supplier', 'Verify Supplier', 'active'),
  ('21212121-aaaa-0000-0000-000000000002', (select id from public.brands where slug = 'pickleball-grip-doctor'), (select id from public.categories where slug = 'grips'), 'pgd-test-verify-own', 'Verify Own', 'active');
insert into public.product_variants (id, product_id, label, is_default) values
  ('21212121-bbbb-0000-0000-000000000001', '21212121-aaaa-0000-0000-000000000001', 'Standard', true),
  ('21212121-bbbb-0000-0000-000000000002', '21212121-aaaa-0000-0000-000000000002', 'Standard', true);
insert into public.retailer_offers (variant_id, retailer_id, source_id, url, price_cents, price_display, ships_from, content_ref)
select v, r.id, s.id, 'https://pickleballgripdoctor.com/products/' || ref, 10000, 'show', sf, 'shopify-product-' || ref
  from public.retailers r join public.ingestion_sources s on s.slug = 'shopify-gripdoctor',
       (values ('21212121-bbbb-0000-0000-000000000001'::uuid, '9901', 'Engage'), ('21212121-bbbb-0000-0000-000000000002'::uuid, '9902', null)) x(v, ref, sf)
 where r.slug = 'pickleball-grip-doctor';
insert into public.promo_codes (id, retailer_id, code, title, discount_type, discount_value, verified_at, supplier_items_only) values
  ('21212121-cccc-0000-0000-000000000001', (select id from public.retailers where slug = 'pickleball-grip-doctor'), 'TESTVERIFY5', 'Test', 'percent', 5, now() - interval '20 days', true),
  ('21212121-cccc-0000-0000-000000000002', (select id from public.retailers where slug = 'pickleball-grip-doctor'), 'TESTENDED', 'Ended', 'percent', 5, now() - interval '20 days', false);
update public.promo_codes set starts_at = now() - interval '30 days', ends_at = now() - interval '1 day' where id = '21212121-cccc-0000-0000-000000000002';

select is((select content_ref from public.promo_verification_targets('shopify-gripdoctor') where code = 'TESTVERIFY5'), 'shopify-product-9901',
  'a supplier-items code is checked on a supplier item');
select is_empty($$select 1 from public.promo_verification_targets('shopify-gripdoctor') where code = 'TESTENDED'$$, 'ended codes aren''t checked');
select is(public.mark_promos_verified(array['21212121-cccc-0000-0000-000000000001'::uuid]), 1, 'a verified code is marked');
select ok((select verified_at > now() - interval '1 minute' from public.promo_codes where id = '21212121-cccc-0000-0000-000000000001'), 'with the current time');

set local role authenticated;
select throws_ok($$select public.mark_promos_verified(array['21212121-cccc-0000-0000-000000000001'::uuid])$$, '42501', null, 'only the service can mark codes verified');
reset role;

select * from finish();
rollback;
