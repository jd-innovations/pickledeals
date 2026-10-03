begin;
select plan(30);

insert into auth.users (id, email) values
  ('ffffffff-0000-0000-0000-000000000001', 'alice5@example.test'),
  ('ffffffff-0000-0000-0000-000000000002', 'bob5@example.test');

create function pg_temp.act_as(uid uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  set local role authenticated;
$$;

-- Clean variant with no seeded offers: Perseus CFS 14mm.
create temp table t as
select v.id as vid, p.id as pid, p.brand_id from public.product_variants v join public.products p on p.id = v.product_id
 where p.slug = 'joola-perseus-cfs' and v.label = '14mm';
grant select on t to anon, authenticated;

create function pg_temp.notes(uid uuid) returns integer language sql as $$
  select count(*)::int from public.notifications where user_id = uid;
$$;

-- Structure ---------------------------------------------------------------------------------------

select ok((select bool_and(relrowsecurity) from pg_class where oid in (
  'public.saved_products'::regclass, 'public.saved_deals'::regclass, 'public.brand_follows'::regclass,
  'public.saved_searches'::regclass, 'public.price_alerts'::regclass, 'public.push_tokens'::regclass,
  'public.notifications'::regclass)), 'RLS is on for every Phase 5 table');

set local role anon;
select throws_ok('select * from public.saved_products', '42501', null, 'anon cannot read saves');
select throws_ok('select id from public.notifications', '42501', null, 'anon cannot read notifications');
reset role;

-- Saves are private ------------------------------------------------------------------------------

select pg_temp.act_as('ffffffff-0000-0000-0000-000000000001');
select lives_ok($$insert into public.saved_products (user_id, product_id) select 'ffffffff-0000-0000-0000-000000000001', pid from t$$, 'a user saves a product');
select lives_ok($$insert into public.brand_follows (user_id, brand_id) select 'ffffffff-0000-0000-0000-000000000001', brand_id from t$$, 'a user follows a brand');
select throws_ok($$insert into public.saved_products (user_id, product_id) select 'ffffffff-0000-0000-0000-000000000002', pid from t$$,
  '42501', null, 'a user cannot save on someone else’s behalf');
select lives_ok($$insert into public.price_alerts (user_id, product_id, variant_id, target_cents) select 'ffffffff-0000-0000-0000-000000000001', pid, vid, 15000 from t$$,
  'a user creates a price alert (for one version; the seeded 16mm is already $149)');
select throws_ok($$insert into public.price_alerts (user_id, product_id, variant_id, target_cents) select 'ffffffff-0000-0000-0000-000000000001', pid, vid, 14000 from t$$,
  '23505', null, 'one alert per product (edit it instead)');
select throws_ok($$update public.price_alerts set last_notified_cents = 1 where true$$, '42501', null, 'alert bookkeeping is not client-writable');
select throws_ok($$insert into public.notifications (user_id, type, title, body, dedupe_key) values ('ffffffff-0000-0000-0000-000000000001', 'system', 'x', 'y', 'z')$$,
  '42501', null, 'clients cannot create notifications');
select throws_ok($$select dedupe_key from public.notifications$$, '42501', null, 'notification internals are not client-readable');
select throws_ok($$select public.claim_pending_notifications()$$, '42501', null, 'clients cannot claim the push queue');
select lives_ok($$select public.register_push_token('ExponentPushToken[alice-phone]', 'ios', 'iPhone')$$, 'a user registers a device');
select throws_ok($$select public.register_push_token('not-a-token', 'ios')$$, '23514', null, 'malformed push tokens are rejected');
reset role;

select pg_temp.act_as('ffffffff-0000-0000-0000-000000000002');
select is((select count(*)::int from public.saved_products), 0, 'saves are invisible to other users');
select is((select count(*)::int from public.price_alerts), 0, 'alerts are invisible to other users');
select lives_ok($$select public.register_push_token('ExponentPushToken[alice-phone]', 'ios', 'iPhone')$$, 'signing in on a shared device moves its token');
reset role;
select is((select user_id from public.push_tokens where expo_token = 'ExponentPushToken[alice-phone]'), 'ffffffff-0000-0000-0000-000000000002'::uuid,
  'a device token belongs to one user at a time');

-- Alert evaluation -------------------------------------------------------------------------------

insert into public.retailer_offers (variant_id, retailer_id, url, price_cents)
select (select vid from t), id, 'https://baseline-sports.example/cfs14-alert', 16000 from public.retailers where slug = 'baseline-sports';
select is(pg_temp.notes('ffffffff-0000-0000-0000-000000000001'), 0, 'nothing while above target and not a deal');

update public.retailer_offers set price_cents = 14900 where url = 'https://baseline-sports.example/cfs14-alert';
select is((select count(*)::int from public.notifications where user_id = 'ffffffff-0000-0000-0000-000000000001' and type = 'brand_deal'), 1,
  'following a brand notifies when it gets a new deal');
select is((select count(*)::int from public.notifications where user_id = 'ffffffff-0000-0000-0000-000000000001' and type = 'target_price'), 1,
  'dropping below target fires the alert');
select is((select title from public.notifications where type = 'target_price' and user_id = 'ffffffff-0000-0000-0000-000000000001'),
  'JOOLA Perseus CFS is $149', 'the alert names the product and price');

update public.retailer_offers set in_stock = false where url = 'https://baseline-sports.example/cfs14-alert';
select is((select count(*)::int from public.notifications where type = 'target_price' and user_id = 'ffffffff-0000-0000-0000-000000000001'), 1,
  'a refresh at the same price does not repeat');

update public.retailer_offers set price_cents = 13900 where url = 'https://baseline-sports.example/cfs14-alert';
select is((select count(*)::int from public.notifications where type = 'target_price' and user_id = 'ffffffff-0000-0000-0000-000000000001'), 2,
  'a further drop notifies again');

update public.price_alerts set status = 'paused' where user_id = 'ffffffff-0000-0000-0000-000000000001';
update public.retailer_offers set price_cents = 12900 where url = 'https://baseline-sports.example/cfs14-alert';
select is((select count(*)::int from public.notifications where type = 'target_price' and user_id = 'ffffffff-0000-0000-0000-000000000001'), 2,
  'paused alerts stay quiet');

update public.price_alerts set status = 'active', target_cents = 13000 where user_id = 'ffffffff-0000-0000-0000-000000000001';
select is((select last_notified_cents from public.price_alerts where user_id = 'ffffffff-0000-0000-0000-000000000001'), null,
  'editing or resuming an alert re-arms it');

-- Read state + queue -------------------------------------------------------------------------------

select pg_temp.act_as('ffffffff-0000-0000-0000-000000000001');
-- 4 = brand deal + two target-price alerts + the saved-product price drop while the alert was paused (Phase 10).
select is(public.mark_notifications_read(), 4, 'mark-all-read marks the user’s own notifications');
reset role;
select is((select count(*)::int from public.notifications where read_at is not null and user_id = 'ffffffff-0000-0000-0000-000000000002'), 0,
  'and nobody else’s');

-- Claimed at midday New York time, so quiet hours (Phase 10) don't apply.
select ok((select count(*) from public.claim_pending_notifications(500, '2026-10-07 16:00+00')) >= 3, 'dispatch claims pending notifications');
select is((select count(*)::int from public.claim_pending_notifications(500, '2026-10-07 16:00+00')), 0, 'a second run cannot claim the same notifications');

select * from finish();
rollback;
