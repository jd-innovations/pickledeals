begin;
select plan(16);

create function pg_temp.act_as(uid uuid, app_role text default null) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated', 'app_role', app_role)::text, true);
  set local role authenticated;
$$;
create function pg_temp.as_anon() returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
  set local role anon;
$$;

insert into auth.users (id, email) values
  ('21212121-0000-0000-0000-000000000001', 'editor@example.test'),
  ('21212121-0000-0000-0000-000000000002', 'shopper@example.test');

-- A store item with content, as the Shopify adapter emits it (fictional identifiers).
create temp table item as select jsonb_build_object(
  'retailer_slug', 'pickleball-grip-doctor', 'external_ref', 'variant-sc-1', 'url', 'https://pickleballgripdoctor.com/products/sc-paddle',
  'title', 'Store Content Test Paddle', 'brand', 'EngagePickleball', 'price_cents', 14999, 'in_stock', true,
  'content_ref', 'shopify-product-sc-1', 'product_type', 'Paddle',
  'description', jsonb_build_array(jsonb_build_object('kind', 'paragraph', 'runs', jsonb_build_array(jsonb_build_object('text', 'Fast and light.')))),
  'specs', jsonb_build_object('core_thickness', '16mm'),
  'images', jsonb_build_array(jsonb_build_object('url', 'https://cdn.shopify.com/sc-1.jpg'))) as rec;
grant select on item to authenticated, anon;

select public.ingest_offers('shopify-gripdoctor', jsonb_build_array((select rec from item)), false, true);
create temp table raw as select id from public.raw_offer_records where external_ref = 'variant-sc-1' and match_status = 'unmatched';
grant select on raw to authenticated;

-- Create product starts complete ---------------------------------------------------------------------

select pg_temp.act_as('21212121-0000-0000-0000-000000000001', 'editor');
create temp table made as
  select public.staff_create_product_from_raw((select id from raw), (select id from public.brands where slug = 'engage'),
                                              (select id from public.categories where slug = 'paddles'), 'SC Test Paddle') as r;
reset role;
create temp table pid as select (r ->> 'product_id')::uuid as id from made;
grant select on pid to authenticated, anon;

select is((select description -> 0 -> 'runs' -> 0 ->> 'text' from public.products where id = (select id from pid)), 'Fast and light.',
  'the description comes with the product');
select is((select specs ->> 'core_thickness' from public.products where id = (select id from pid)), '16mm', 'and the specs read from it');
select is((select content_ref from public.products where id = (select id from pid)), 'shopify-product-sc-1', 'it follows the store product');
select is((select content_source_id from public.products where id = (select id from pid)),
          (select id from public.ingestion_sources where slug = 'shopify-gripdoctor'), 'through the store’s source');
select is((select content_ref from public.retailer_offers where external_ref = 'variant-sc-1'), 'shopify-product-sc-1',
  'the offer remembers its store product');

-- Sync helpers (service role only) ---------------------------------------------------------------------

select public.apply_store_content((select id from pid),
  '[{"kind":"heading","text":"New copy"}]'::jsonb, '{"core_thickness":"14mm","weight":"8 oz"}'::jsonb, 'h1');
select is((select description -> 0 ->> 'text' from public.products where id = (select id from pid)), 'New copy', 'a sync replaces the description');
select is((select specs from public.products where id = (select id from pid)), '{"core_thickness":"16mm"}'::jsonb,
  'but never overwrites specs that exist');
select is((select content_hash from public.products where id = (select id from pid)), 'h1', 'and records what it synced');

-- A catalog product with nothing of its own adopts the store's content once a store offer matches it.
update public.products set status = 'active' where id = (select id from pid);
-- Two published products of the test's own: one with nothing, one with a curated image.
insert into public.products (brand_id, category_id, slug, name, status)
select b.id, c.id, x.slug, x.name, 'active'
  from public.brands b, public.categories c, (values ('sc-bare', 'SC Bare Paddle'), ('sc-curated', 'SC Curated Paddle')) x(slug, name)
 where b.slug = 'engage' and c.slug = 'paddles';
insert into public.product_variants (product_id, label, is_default)
select id, 'Standard', true from public.products where slug in ('sc-bare', 'sc-curated');
insert into public.product_images (product_id, storage_path, source, status)
select id, 'products/sc-curated/curated.jpg', 'owned', 'active' from public.products where slug = 'sc-curated';
create temp table bare as
  select p.id, v.id as vid from public.products p join public.product_variants v on v.product_id = p.id where p.slug = 'sc-bare';
create temp table curated as
  select p.id, v.id as vid from public.products p join public.product_variants v on v.product_id = p.id where p.slug = 'sc-curated';
select public.ingest_offers('shopify-gripdoctor', jsonb_build_array(
  (select rec from item) || jsonb_build_object('external_ref', 'variant-sc-2', 'content_ref', 'shopify-product-sc-2', 'variant_id', (select vid from bare)),
  (select rec from item) || jsonb_build_object('external_ref', 'variant-sc-3', 'content_ref', 'shopify-product-sc-3', 'variant_id', (select vid from curated))),
  false, true);
create temp table linked as select * from public.link_store_content((select id from public.ingestion_sources where slug = 'shopify-gripdoctor'));

select ok(exists (select 1 from linked where product_id = (select id from bare) and content_ref = 'shopify-product-sc-2'),
  'a product with no description or images adopts its store content');
select ok(not exists (select 1 from linked where product_id = (select id from curated)), 'a product with curated images keeps them');
select ok(exists (select 1 from linked where product_id = (select id from pid)), 'products created from the store are listed for sync');

select pg_temp.as_anon();
select throws_ok($$select * from public.link_store_content(gen_random_uuid())$$, '42501', null, 'guests can’t run the sync helpers');
select is((select description -> 0 ->> 'text' from public.products where id = (select id from pid)), 'New copy', 'but can read published descriptions');
reset role;

-- Admin: switch a curated product to its store's content ------------------------------------------------

create temp table curated_offer as select id from public.retailer_offers where external_ref = 'variant-sc-3';
grant select on curated_offer, curated to authenticated;
select pg_temp.act_as('21212121-0000-0000-0000-000000000002');
select throws_ok($$select public.staff_use_store_content((select id from curated), (select id from curated_offer))$$, '42501', null,
  'shoppers can’t change where content comes from');
reset role;
select pg_temp.act_as('21212121-0000-0000-0000-000000000001', 'editor');
select throws_ok($$select public.staff_use_store_content((select id from pid), (select id from curated_offer))$$, '22023', null,
  'an offer can only lend content to its own product');
select public.staff_use_store_content((select id from curated), (select id from curated_offer));
reset role;
select is((select content_ref from public.products where id = (select id from curated)), 'shopify-product-sc-3', 'staff can switch it');

select * from finish();
rollback;
