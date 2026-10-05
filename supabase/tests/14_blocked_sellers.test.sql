begin;
select plan(8);

create function pg_temp.act_as(uid uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  set local role authenticated;
$$;
create function pg_temp.as_anon() returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
  set local role anon;
$$;

insert into auth.users (id, email) values ('19191919-0000-0000-0000-000000000001', 'blocker@example.test');
create temp table s as select id from auth.users where email = 'seller1@pickledeals.test';
grant select on s to authenticated, anon;

-- The seeded seller's listings, through the feed (with and without the seller filter) and the map.
create function pg_temp.feed_count() returns int language sql as $$
  select (public.market_feed(seller => (select id from s), max_rows => 100) ->> 'total')::int;
$$;
create function pg_temp.in_all_feed() returns int language sql as $$
  select count(*)::int from jsonb_array_elements(public.market_feed(max_rows => 500) -> 'items') x
   where (x ->> 'id')::uuid in (select id from public.listings where seller_id = (select id from s));
$$;
create function pg_temp.on_map() returns int language sql as $$
  select count(*)::int from jsonb_array_elements(public.market_in_bounds(-83.5, 26.5, -81.5, 28.5, max_rows => 500) -> 'items') x
   where (x ->> 'id')::uuid in (select id from public.listings where seller_id = (select id from s));
$$;

select pg_temp.act_as('19191919-0000-0000-0000-000000000001');
create temp table before as select pg_temp.feed_count() as n;
reset role;
grant select on before to authenticated, anon;
select pg_temp.act_as('19191919-0000-0000-0000-000000000001');
select ok((select n from before) > 0, 'the seller has listings in the marketplace');

select lives_ok($$select public.block_user((select id from s))$$, 'the viewer blocks the seller');
select is(pg_temp.feed_count(), 0, 'the seller''s profile shows none of their listings to the blocker');
select is(pg_temp.in_all_feed(), 0, 'the grid hides them');
select is(pg_temp.on_map(), 0, 'and so does the map');
reset role;

select pg_temp.as_anon();
select is(pg_temp.feed_count(), (select n from before), 'guests are unaffected');
reset role;

-- The other direction: the seller blocks a viewer, who then stops seeing that seller's listings.
select pg_temp.act_as('19191919-0000-0000-0000-000000000001');
select public.unblock_user((select id from s));
reset role;
select pg_temp.act_as((select id from s));
select public.block_user('19191919-0000-0000-0000-000000000001');
select is(pg_temp.feed_count(), (select n from before), 'sellers still see their own listings');
reset role;
select pg_temp.act_as('19191919-0000-0000-0000-000000000001');
select is(pg_temp.feed_count(), 0, 'a seller who blocked the viewer is hidden too');
reset role;

select * from finish();
rollback;
