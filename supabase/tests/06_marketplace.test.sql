begin;
select plan(45);

insert into auth.users (id, email) values
  ('12121212-0000-0000-0000-000000000001', 'seller6@example.test'),
  ('12121212-0000-0000-0000-000000000002', 'buyer6@example.test');

create function pg_temp.act_as(uid uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  set local role authenticated;
$$;

create function pg_temp.listing(lid uuid, extra jsonb default '{}') returns jsonb language sql as $$
  select jsonb_build_object(
    'id', lid,
    'product_id', (select id from public.products where slug = 'crbn-1x-power-series'),
    'variant_id', (select v.id from public.product_variants v join public.products p on p.id = v.product_id where p.slug = 'crbn-1x-power-series' and v.label = '16mm'),
    'condition', 'excellent', 'price_cents', 15000, 'description', 'Lightly used.', 'pickup', true, 'ships', false,
    'hide_offers_below_cents', 12000,
    'images', jsonb_build_array(jsonb_build_object('path', '12121212-0000-0000-0000-000000000001/' || lid || '/a.jpg', 'width', 2048, 'height', 1536)),
    'location', jsonb_build_object('lat', 27.336789, 'lng', -82.531234, 'area_label', 'Sarasota, FL')) || extra;
$$;

-- Structure ---------------------------------------------------------------------------------------

select ok((select bool_and(relrowsecurity) from pg_class where oid in (
  'public.listings'::regclass, 'public.listing_private'::regclass, 'public.listing_images'::regclass,
  'public.listing_locations'::regclass, 'public.listing_catalog_reviews'::regclass, 'public.saved_listings'::regclass,
  'public.prohibited_terms'::regclass, 'public.variant_market_stats'::regclass)), 'RLS is on for every marketplace table');

-- D2 snapping ---------------------------------------------------------------------------------------

select is((select geohash from public.snap_point(27.336789, -82.531234)), 'dhv79b', 'points snap to their geohash-6 cell');
select ok((select extensions.st_distance(point, extensions.st_makepoint(-82.531234, 27.336789)::extensions.geography) > 50
             from public.snap_point(27.336789, -82.531234)), 'the stored point is the cell centre, not the input');
select is((select geohash from public.snap_point(27.3368, -82.5313)), (select geohash from public.snap_point(27.3370, -82.5300)),
  'nearby homes in the same cell are indistinguishable');

-- Publish ---------------------------------------------------------------------------------------------

select pg_temp.act_as('12121212-0000-0000-0000-000000000001');
select lives_ok($$select public.publish_listing(pg_temp.listing('aaaa0000-0000-0000-0000-000000000001'))$$, 'a seller publishes a catalog listing');
select is((select status::text from public.listings where id = 'aaaa0000-0000-0000-0000-000000000001'), 'active', 'published listings are active');
select is((select category_id from public.listings where id = 'aaaa0000-0000-0000-0000-000000000001'),
          (select category_id from public.products where slug = 'crbn-1x-power-series'), 'catalog listings take the product’s category');
select throws_ok($$select public.publish_listing(pg_temp.listing('aaaa0000-0000-0000-0000-000000000002',
  jsonb_build_object('images', jsonb_build_array(jsonb_build_object('path', '12121212-0000-0000-0000-000000000002/x/a.jpg')))))$$,
  '42501', null, 'photos must come from the seller’s own folder');
select throws_ok($$select public.publish_listing(pg_temp.listing('aaaa0000-0000-0000-0000-000000000003', '{"description":"Great replica of the Perseus"}'))$$,
  '22023', 'Replicas aren’t allowed.', 'prohibited terms are rejected with a reason');
select throws_ok($$select public.publish_listing(pg_temp.listing('aaaa0000-0000-0000-0000-000000000004', '{"images":[]}'))$$,
  '22023', 'Add between 1 and 10 photos.', 'a listing needs photos');
select lives_ok($$select public.publish_listing(pg_temp.listing('aaaa0000-0000-0000-0000-000000000005',
  jsonb_build_object('product_id', null, 'variant_id', null, 'custom_title', 'Vintage Head wood paddle', 'custom_brand_text', 'HEAD',
                     'category_id', (select id from public.categories where slug = 'paddles'),
                     'images', jsonb_build_array(jsonb_build_object('path', '12121212-0000-0000-0000-000000000001/aaaa0000-0000-0000-0000-000000000005/a.jpg')))))$$,
  'custom (non-catalog) items can be listed (D3)');
select throws_ok($$update public.listings set price_cents = 1 where id = 'aaaa0000-0000-0000-0000-000000000001'$$, '42501', null,
  'listings are edited through update_listing, not directly');
select is_empty($$update public.listings set status = 'sold' where id = 'aaaa0000-0000-0000-0000-000000000001' returning 1$$,
  'sellers cannot change status directly');
select lives_ok($$select public.update_listing('aaaa0000-0000-0000-0000-000000000001', '{"price_cents": 14000}')$$, 'sellers edit through the RPC');
select lives_ok($$insert into storage.objects (bucket_id, name) values ('listing-images', '12121212-0000-0000-0000-000000000001/x/own.jpg')$$,
  'sellers upload to their own folder');
select throws_ok($$insert into storage.objects (bucket_id, name) values ('listing-images', '12121212-0000-0000-0000-000000000002/x/theirs.jpg')$$,
  '42501', null, 'sellers cannot upload into someone else’s folder');
reset role;

select is((select count(*)::int from public.listing_catalog_reviews r join public.listings l on l.id = r.listing_id
            where l.custom_title = 'Vintage Head wood paddle'), 1, 'custom listings are queued for catalog review');
select is((select l.product_id from public.listings l where l.custom_title = 'Vintage Head wood paddle'), null, 'custom listings never auto-create products');
select is((select min_ask_cents from public.variant_market_stats v join public.listings l on l.variant_id = v.variant_id
            where l.id = 'aaaa0000-0000-0000-0000-000000000001'), 14000, 'market stats follow listing changes');

-- Public reads ---------------------------------------------------------------------------------------

set local role anon;
select ok((select count(*) from public.listings where id = 'aaaa0000-0000-0000-0000-000000000001') = 1, 'anon reads published listings');
select throws_ok('select sold_to_user_id from public.listings', '42501', null, 'buyers of sold listings stay private');
select throws_ok('select * from public.listing_private', '42501', null, 'the seller’s offer floor is private');
select throws_ok('select public_point from public.listing_locations', '42501', null, 'D2: no client can read even the snapped point directly');
select is((select area_label from public.listing_locations where listing_id = 'aaaa0000-0000-0000-0000-000000000001'), 'Sarasota, FL',
  'the area label is public');
select ok(not exists (select 1 from jsonb_array_elements(public.market_feed(27.33, -82.53) -> 'items') x
                       where x ? 'public_point' or x ? 'lat' or x ? 'lng'), 'D2: the feed never returns coordinates');
select ok((select bool_and((x ->> 'distance_m')::int <= 40000 or (x ->> 'ships')::boolean)
             from jsonb_array_elements(public.market_feed(27.33, -82.53, 40000) -> 'items') x), 'the feed respects the radius (or ships)');
select throws_ok($$select public.publish_listing('{}')$$, '42501', null, 'anon cannot publish');
reset role;

-- Status, savers, used alerts --------------------------------------------------------------------------

select pg_temp.act_as('12121212-0000-0000-0000-000000000002');
select lives_ok($$insert into public.saved_listings (user_id, listing_id) values ('12121212-0000-0000-0000-000000000002', 'aaaa0000-0000-0000-0000-000000000001')$$,
  'a buyer saves a listing');
select throws_ok($$select public.set_listing_status('aaaa0000-0000-0000-0000-000000000001', 'sold')$$, '42501', null, 'only the seller changes status');
select lives_ok($$select public.set_home_area(27.336789, -82.531234, 'Sarasota, FL', 40000)$$, 'a buyer sets an approximate home area');
select lives_ok($$insert into public.price_alerts (user_id, product_id, target_cents, include_used)
  select '12121212-0000-0000-0000-000000000002', id, 16000, true from public.products where slug = 'crbn-1x-power-series'$$, 'a buyer alerts on pre-owned');
select ok((public.market_feed(use_home => true) ->> 'has_origin')::boolean, 'the feed can measure from the caller’s saved home area');
reset role;

select set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
set local role anon;
select ok(not (public.market_feed(use_home => true) ->> 'has_origin')::boolean, 'guests have no home area');
select is((select count(*)::int from jsonb_array_elements(public.market_feed(q => 'vintage WOOD', radius_m => null) -> 'items') x
            where x ->> 'id' = 'aaaa0000-0000-0000-0000-000000000005'), 1, 'search matches every word, case-insensitively');
select is((select count(*)::int from jsonb_array_elements(public.market_feed(q => 'vintage', radius_m => null) -> 'items') x
            where x ->> 'id' = 'aaaa0000-0000-0000-0000-000000000001'), 0, 'search excludes listings that don’t match');
select is((public.market_feed(ids => array['aaaa0000-0000-0000-0000-000000000001'::uuid], radius_m => null) ->> 'total')::int, 1, 'the feed filters by id (Saved listings)');
select throws_ok('select * from public.my_listing_save_counts()', '42501', null, 'save counts need a signed-in seller');
reset role;

select pg_temp.act_as('12121212-0000-0000-0000-000000000001');
select is((select saves from public.my_listing_save_counts() where listing_id = 'aaaa0000-0000-0000-0000-000000000001'), 1, 'sellers see how many people saved their listing');
reset role;

select pg_temp.act_as('12121212-0000-0000-0000-000000000001');
do $$ begin
  perform public.publish_listing(pg_temp.listing('aaaa0000-0000-0000-0000-000000000006',
    jsonb_build_object('images', jsonb_build_array(jsonb_build_object('path', '12121212-0000-0000-0000-000000000001/aaaa0000-0000-0000-0000-000000000006/a.jpg')))));
  perform public.set_listing_status('aaaa0000-0000-0000-0000-000000000001', 'pending');
end $$;
reset role;
set constraints all immediate;

select is((select count(*)::int from public.notifications where user_id = '12121212-0000-0000-0000-000000000002' and dedupe_key = 'listing:aaaa0000-0000-0000-0000-000000000006'),
  1, 'a nearby listing under the target notifies pre-owned alerts');
select is((select count(*)::int from public.notifications where user_id = '12121212-0000-0000-0000-000000000002' and dedupe_key like 'listing:aaaa0000-0000-0000-0000-000000000001:pending'),
  1, 'savers hear when a listing goes pending');

select pg_temp.act_as('12121212-0000-0000-0000-000000000001');
do $$ begin perform public.set_listing_status('aaaa0000-0000-0000-0000-000000000001', 'sold'); end $$;
select throws_ok($$select public.set_listing_status('aaaa0000-0000-0000-0000-000000000001', 'active')$$, '22023', null, 'sold listings are final');
reset role;

-- D3 review queue -------------------------------------------------------------------------------------

select pg_temp.act_as('12121212-0000-0000-0000-000000000001');
select throws_ok($$select public.resolve_listing_review((select r.id from public.listing_catalog_reviews r where r.listing_id = 'aaaa0000-0000-0000-0000-000000000005'), 'dismissed')$$,
  '42501', null, 'only staff resolve catalog reviews');
reset role;

select set_config('request.jwt.claims', json_build_object('sub', '12121212-0000-0000-0000-000000000002', 'role', 'authenticated', 'app_role', 'editor')::text, true);
set local role authenticated;
select lives_ok($$select public.resolve_listing_review(
    (select r.id from public.listing_catalog_reviews r where r.listing_id = 'aaaa0000-0000-0000-0000-000000000005'), 'linked',
    (select v.id from public.product_variants v join public.products p on p.id = v.product_id where p.slug = 'crbn-1x-power-series' and v.label = '16mm'))$$,
  'staff link a custom listing to a catalog variant');
reset role;
select is((select p.slug from public.listings l join public.products p on p.id = l.product_id where l.id = 'aaaa0000-0000-0000-0000-000000000005'),
  'crbn-1x-power-series', 'the linked listing now belongs to the product (and its page)');
select is((select decision::text from public.listing_catalog_reviews where listing_id = 'aaaa0000-0000-0000-0000-000000000005'), 'linked', 'the review is closed');

select * from finish();
rollback;
