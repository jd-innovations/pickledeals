begin;
select plan(19);

insert into auth.users (id, email) values ('18181818-0000-0000-0000-000000000001', 'owner@example.test');
insert into public.user_roles (user_id, role) values ('18181818-0000-0000-0000-000000000001', 'admin');

-- Names and categories --------------------------------------------------------------------------------

select is(public.store_product_name('*AVAILABLE NOW* Year of the Horse FURY EL 15.5 MM (POWER SERIES)', 'Thrive Pickleball', 'Thrive'),
  'Year of the Horse FURY EL 15.5 MM (POWER SERIES)', 'marketing markers are dropped');
select is(public.store_product_name('NEW GRAPHIC. Pursuit Pro EX 12.7 | Raw Carbon Fiber', 'EngagePickleball', 'Engage'),
  'Pursuit Pro EX 12.7', '"NEW GRAPHIC." and the "| …" tail are dropped');
select is(public.store_product_name('Pickleball Grip Doctor Pro Towel', 'Pickleball Grip Doctor', 'Pickleball Grip Doctor'),
  'Pro Towel', 'a leading vendor name is dropped');
select is(public.store_product_name('IGNITE HYBRID FOAM **NEW**  (Recommended swing weight 110-111)', 'Thrive Pickleball', 'Thrive'),
  'IGNITE HYBRID FOAM', '"(recommended …)" notes are dropped');
select is(public.store_category_slug('Pickleball Lead Tape'), 'paddle-accessories', 'product type: lead tape is a paddle accessory');
select is(public.store_category_slug('HEXXO Pickleball Paddle Grip – Fits All Paddles'), 'grips', 'a paddle grip is a grip, not a paddle');
select is(public.store_category_slug('Mystery Box'), null, 'no rule: unsure');

-- A new store item becomes a published product ------------------------------------------------------

update public.ingestion_sources set config = config || '{"auto_create": true}' where slug = 'shopify-gripdoctor';

create temp table lead as select jsonb_build_object(
  'retailer_slug', 'pickleball-grip-doctor', 'external_ref', 'product-1818-lead', 'retailer_sku', 'product-1818-lead',
  'url', 'https://pickleballgripdoctor.com/products/test-lead?utm_source=pickledeals&utm_medium=referral',
  'title', 'Lead 7g - Test Neon 4 Pack', 'store_title', 'Lead 7g - Test Neon 4 Pack', 'brand', 'Testflick Weight',
  'content_ref', 'shopify-product-1818', 'price_cents', 1299, 'shipping_cents', 499, 'in_stock', true,
  'ships_from', 'Testflick Weight') as rec;

select is((public.ingest_offers('shopify-gripdoctor', jsonb_build_array((select rec from lead)), false, true) ->> 'auto_created')::int, 1,
  'the job adds the item itself');
select is((select name from public.brands where slug = 'testflick-weight'), 'Testflick Weight', 'a new vendor becomes a brand');
select results_eq($$select p.name, p.status::text, c.slug::text from public.products p join public.categories c on c.id = p.category_id
                     where p.content_ref = 'shopify-product-1818'$$,
  $$values ('Lead 7g - Test Neon 4 Pack'::text, 'active'::text, 'paddle-accessories'::text)$$, 'published, in the category its title implies');
select is((select count(*)::int from public.retailer_offers where external_ref = 'product-1818-lead' and status = 'active'), 1, 'with a live offer');
select is((select count(*)::int from public.notifications where user_id = '18181818-0000-0000-0000-000000000001' and title = 'New product added'), 1,
  'admins are told');
select is((select count(*)::int from public.promo_code_targets t join public.products p on p.id = t.product_id where p.content_ref = 'shopify-product-1818'), 0,
  'no promo code is extended to it');

-- Options of one store product become variants ------------------------------------------------------

select is((public.ingest_offers('shopify-gripdoctor', jsonb_build_array(
  jsonb_build_object('retailer_slug', 'pickleball-grip-doctor', 'external_ref', 'product-1819-116', 'retailer_sku', 'product-1819-116',
    'url', 'https://pickleballgripdoctor.com/products/test-fury', 'title', 'TEST FURY 15.5 MM – 116', 'store_title', 'TEST FURY 15.5 MM',
    'store_variant', '116', 'brand', 'Testflick Weight', 'product_type', 'Pickleball Paddle', 'content_ref', 'shopify-product-1819',
    'price_cents', 19999, 'in_stock', true),
  jsonb_build_object('retailer_slug', 'pickleball-grip-doctor', 'external_ref', 'product-1819-117', 'retailer_sku', 'product-1819-117',
    'url', 'https://pickleballgripdoctor.com/products/test-fury', 'title', 'TEST FURY 15.5 MM – 117', 'store_title', 'TEST FURY 15.5 MM',
    'store_variant', '117', 'brand', 'Testflick Weight', 'product_type', 'Pickleball Paddle', 'content_ref', 'shopify-product-1819',
    'price_cents', 19999, 'in_stock', true)), false, true) ->> 'auto_created')::int, 2, 'both swing weights are added');
select results_eq($$select v.label from public.product_variants v join public.products p on p.id = v.product_id
                     where p.content_ref = 'shopify-product-1819' order by v.sort$$,
  $$values ('116'::text), ('117'::text)$$, 'as two variants of one paddle');

-- Unsure items still wait for review ------------------------------------------------------------------

select is((public.ingest_offers('shopify-gripdoctor', jsonb_build_array(jsonb_build_object(
  'retailer_slug', 'pickleball-grip-doctor', 'external_ref', 'product-1820', 'retailer_sku', 'product-1820',
  'url', 'https://pickleballgripdoctor.com/products/mystery', 'title', 'Mystery Box', 'store_title', 'Mystery Box',
  'brand', 'Testflick Weight', 'content_ref', 'shopify-product-1820', 'price_cents', 2500, 'in_stock', true)), false, true) ->> 'unmatched')::int, 1,
  'an item with no category rule goes to the review queue');
select is((select match_status::text from public.raw_offer_records where external_ref = 'product-1820'), 'unmatched', 'and stays unmatched');

-- An item already waiting in the queue (from before auto-create) is added on the next run, and that run
-- lists its offer, so the end-of-run cleanup keeps it live.
update public.ingestion_sources set config = config - 'auto_create' where slug = 'shopify-gripdoctor';
create temp table waiting as select jsonb_build_object(
  'retailer_slug', 'pickleball-grip-doctor', 'external_ref', 'product-1821', 'retailer_sku', 'product-1821',
  'url', 'https://pickleballgripdoctor.com/products/test-overgrip', 'title', 'Test Overgrip 3 Pack', 'store_title', 'Test Overgrip 3 Pack',
  'brand', 'Testflick Weight', 'content_ref', 'shopify-product-1821', 'price_cents', 999, 'in_stock', true) as rec;
select public.ingest_offers('shopify-gripdoctor', jsonb_build_array((select rec from waiting)), false, true);
update public.ingestion_sources set config = config || '{"auto_create": true}' where slug = 'shopify-gripdoctor';
create temp table second_run as
  select (public.ingest_offers('shopify-gripdoctor', jsonb_build_array((select rec from waiting)), false, true) ->> 'run_id')::uuid as id;
select is((select count(*)::int from public.raw_offer_records x join public.retailer_offers o on o.id = x.offer_id
            where x.run_id = (select id from second_run) and x.external_ref = 'product-1821' and o.status = 'active'), 1,
  'the queued item is added and its offer is listed in the run that added it');
select is((select count(*)::int from public.raw_offer_records where external_ref = 'product-1821' and match_status = 'unmatched'), 0,
  'nothing is left in the queue');

select * from finish();
rollback;
