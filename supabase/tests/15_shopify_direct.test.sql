begin;
select plan(26);

create function pg_temp.act_as(uid uuid, app_role text default null) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated', 'app_role', app_role)::text, true);
  set local role authenticated;
$$;
create function pg_temp.as_anon() returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
  set local role anon;
$$;

insert into auth.users (id, email) values
  ('20202020-0000-0000-0000-000000000001', 'editor@example.test'),
  ('20202020-0000-0000-0000-000000000002', 'shopper@example.test');

-- Vendor names → brands ------------------------------------------------------------------------------

select is(public.brand_for_vendor('EngagePickleball'), (select id from public.brands where slug = 'engage'), '"EngagePickleball" maps to Engage');
select is(public.brand_for_vendor('Pickleball Grip Doctor'), (select id from public.brands where slug = 'pickleball-grip-doctor'), 'a vendor named like the brand maps to it');
select is(public.brand_for_vendor('Unknown Paddle Co'), null, 'unknown vendors map to nothing');

-- The pilot store ------------------------------------------------------------------------------------

select is((select ownership_note from public.retailers where slug = 'pickleball-grip-doctor'), 'PickleDeals’ owner also owns this store; it’s listed first when prices tie',
  'Pickleball Grip Doctor carries the ownership disclosure');
select ok(not (select is_active from public.ingestion_sources where slug = 'shopify-gripdoctor'), 'its Shopify source ships turned off');

-- A Collective supplier item (the Engage X2, as the adapter emits it) isn't in the catalog: review.
create temp table x2 as select jsonb_build_object(
  'retailer_slug', 'pickleball-grip-doctor', 'external_ref', 'variant-9001', 'retailer_sku', 'X2E-AQU-001',
  'url', 'https://pickleballgripdoctor.com/products/engage-x2-elongated-pickleball-paddle?utm_source=pickledeals&utm_medium=referral',
  'title', 'Engage X2 Elongated Pickleball Paddle', 'brand', 'EngagePickleball', 'upc', '810957038755',
  'price_cents', 19999, 'shipping_cents', 0, 'in_stock', true, 'ships_from', 'EngagePickleball') as rec;

select is((public.ingest_offers('shopify-gripdoctor', jsonb_build_array((select rec from x2)), false, true) ->> 'unmatched')::int, 1,
  'a new store item goes to the review queue');
create temp table raw as
  select id from public.raw_offer_records where external_ref = 'variant-9001' and match_status = 'unmatched';
grant select on raw to authenticated;

-- Creating the product from review ------------------------------------------------------------------

select pg_temp.act_as('20202020-0000-0000-0000-000000000002');
select throws_ok($$select public.staff_create_product_from_raw((select id from raw), (select id from public.brands where slug = 'engage'),
                    (select id from public.categories where slug = 'paddles'), 'X2 Elongated')$$,
  '42501', null, 'shoppers can’t create products');
reset role;

select pg_temp.act_as('20202020-0000-0000-0000-000000000001', 'editor');
create temp table made as
  select public.staff_create_product_from_raw((select id from raw), (select id from public.brands where slug = 'engage'),
                                              (select id from public.categories where slug = 'paddles'), 'X2 Elongated', null, 25999) as r;
reset role;

select is((select r ->> 'slug' from made), 'engage-x2-elongated', 'the slug comes from brand and name');
select is((select status::text from public.products where slug = 'engage-x2-elongated'), 'draft', 'the product starts as a draft');
select is((select label from public.product_variants where id = (select (r ->> 'variant_id')::uuid from made)), 'Standard', 'with a default variant');
select is((select match_status::text from public.raw_offer_records where id = (select id from raw)), 'matched', 'the record is matched to it');
select is((select source from public.product_identifiers where kind = 'upc' and value = '810957038755'), 'review',
  'the barcode is remembered for the next import');
select is((select ships_from from public.retailer_offers where external_ref = 'variant-9001'), 'Engage',
  'the offer ships from the supplier, named as its catalog brand');
select is_empty($$select 1 from public.variant_offer_ranking where product_id = (select (r ->> 'product_id')::uuid from made)$$,
  'and stays hidden while the product is a draft');

update public.products set status = 'active' where slug = 'engage-x2-elongated';
select results_eq($$select ships_from, ownership_note from public.variant_offer_ranking where product_id = (select (r ->> 'product_id')::uuid from made)$$,
  $$values ('Engage'::text, 'PickleDeals’ owner also owns this store; it’s listed first when prices tie'::text)$$,
  'once published, the app gets "Ships from Engage" and the ownership note');
select is((public.ingest_offers('shopify-gripdoctor', jsonb_build_array((select rec from x2)), false, true) ->> 'matched')::int, 1,
  'the next import matches by itself');

-- A vendor name that doesn't look like the brand is remembered when staff choose the brand.
select public.ingest_offers('shopify-gripdoctor', jsonb_build_array(jsonb_build_object(
  'retailer_slug', 'pickleball-grip-doctor', 'external_ref', 'variant-9100', 'url', 'https://pickleballgripdoctor.com/products/towel',
  'title', 'Pro Towel', 'brand', 'PGD Supply', 'price_cents', 1299)), false, true);
select pg_temp.act_as('20202020-0000-0000-0000-000000000001', 'editor');
select public.staff_create_product_from_raw(
  (select id from public.raw_offer_records where external_ref = 'variant-9100'), (select id from public.brands where slug = 'pickleball-grip-doctor'),
  (select id from public.categories where slug = 'paddles'), 'Pro Towel');
reset role;
select is(public.brand_for_vendor('PGD supply'), (select id from public.brands where slug = 'pickleball-grip-doctor'),
  'the store’s vendor name is remembered for that brand');

-- Ranking ties ----------------------------------------------------------------------------------------

-- Baseline Sports: same item price and shipping, checked long ago. Grip Doctor's feed was just refreshed.
select public.ingest_offers('csv', jsonb_build_array(jsonb_build_object(
  'retailer_slug', 'baseline-sports', 'url', 'https://baseline-sports.example/x2',
  'variant_id', (select r ->> 'variant_id' from made), 'price_cents', 19999)), false);
update public.retailer_offers set last_checked_at = now() - interval '3 days'
 where retailer_id = (select id from public.retailers where slug = 'baseline-sports') and variant_id = (select (r ->> 'variant_id')::uuid from made);
create function pg_temp.first() returns text language sql as $$
  select retailer_slug from public.variant_offer_ranking where variant_id = (select (r ->> 'variant_id')::uuid from made) and rank = 1;
$$;

select is(pg_temp.first(), 'pickleball-grip-doctor', 'an exact tie goes to Grip Doctor (a disclosed preference)');
update public.retailer_offers set in_stock = false where external_ref = 'variant-9001';
select is(pg_temp.first(), 'baseline-sports', 'but never when it’s out of stock');
update public.retailer_offers set in_stock = true where external_ref = 'variant-9001';

update public.retailers set wins_price_ties = false where slug = 'pickleball-grip-doctor';
select is(pg_temp.first(), 'baseline-sports', 'without the preference, a fresher feed doesn’t win ties (retailer name decides)');
update public.retailer_offers set price_cents = 19499, shipping_cents = 500
 where retailer_id = (select id from public.retailers where slug = 'baseline-sports') and variant_id = (select (r ->> 'variant_id')::uuid from made);
select is(pg_temp.first(), 'pickleball-grip-doctor', 'equal delivered prices: lower shipping wins');
update public.retailers set wins_price_ties = true where slug = 'pickleball-grip-doctor';
update public.retailer_offers set price_cents = 18999, shipping_cents = 0
 where retailer_id = (select id from public.retailers where slug = 'baseline-sports') and variant_id = (select (r ->> 'variant_id')::uuid from made);
select is(pg_temp.first(), 'baseline-sports', 'a cheaper offer always beats the preference');

select throws_ok($$update public.retailers set wins_price_ties = true where slug = 'baseline-sports'$$, '23514', null,
  'a tie preference needs an ownership disclosure');

-- A Grip Doctor code: ranked on the price after the code, applied at checkout by the discount link.
insert into public.promo_codes (retailer_id, code, title, discount_type, discount_value, verified_at)
values ((select id from public.retailers where slug = 'pickleball-grip-doctor'), 'DINK15', '15% off paddles', 'percent', 15, now());
select results_eq($$select retailer_slug::text, delivered_cents, code_auto_applied from public.variant_offer_ranking
                     where variant_id = (select (r ->> 'variant_id')::uuid from made) order by rank$$,
  $$values ('pickleball-grip-doctor'::text, 17000, true), ('baseline-sports'::text, 18999, false)$$,
  'Grip Doctor’s code lowers what you pay and is applied automatically');

-- Vendor names are staff data -----------------------------------------------------------------------

select pg_temp.act_as('20202020-0000-0000-0000-000000000002');
select is_empty($$select 1 from public.brand_vendor_aliases$$, 'shoppers can’t read vendor names');
reset role;
select pg_temp.as_anon();
select throws_ok($$select 1 from public.brand_vendor_aliases$$, '42501', null, 'guests can’t either');
reset role;

select * from finish();
rollback;
