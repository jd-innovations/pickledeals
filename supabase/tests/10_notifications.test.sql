begin;
select plan(38);

-- Fixtures ----------------------------------------------------------------------------------------
insert into auth.users (id, email) values
  ('17171717-0000-0000-0000-000000000001', 'notif-a@example.test'),   -- the subscriber
  ('17171717-0000-0000-0000-000000000002', 'notif-b@example.test'),   -- a seller / counterpart
  ('17171717-0000-0000-0000-000000000003', 'notif-c@example.test');   -- opted out of everything

create function pg_temp.act_as(uid uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  set local role authenticated;
$$;
create function pg_temp.n(uid uuid, kind text) returns integer language sql as $$
  select count(*)::int from public.notifications where user_id = uid and type = kind
$$;

-- Times (America/New_York, the default zone): 23:00 is inside quiet hours, 12:00 is not.
create temp table at_ (k text primary key, t timestamptz);
insert into at_ values ('night', '2026-10-08 03:00+00'), ('morning', '2026-10-08 12:05+00'), ('noon', '2026-10-08 16:00+00'),
                       -- This week's Sunday, so the seeded deals count as "this week".
                       ('sunday9', ((date_trunc('week', now() at time zone 'America/New_York') + interval '6 days 9 hours 20 minutes') at time zone 'America/New_York')),
                       ('sunday10', ((date_trunc('week', now() at time zone 'America/New_York') + interval '6 days 10 hours 20 minutes') at time zone 'America/New_York'));
create function pg_temp.at(k text) returns timestamptz language sql as $$ select t from at_ where at_.k = at.k $$;

-- Structure and defaults --------------------------------------------------------------------------------

select ok((select relrowsecurity from pg_class where oid = 'public.notification_preferences'::regclass), 'RLS is on for preferences');
select ok((select relrowsecurity from pg_class where oid = 'public.push_receipts'::regclass), 'RLS is on for push receipts');

select pg_temp.act_as('17171717-0000-0000-0000-000000000001');
select is((public.my_notification_settings() -> 'categories' -> 'weekly_digest' ->> 'push')::boolean, false, 'the weekly digest is opt-in');
select is((public.my_notification_settings() -> 'categories' -> 'offer' ->> 'push')::boolean, true, 'everything else is on by default');
select is(public.my_notification_settings() ->> 'quiet_start', '22:00', 'quiet hours default to 10 PM');
select is((public.my_notification_settings() ->> 'daily_deal_cap')::int, 3, 'three deal alerts a day by default');
select throws_ok($$select public.set_notification_settings(tz => 'Mars/Olympus')$$, '22023', 'unknown time zone', 'time zones are validated');
select lives_ok($$select public.set_notification_settings(tz => 'America/New_York')$$, 'users set their zone');
select throws_ok($$select public.claim_pending_notifications()$$, '42501', null, 'clients cannot claim the push queue');
select throws_ok($$select 1 from public.push_receipts$$, '42501', null, 'push receipts are server-only');
reset role;

-- Opt-out user: every category off.
select pg_temp.act_as('17171717-0000-0000-0000-000000000003');
select public.set_notification_preference(c, false)
  from unnest(array['price_drop', 'target_price', 'brand_deal', 'saved_search', 'weekly_digest', 'offer', 'new_message', 'nearby_listing', 'listing_update']) c;
reset role;
select is((select count(*)::int from public.notification_preferences where user_id = '17171717-0000-0000-0000-000000000003' and not push and not in_app), 9,
  'the toggles switch whole categories off');

-- Event: brand deals and saved searches (deals) ------------------------------------------------------

create temp table v (id uuid, product uuid, brand uuid);
insert into v select pv.id, p.id, p.brand_id from public.product_variants pv join public.products p on p.id = pv.product_id
               where p.slug = 'joola-perseus-pro-iv' and pv.label = '14mm';
insert into public.brand_follows (user_id, brand_id) select u, (select brand from v) from unnest(array['17171717-0000-0000-0000-000000000001'::uuid, '17171717-0000-0000-0000-000000000003'::uuid]) u;
insert into public.saved_searches (user_id, label, brand_slug) values ('17171717-0000-0000-0000-000000000001', 'JOOLA deals', 'joola');
insert into public.deals (variant_id, kind, headline, origin) select id, 'sale', 'Test sale', 'curated' from v;
select is(pg_temp.n('17171717-0000-0000-0000-000000000001', 'brand_deal'), 1, 'brand_deal: followers hear about new deals');
select is(pg_temp.n('17171717-0000-0000-0000-000000000003', 'brand_deal'), 0, 'brand_deal: not when the category is off');

-- Event: price drop on a saved product -----------------------------------------------------------------

insert into public.saved_products (user_id, product_id) select u, (select product from v) from unnest(array['17171717-0000-0000-0000-000000000001'::uuid, '17171717-0000-0000-0000-000000000003'::uuid]) u;
update public.variant_price_stats set best_delivered_cents = best_delivered_cents + 2000 where variant_id = (select id from v);
update public.variant_price_stats set best_delivered_cents = best_delivered_cents - 1500 where variant_id = (select id from v);
select is(pg_temp.n('17171717-0000-0000-0000-000000000001', 'price_drop'), 1, 'price_drop: saved products notify when the best price falls');
select ok((select title like '%dropped to%' and route = '/deals/product/joola-perseus-pro-iv' from public.notifications
            where user_id = '17171717-0000-0000-0000-000000000001' and type = 'price_drop'), 'price_drop: names the price and opens the product');
update public.variant_price_stats set best_delivered_cents = best_delivered_cents - 50 where variant_id = (select id from v);
select is(pg_temp.n('17171717-0000-0000-0000-000000000001', 'price_drop'), 1, 'price_drop: cents-level wobble stays quiet');
select is(pg_temp.n('17171717-0000-0000-0000-000000000003', 'price_drop'), 0, 'price_drop: respects the preference');

-- Event: nearby listings for a saved marketplace search ----------------------------------------------------

update public.profiles_private set home_point = (select point from public.snap_point(27.40, -82.40, 5)), search_radius_m = 16000
 where user_id = '17171717-0000-0000-0000-000000000001';
insert into public.saved_searches (user_id, scope, label, category_slug, max_cents, query)
values ('17171717-0000-0000-0000-000000000001', 'market', 'Paddles under $150', 'paddles', 15000, 'carbon');
select pg_temp.act_as('17171717-0000-0000-0000-000000000002');
select public.publish_listing(jsonb_build_object('id', 'abab0000-0000-0000-0000-000000000001', 'category_id', (select id from public.categories where slug = 'paddles'),
  'custom_title', 'Carbon practice paddle', 'condition', 'good', 'price_cents', 9000, 'accepts_offers', true, 'description', 'Fine.', 'pickup', true, 'ships', false,
  'images', jsonb_build_array(jsonb_build_object('path', '17171717-0000-0000-0000-000000000002/abab0000-0000-0000-0000-000000000001/a.jpg')),
  'location', jsonb_build_object('lat', 27.41, 'lng', -82.41, 'area_label', 'Lakewood Ranch, FL')));
select public.publish_listing(jsonb_build_object('id', 'abab0000-0000-0000-0000-000000000002', 'category_id', (select id from public.categories where slug = 'paddles'),
  'custom_title', 'Carbon paddle far away', 'condition', 'good', 'price_cents', 9000, 'accepts_offers', true, 'description', 'Fine.', 'pickup', true, 'ships', false,
  'images', jsonb_build_array(jsonb_build_object('path', '17171717-0000-0000-0000-000000000002/abab0000-0000-0000-0000-000000000002/a.jpg')),
  'location', jsonb_build_object('lat', 28.54, 'lng', -81.38, 'area_label', 'Orlando, FL')));
reset role;
set constraints all immediate;  -- the listing trigger is deferred to commit
select is(pg_temp.n('17171717-0000-0000-0000-000000000001', 'nearby_listing'), 1, 'nearby_listing: matches within the radius notify');
select is((select route from public.notifications where user_id = '17171717-0000-0000-0000-000000000001' and type = 'nearby_listing'),
  '/market/listing/abab0000-0000-0000-0000-000000000001', 'nearby_listing: only the nearby one, and it opens the listing');

-- Event: listing updates for savers ------------------------------------------------------------------------

insert into public.saved_listings (user_id, listing_id) values ('17171717-0000-0000-0000-000000000001', 'abab0000-0000-0000-0000-000000000001');
select pg_temp.act_as('17171717-0000-0000-0000-000000000002');
select public.set_listing_status('abab0000-0000-0000-0000-000000000001', 'pending');
reset role;
set constraints all immediate;
select is(pg_temp.n('17171717-0000-0000-0000-000000000001', 'listing_update'), 1, 'listing_update: savers hear when it goes pending');

-- Events: messages (with viewing suppression) and offers ------------------------------------------------------

select pg_temp.act_as('17171717-0000-0000-0000-000000000002');
select public.set_listing_status('abab0000-0000-0000-0000-000000000001', 'active');
reset role;
select pg_temp.act_as('17171717-0000-0000-0000-000000000001');
create temp table c (id uuid);
grant all on c to authenticated;
insert into c select public.start_conversation('abab0000-0000-0000-0000-000000000001');
insert into public.messages (conversation_id, body) values ((select id from c), 'Hi, still available?');
select public.make_offer('abab0000-0000-0000-0000-000000000001', 8000);
reset role;
select is(pg_temp.n('17171717-0000-0000-0000-000000000002', 'new_message'), 1, 'new_message: the seller is notified');
select is(pg_temp.n('17171717-0000-0000-0000-000000000002', 'offer'), 1, 'offer: the seller is notified');
select pg_temp.act_as('17171717-0000-0000-0000-000000000002');
select public.set_viewing((select id from c));
select public.mark_conversation_read((select id from c), 9223372036854775807);
reset role;
select pg_temp.act_as('17171717-0000-0000-0000-000000000001');
insert into public.messages (conversation_id, body) values ((select id from c), 'Can you do Saturday?');
reset role;
select is(pg_temp.n('17171717-0000-0000-0000-000000000002', 'new_message'), 1, 'new_message: no push while the thread is on screen');
select pg_temp.act_as('17171717-0000-0000-0000-000000000002');
select public.set_viewing((select id from c), false);
reset role;

-- Event: weekly digest ----------------------------------------------------------------------------------------

select pg_temp.act_as('17171717-0000-0000-0000-000000000001');
select public.set_notification_preference('weekly_digest', true);
reset role;
select is(public.send_weekly_digests(pg_temp.at('sunday10')), 0, 'weekly_digest: not outside Sunday 9 AM local');
select ok(public.send_weekly_digests(pg_temp.at('sunday9')) >= 1, 'weekly_digest: Sunday 9 AM local');
select is(pg_temp.n('17171717-0000-0000-0000-000000000001', 'weekly_digest'), 1, 'weekly_digest: opted-in users get one');
select perform from (select public.send_weekly_digests(pg_temp.at('sunday9')) as perform) x;
select is(pg_temp.n('17171717-0000-0000-0000-000000000001', 'weekly_digest'), 1, 'weekly_digest: once per week');
select is(pg_temp.n('17171717-0000-0000-0000-000000000003', 'weekly_digest'), 0, 'weekly_digest: never without opting in');

-- Delivery rules ---------------------------------------------------------------------------------------------

-- Park everything from earlier as already handled, then queue a controlled set for user A.
update public.notifications set push_status = 'sent', pushed_at = now() - interval '2 days' where push_status = 'pending';
select public.notify('17171717-0000-0000-0000-000000000001', 'offer', 'New offer', 'x', '/conversation/x', 'q:offer');
select public.notify('17171717-0000-0000-0000-000000000001', 'new_message', 'Dana', 'x', '/conversation/x', 'q:msg1');
select public.notify('17171717-0000-0000-0000-000000000001', 'new_message', 'Dana', 'y', '/conversation/x', 'q:msg2');
select public.notify('17171717-0000-0000-0000-000000000001', 'brand_deal', 'Deal', 'x', '/deals', 'q:deal');

create temp table claimed (id uuid, user_id uuid, title text, body text, route text, badge integer, run text);
insert into claimed select *, 'night' from public.claim_pending_notifications(500, pg_temp.at('night'));
select is((select count(*)::int from claimed where user_id = '17171717-0000-0000-0000-000000000001'), 0, 'quiet hours: nothing is pushed at 11 PM');
select is((select count(*)::int from public.notifications where user_id = '17171717-0000-0000-0000-000000000001' and dedupe_key like 'q:%' and held_until is not null), 3,
  'quiet hours: offers and messages are held');
select is((select push_error from public.notifications where dedupe_key = 'q:deal'), 'quiet_hours', 'quiet hours: deal pushes are skipped (still in Activity)');
select is((select held_until from public.notifications where dedupe_key = 'q:offer'), '2026-10-08 12:00+00'::timestamptz, 'quiet hours end at 8 AM local');

insert into claimed select *, 'morning' from public.claim_pending_notifications(500, pg_temp.at('morning'));
select is((select title || ' — ' || body from claimed where run = 'morning' and user_id = '17171717-0000-0000-0000-000000000001'),
  'While you were away — 1 offer update and 2 new messages.', 'quiet hours: one morning summary replaces the held pushes');
select is((select count(*)::int from public.notifications where dedupe_key like 'q:%' and push_error = 'summarized'), 3, 'the held pushes are marked summarized');
select ok((select badge > 0 from claimed where run = 'morning' and user_id = '17171717-0000-0000-0000-000000000001'), 'pushes carry the badge count');

-- Daily cap: 3 deal pushes a day; target-price alerts bypass it.
select public.notify('17171717-0000-0000-0000-000000000001', 'brand_deal', 'Deal ' || i, 'x', '/deals', 'cap:' || i) from generate_series(1, 4) i;
select public.notify('17171717-0000-0000-0000-000000000001', 'target_price', 'Target', 'x', '/deals', 'cap:target');
insert into claimed select *, 'noon' from public.claim_pending_notifications(500, pg_temp.at('noon'));
select is((select count(*)::int from claimed where run = 'noon' and title like 'Deal %'), 3, 'daily cap: three deal pushes');
select is((select push_error from public.notifications where dedupe_key = 'cap:4'), 'daily_cap', 'daily cap: the fourth stays in Activity only');
select is((select count(*)::int from claimed where run = 'noon' and title = 'Target'), 1, 'daily cap: target-price alerts aren’t capped');

select * from finish();
rollback;
