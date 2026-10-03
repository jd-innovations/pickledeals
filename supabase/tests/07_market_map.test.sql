begin;
select plan(16);

insert into auth.users (id, email) values ('13131313-0000-0000-0000-000000000001', 'mapseller@example.test');

-- Listings inserted directly (as the seed does), each located through snap_point like publish_listing.
create function pg_temp.place(lid uuid, lat double precision, lng double precision, status text default 'active', cat text default 'paddles', price integer default 9000)
returns void language sql as $$
  insert into public.listings (id, seller_id, category_id, custom_title, condition, price_cents, status, published_at)
  values (lid, '13131313-0000-0000-0000-000000000001', (select id from public.categories where slug = cat),
          'Map test ' || cat || ' item', 'good', price, status::public.listing_status, now());
  insert into public.listing_locations (listing_id, public_point, geohash6, area_label)
  select lid, s.point, s.geohash, 'Testville, FL' from public.snap_point(lat, lng, 6) s;
$$;

-- A clean, empty stretch of the Gulf coast far from the seed (Cedar Key, FL).
select pg_temp.place('bbbb0000-0000-0000-0000-000000000001', 29.13871, -83.03552);
select pg_temp.place('bbbb0000-0000-0000-0000-000000000002', 29.14402, -83.04119, 'pending', 'shoes', 4000);
select pg_temp.place('bbbb0000-0000-0000-0000-000000000003', 29.14011, -83.03601, 'sold');
select pg_temp.place('bbbb0000-0000-0000-0000-000000000004', 29.60000, -83.03552);  -- outside the box below

create function pg_temp.box(max_rows integer default 500, category_slug text default null, statuses text[] default array['active', 'pending'])
returns jsonb language sql as $$
  select public.market_in_bounds(-83.10, 29.10, -83.00, 29.20, category_slug => category_slug, statuses => statuses, max_rows => max_rows);
$$;

-- Access ----------------------------------------------------------------------------------------

select set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
set local role anon;
select lives_ok('select public.market_in_bounds(-83.1, 29.1, -83.0, 29.2)', 'guests can browse the map (D6)');
select throws_ok('select public.market_match()', '42501', null, 'the shared filter helper is internal');

-- D2 ---------------------------------------------------------------------------------------------

select ok((select bool_and(extensions.st_distance(
               extensions.st_setsrid(extensions.st_makepoint((x ->> 'lng')::float8, (x ->> 'lat')::float8), 4326),
               extensions.st_setsrid(extensions.st_pointfromgeohash(loc.geohash6), 4326)) < 1e-9)
             from jsonb_array_elements(pg_temp.box() -> 'items') x
             join public.listing_locations loc on loc.listing_id = (x ->> 'id')::uuid),
  'D2: every map point is exactly a geohash-6 cell centre');
select ok((select (x ->> 'lat')::float8 <> 29.13871 and (x ->> 'lng')::float8 <> -83.03552
             from jsonb_array_elements(pg_temp.box() -> 'items') x where x ->> 'id' = 'bbbb0000-0000-0000-0000-000000000001'),
  'D2: the map never echoes the seller’s input point');
select is((select array_agg(distinct k order by k) from jsonb_array_elements(pg_temp.box() -> 'items') x, jsonb_object_keys(x) k),
  array['area_label', 'best_new_cents', 'brand_name', 'category_slug', 'condition', 'distance_m', 'has_variants', 'id', 'image_count', 'image_path',
        'lat', 'lng', 'pickup', 'price_cents', 'product_slug', 'seller_name', 'ships', 'status', 'title', 'variant_label'],
  'map items expose only public card fields');

-- Bounds and filters -----------------------------------------------------------------------------

select is((select array_agg(x ->> 'id' order by x ->> 'id') from jsonb_array_elements(pg_temp.box() -> 'items') x),
  array['bbbb0000-0000-0000-0000-000000000001', 'bbbb0000-0000-0000-0000-000000000002'],
  'only live listings inside the viewport are returned');
select is((pg_temp.box(category_slug => 'shoes') ->> 'total')::int, 1, 'the map shares the grid’s filters');
select is((pg_temp.box(statuses => array['active']) ->> 'total')::int, 1, 'status filters apply');
select is((public.market_in_bounds(-83.00, 29.20, -83.10, 29.10) ->> 'total')::int, 2, 'corner order doesn’t matter');
select ok((select (x ->> 'distance_m') is null from jsonb_array_elements(pg_temp.box() -> 'items') x limit 1), 'no origin, no distance');
select ok((select (x ->> 'distance_m')::int > 0
             from jsonb_array_elements(public.market_in_bounds(-83.1, 29.1, -83.0, 29.2, 29.5, -83.0) -> 'items') x limit 1),
  'distances come from the snapped origin');
reset role;

-- The 500-row cap --------------------------------------------------------------------------------

select pg_temp.place(gen_random_uuid(), 29.11 + (i % 20) * 0.004, -83.09 + (i / 20) * 0.003)
  from generate_series(1, 520) i;

set local role anon;
select is(jsonb_array_length(pg_temp.box() -> 'items'), 500, 'the map returns at most 500 listings');
select is(jsonb_array_length(pg_temp.box(max_rows => 5000) -> 'items'), 500, 'callers cannot raise the cap');
select ok((pg_temp.box() ->> 'truncated')::boolean and (pg_temp.box() ->> 'total')::int = 522, 'the client learns the result was truncated');
select is(jsonb_array_length(pg_temp.box(max_rows => 10) -> 'items'), 10, 'callers can ask for fewer');
reset role;

-- The grid still works on the shared predicate.
select is((public.market_feed(29.14, -83.04, 5000, category_slug => 'shoes') ->> 'total')::int, 1, 'the grid feed uses the same filters');

select * from finish();
rollback;
