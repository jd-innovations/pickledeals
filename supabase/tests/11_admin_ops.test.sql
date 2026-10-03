begin;
select plan(49);

insert into auth.users (id, email) values
  ('16161616-0000-0000-0000-000000000001', 'opsseller@example.test'),
  ('16161616-0000-0000-0000-000000000002', 'opsbuyer@example.test'),
  ('16161616-0000-0000-0000-000000000003', 'opseditor@example.test'),
  ('16161616-0000-0000-0000-000000000004', 'opsadmin@example.test');
insert into public.user_roles (user_id, role) values
  ('16161616-0000-0000-0000-000000000003', 'editor'),
  ('16161616-0000-0000-0000-000000000004', 'admin');
update public.profiles set display_name = 'Sam O.' where id = '16161616-0000-0000-0000-000000000001';
update public.profiles set display_name = 'Bea Y.' where id = '16161616-0000-0000-0000-000000000002';

create function pg_temp.act_as(uid uuid, app_role text default null) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated', 'app_role', app_role)::text, true);
  set local role authenticated;
$$;
create function pg_temp.as_anon() returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
  set local role anon;
$$;

insert into public.listings (id, seller_id, category_id, custom_title, condition, price_cents, status, published_at) values
  ('eeee0000-0000-0000-0000-000000000001', '16161616-0000-0000-0000-000000000001', (select id from public.categories where slug = 'paddles'),
   'Ops test paddle', 'good', 12000, 'active', now()),
  ('eeee0000-0000-0000-0000-000000000002', '16161616-0000-0000-0000-000000000001', (select id from public.categories where slug = 'paddles'),
   'Ops second paddle', 'fair', 8000, 'pending', now()),
  ('eeee0000-0000-0000-0000-000000000003', '16161616-0000-0000-0000-000000000001', (select id from public.categories where slug = 'paddles'),
   'Handmade cedar paddle', 'like_new', 9000, 'active', now());
insert into public.listing_catalog_reviews (id, listing_id) values ('eeee1111-0000-0000-0000-000000000001', 'eeee0000-0000-0000-0000-000000000003');

-- Structure -----------------------------------------------------------------------------------------

select ok((select bool_and(relrowsecurity) from pg_class where oid in ('public.staff_actions'::regclass, 'public.user_suspensions'::regclass)),
  'RLS is on for the new tables');
select ok(not has_column_privilege('authenticated', 'public.listings', 'status', 'UPDATE'), 'nobody updates listing status directly any more');
select ok(not has_function_privilege('authenticated', 'public.takedown_listing(uuid, text, boolean)', 'EXECUTE'), 'takedown is internal');
select ok(not has_function_privilege('anon', 'public.staff_listings(text, text, uuid, integer, integer)', 'EXECUTE'), 'guests can’t call staff RPCs');

-- Staff only ------------------------------------------------------------------------------------------

select pg_temp.act_as('16161616-0000-0000-0000-000000000002');
select throws_ok($$select * from public.staff_listings()$$, '42501', null, 'members can’t search listings');
select throws_ok($$select public.staff_set_listing_status('eeee0000-0000-0000-0000-000000000001', 'remove', 'spam')$$, '42501', null,
  'members can’t take listings down');
select throws_ok($$select public.staff_queue_counts()$$, '42501', null, 'members can’t read queues');
select is_empty($$select 1 from public.staff_actions$$, 'members can’t read the audit log');
select throws_ok($$update public.listings set status = 'removed' where id = 'eeee0000-0000-0000-0000-000000000001'$$, '42501', null,
  'members can’t remove listings directly');
reset role;

-- Listing takedown and restore -------------------------------------------------------------------------

select pg_temp.act_as('16161616-0000-0000-0000-000000000003', 'editor');
select is((select count(*)::int from public.staff_listings('Ops test')), 1, 'staff search listings by title');
select is((select count(*)::int from public.staff_listings(null, 'pending', '16161616-0000-0000-0000-000000000001')), 1, 'and filter by status and seller');
select throws_ok($$select public.staff_set_listing_status('eeee0000-0000-0000-0000-000000000001', 'remove', '')$$, '22023',
  'Give a reason. The seller sees it.', 'a takedown needs a reason');
select lives_ok($$select public.staff_set_listing_status('eeee0000-0000-0000-0000-000000000001', 'remove', 'Counterfeit listing')$$,
  'editors take a listing down');
select throws_ok($$select public.staff_set_listing_status('eeee0000-0000-0000-0000-000000000001', 'remove', 'again')$$, '22023', null,
  'a removed listing can’t be removed twice');
reset role;

select is((select status::text from public.listings where id = 'eeee0000-0000-0000-0000-000000000001'), 'removed', 'the listing is removed');
select ok((select removed_by_staff and removed_at is not null from public.listings where id = 'eeee0000-0000-0000-0000-000000000001'),
  'staff removal is recorded');
select is((select body from public.notifications where user_id = '16161616-0000-0000-0000-000000000001' and title = 'Your listing was removed'),
  'Ops test paddle: Counterfeit listing', 'the seller is told why');
select is((select action from public.staff_actions where target_id = 'eeee0000-0000-0000-0000-000000000001'), 'listing.remove', 'the takedown is logged');

select pg_temp.act_as('16161616-0000-0000-0000-000000000001');
select is((select removed_reason from public.listings where id = 'eeee0000-0000-0000-0000-000000000001'), 'Counterfeit listing',
  'the seller can read the reason');
select throws_ok($$select public.set_listing_status('eeee0000-0000-0000-0000-000000000001', 'active')$$, '22023', null,
  'sellers can’t undo a takedown');
reset role;
select pg_temp.as_anon();
select is_empty($$select 1 from public.listings where id = 'eeee0000-0000-0000-0000-000000000001'$$, 'a removed listing is hidden from the public');
reset role;

select pg_temp.act_as('16161616-0000-0000-0000-000000000003', 'editor');
select lives_ok($$select public.staff_set_listing_status('eeee0000-0000-0000-0000-000000000001', 'restore')$$, 'staff restore a takedown');
reset role;
select ok((select status = 'active' and not removed_by_staff and removed_reason is null and removed_at is null
             from public.listings where id = 'eeee0000-0000-0000-0000-000000000001'), 'restoring clears the removal');

-- A seller's own removal can't be "restored" by staff.
select pg_temp.act_as('16161616-0000-0000-0000-000000000001');
select lives_ok($$select public.set_listing_status('eeee0000-0000-0000-0000-000000000002', 'removed')$$, 'sellers still remove their own listings');
reset role;
select pg_temp.act_as('16161616-0000-0000-0000-000000000003', 'editor');
select throws_ok($$select public.staff_set_listing_status('eeee0000-0000-0000-0000-000000000002', 'restore')$$, '22023',
  'Only listings removed by staff can be restored.', 'staff only restore their own takedowns');
reset role;

-- A buyer opens a thread before the seller is suspended.
select pg_temp.act_as('16161616-0000-0000-0000-000000000002');
create temp table t (cid uuid);
grant all on t to authenticated;
insert into t select public.start_conversation('eeee0000-0000-0000-0000-000000000003');
reset role;

-- Suspensions ------------------------------------------------------------------------------------------

select pg_temp.act_as('16161616-0000-0000-0000-000000000003', 'editor');
select throws_ok($$select public.staff_suspend_user('16161616-0000-0000-0000-000000000001', 'Scams')$$, '42501', null, 'editors can’t suspend');
select is((select email from public.staff_users('Sam')), null, 'editors don’t see emails');
select is((select count(*)::int from public.staff_users('opsseller@')), 0, 'or search by email');
reset role;

select pg_temp.act_as('16161616-0000-0000-0000-000000000004', 'admin');
select is((select email from public.staff_users('opsseller@')), 'opsseller@example.test', 'admins search by email');
select throws_ok($$select public.staff_suspend_user('16161616-0000-0000-0000-000000000003', 'nope')$$, '22023', 'Staff accounts can’t be suspended.',
  'staff can’t be suspended');
select is((select public.staff_suspend_user('16161616-0000-0000-0000-000000000001', 'Repeated scam reports')), 2,
  'suspending hides the seller’s live listings');
select throws_ok($$select public.staff_suspend_user('16161616-0000-0000-0000-000000000001', 'again')$$, '22023', null, 'one active suspension at a time');
select ok((select suspended from public.staff_users('Sam')), 'the user shows as suspended');
reset role;

select is((select removed_reason from public.listings where id = 'eeee0000-0000-0000-0000-000000000001'), 'Seller account suspended',
  'hidden listings say why');

select pg_temp.act_as('16161616-0000-0000-0000-000000000001');
select is((select count(*)::int from public.user_suspensions), 1, 'users can see their own suspension');
select throws_ok($$select public.publish_listing(jsonb_build_object('id', gen_random_uuid(), 'custom_title', 'New paddle', 'condition', 'good',
    'price_cents', 5000, 'category_id', (select id from public.categories where slug = 'paddles'), 'pickup', true,
    'images', jsonb_build_array(jsonb_build_object('path', '16161616-0000-0000-0000-000000000001/x/a.jpg')),
    'location', jsonb_build_object('lat', 27.33, 'lng', -82.53)))$$,
  '42501', 'Your account is suspended. Contact PickleDeals support if you think this is a mistake.', 'suspended users can’t publish');
reset role;

select pg_temp.act_as('16161616-0000-0000-0000-000000000001');
select throws_ok($$insert into public.messages (conversation_id, body) values ((select cid from t), 'Hi')$$, '42501', null,
  'suspended users can’t message');
reset role;
select pg_temp.act_as('16161616-0000-0000-0000-000000000002');
select lives_ok($$insert into public.messages (conversation_id, body) values ((select cid from t), 'Still there?')$$, 'others still can');
reset role;

select pg_temp.act_as('16161616-0000-0000-0000-000000000004', 'admin');
select is((select public.staff_unsuspend_user('16161616-0000-0000-0000-000000000001')), 2, 'lifting the suspension restores hidden listings');
reset role;
select is((select status::text from public.listings where id = 'eeee0000-0000-0000-0000-000000000002'), 'removed',
  'listings the seller removed stay removed');
select pg_temp.act_as('16161616-0000-0000-0000-000000000001');
select lives_ok($$insert into public.messages (conversation_id, body) values ((select cid from t), 'Yes!')$$, 'and the user can message again');
reset role;

-- Reports take listings down through the same path --------------------------------------------------------

select pg_temp.act_as('16161616-0000-0000-0000-000000000002');
select lives_ok($$select public.file_report('listing', 'eeee0000-0000-0000-0000-000000000003', 'counterfeit')$$, 'a member reports a listing');
reset role;
select pg_temp.act_as('16161616-0000-0000-0000-000000000003', 'editor');
select lives_ok($$select public.resolve_report((select id from public.reports where target_id = 'eeee0000-0000-0000-0000-000000000003'),
  'actioned', 'Fake brand', true)$$, 'staff remove a reported listing');
reset role;
select ok((select status = 'removed' and removed_by_staff and removed_reason = 'Fake brand' from public.listings
            where id = 'eeee0000-0000-0000-0000-000000000003'), 'the report takedown is a staff takedown');

-- Review queue: promote a custom listing (D3) ----------------------------------------------------------------

select pg_temp.act_as('16161616-0000-0000-0000-000000000003', 'editor');
select is((select public.promote_listing_review('eeee1111-0000-0000-0000-000000000001', (select id from public.brands order by slug limit 1), 'Cedar Classic')),
  (select b.slug || '-cedar-classic' from public.brands b order by b.slug limit 1), 'promoting creates a draft product');
reset role;
select is((select product_id from public.listings where id = 'eeee0000-0000-0000-0000-000000000003'), null,
  'the listing isn’t linked to an unpublished product');
update public.products set status = 'active' where name = 'Cedar Classic';
select isnt((select product_id from public.listings where id = 'eeee0000-0000-0000-0000-000000000003'), null,
  'publishing the product links the listing');

-- Promos and metrics ----------------------------------------------------------------------------------------

select pg_temp.act_as('16161616-0000-0000-0000-000000000003', 'editor');
update public.promo_codes set verified_at = now() where id = (select id from public.promo_codes order by id limit 1);
select is((select verified_by from public.promo_codes order by id limit 1),
  '16161616-0000-0000-0000-000000000003'::uuid, 'verifying a promo records who did it');
select throws_ok($$select public.staff_metrics(7)$$, '42501', null, 'metrics are admin-only');
reset role;

select * from finish();
rollback;
