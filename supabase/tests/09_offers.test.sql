begin;
select plan(51);

insert into auth.users (id, email) values
  ('16161616-0000-0000-0000-000000000001', 'offerseller@example.test'),
  ('16161616-0000-0000-0000-000000000002', 'offerbuyer@example.test'),
  ('16161616-0000-0000-0000-000000000003', 'offeroutsider@example.test');
update public.profiles set display_name = 'Jordan R.' where id = '16161616-0000-0000-0000-000000000001';
update public.profiles set display_name = 'Dana B.' where id = '16161616-0000-0000-0000-000000000002';

create function pg_temp.act_as(uid uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  set local role authenticated;
$$;

-- Two listings by the seller: L1 takes offers (floor $100), L2 doesn't.
insert into public.listings (id, seller_id, category_id, custom_title, condition, price_cents, status, published_at, accepts_offers) values
  ('eeee0000-0000-0000-0000-000000000001', '16161616-0000-0000-0000-000000000001', (select id from public.categories where slug = 'paddles'), 'CRBN 3X test', 'like_new', 15000, 'active', now(), true),
  ('eeee0000-0000-0000-0000-000000000002', '16161616-0000-0000-0000-000000000001', (select id from public.categories where slug = 'paddles'), 'No offers paddle', 'good', 9000, 'active', now(), false);
insert into public.listing_private (listing_id, hide_offers_below_cents) values ('eeee0000-0000-0000-0000-000000000001', 10000), ('eeee0000-0000-0000-0000-000000000002', null);

create temp table r (k text primary key, v jsonb);
grant all on r to authenticated;
create function pg_temp.offer(k text) returns uuid language sql as $$ select (v ->> 'offer_id')::uuid from r where r.k = offer.k $$;
create function pg_temp.status(id uuid) returns text language sql security definer as $$ select status::text from public.marketplace_offers where marketplace_offers.id = status.id $$;
grant execute on function pg_temp.offer(text), pg_temp.status(uuid) to authenticated;

select ok((select bool_and(relrowsecurity) from pg_class where oid in ('public.marketplace_offers'::regclass, 'public.agreements'::regclass)), 'RLS is on for offers and agreements');

-- make_offer ------------------------------------------------------------------------------------------

select pg_temp.act_as('16161616-0000-0000-0000-000000000001');
select throws_ok($$select public.make_offer('eeee0000-0000-0000-0000-000000000001', 12000)$$, '22023', 'This is your listing.', 'sellers can’t offer on their own listing');
reset role;

select pg_temp.act_as('16161616-0000-0000-0000-000000000002');
select throws_ok($$select public.make_offer('eeee0000-0000-0000-0000-000000000002', 8000)$$, '22023', 'The seller isn’t taking offers on this listing.', 'listings can opt out of offers');
select throws_ok($$select public.make_offer('eeee0000-0000-0000-0000-000000000001', 50)$$, '22023', 'Enter an amount of at least $1.', 'offers need a real amount');

insert into r values ('low', public.make_offer('eeee0000-0000-0000-0000-000000000001', 9000, 'Would you take 90?'));
select is((select v ->> 'status' from r where k = 'low'), 'declined', 'offers below the seller’s floor are declined at once');
select is((select count(*)::int from public.messages where offer_id = pg_temp.offer('low')), 0, 'auto-declined offers leave no line in the thread');

insert into r values ('o1', public.make_offer('eeee0000-0000-0000-0000-000000000001', 12000, 'Hey, is the CRBN still available?'));
select is((select v ->> 'status' from r where k = 'o1'), 'pending', 'a buyer makes an offer');
select ok((select expires_at between now() + interval '47 hours' and now() + interval '49 hours' from public.marketplace_offers where id = pg_temp.offer('o1')), 'offers expire after 48 hours');
select is((select body from public.messages where offer_id = pg_temp.offer('o1') and kind = 'offer_event'), 'Dana offered $120', 'the offer leaves a line in the thread');
select is((select meta ->> 'action' from public.messages where offer_id = pg_temp.offer('o1')), 'made', 'the line says what happened');
select throws_ok($$select public.make_offer('eeee0000-0000-0000-0000-000000000001', 12500)$$, '22023', 'There’s already an open offer in this chat.', 'one pending offer per thread');
select throws_ok($$select public.accept_offer(pg_temp.offer('o1'))$$, '42501', 'Waiting for the other person to respond.', 'you can’t accept your own offer');
select throws_ok($$select public.counter_offer(pg_temp.offer('o1'), 13000)$$, '42501', 'Waiting for the other person to respond.', 'you can’t counter your own offer');
select throws_ok($$select public.decline_offer(pg_temp.offer('o1'))$$, '42501', 'Waiting for the other person to respond.', 'you can’t decline your own offer');
select is((select offer_awaiting_me from public.my_conversations()), false, 'the buyer waits');
select is((select unread from public.my_conversations()), 0, 'your own offer line isn’t unread for you');
reset role;

select is((select count(*)::int from public.notifications where user_id = '16161616-0000-0000-0000-000000000001' and type = 'offer'), 1, 'the seller is notified');

-- Seller's view and counter ---------------------------------------------------------------------------

select pg_temp.act_as('16161616-0000-0000-0000-000000000001');
select is((select count(*)::int from public.marketplace_offers), 1, 'the seller never sees offers below the floor');
select ok((select offer_awaiting_me and offer_amount_cents = 12000 from public.my_conversations()), 'the seller’s inbox shows the open offer');
select is((select open_offers from public.my_listing_activity() where listing_id = 'eeee0000-0000-0000-0000-000000000001'), 1, 'My listings counts open offers');
select throws_ok($$select public.withdraw_offer(pg_temp.offer('o1'))$$, '42501', 'Only the person who made this offer can withdraw it.', 'only the proposer withdraws');
select throws_ok($$select public.counter_offer(pg_temp.offer('o1'), 12000)$$, '22023', 'That’s the same amount. Accept the offer instead.', 'a counter must change the amount');
insert into r values ('c1', jsonb_build_object('offer_id', public.counter_offer(pg_temp.offer('o1'), 14000, 'Lowest I can do is 140 — it’s like new.')));
select is(pg_temp.status(pg_temp.offer('o1')), 'countered', 'countering closes the previous offer');
select is((select parent_offer_id from public.marketplace_offers where id = pg_temp.offer('c1')), pg_temp.offer('o1'), 'counters chain to their parent');
select is((select (meta ->> 'previous_cents')::int from public.messages where offer_id = pg_temp.offer('c1')), 12000, 'the counter line remembers the previous amount');
select throws_ok($$select public.counter_offer(pg_temp.offer('c1'), 13500)$$, '42501', 'Waiting for the other person to respond.', 'turns alternate');
reset role;

-- Buyer counters back, seller accepts ------------------------------------------------------------------

select pg_temp.act_as('16161616-0000-0000-0000-000000000002');
select throws_ok($$select public.accept_offer(pg_temp.offer('o1'))$$, '22023', 'This offer is no longer open.', 'closed offers can’t be accepted');
insert into r values ('c2', jsonb_build_object('offer_id', public.counter_offer(pg_temp.offer('c1'), 13500, 'Meet in the middle?')));
select is(pg_temp.status(pg_temp.offer('c1')), 'countered', 'the buyer counters the counter');
reset role;

select pg_temp.act_as('16161616-0000-0000-0000-000000000001');
create temp table a (id uuid);
grant all on a to authenticated;
insert into a select public.accept_offer(pg_temp.offer('c2'));
select is(pg_temp.status(pg_temp.offer('c2')), 'accepted', 'the seller accepts');
select ok((select amount_cents = 13500 and buyer_id = '16161616-0000-0000-0000-000000000002' from public.agreements where id = (select id from a)), 'accepting writes an agreement');
select is((select status::text from public.listings where id = 'eeee0000-0000-0000-0000-000000000001'), 'active', 'accepting doesn’t change the listing status');
select is((select body from public.messages where offer_id = pg_temp.offer('c2') and meta ->> 'action' = 'accepted'), 'Offer accepted · $135', 'the thread shows the acceptance');
select throws_ok($$select public.accept_offer(pg_temp.offer('c2'))$$, '22023', 'This offer is no longer open.', 'an offer is accepted once');
reset role;
select is((select count(*)::int from public.notifications where user_id = '16161616-0000-0000-0000-000000000002' and type = 'offer' and title like 'Offer accepted%'), 1,
  'the buyer hears about the acceptance');

-- Decline and withdraw ---------------------------------------------------------------------------------

select pg_temp.act_as('16161616-0000-0000-0000-000000000002');
insert into r values ('o2', public.make_offer('eeee0000-0000-0000-0000-000000000001', 11000));
select lives_ok($$select public.withdraw_offer(pg_temp.offer('o2'))$$, 'the proposer withdraws');
select is(pg_temp.status(pg_temp.offer('o2')), 'withdrawn', 'withdrawn offers stay on record');
select throws_ok($$select public.withdraw_offer(pg_temp.offer('o2'))$$, '22023', 'This offer is no longer open.', 'only pending offers can be withdrawn');
insert into r values ('o3', public.make_offer('eeee0000-0000-0000-0000-000000000001', 11500));
reset role;
select pg_temp.act_as('16161616-0000-0000-0000-000000000001');
select lives_ok($$select public.decline_offer(pg_temp.offer('o3'))$$, 'the seller declines');
select is(pg_temp.status(pg_temp.offer('o3')), 'declined', 'declined offers stay on record');
reset role;

-- Outsiders ---------------------------------------------------------------------------------------------

select pg_temp.act_as('16161616-0000-0000-0000-000000000003');
select is_empty($$select 1 from public.marketplace_offers$$, 'outsiders can’t see offers');
select is_empty($$select 1 from public.agreements$$, 'outsiders can’t see agreements');
select throws_ok($$select public.decline_offer(pg_temp.offer('o3'))$$, '42501', 'offer not found', 'outsiders can’t act on offers');
reset role;
select set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
set local role anon;
select throws_ok($$select public.make_offer('eeee0000-0000-0000-0000-000000000001', 12000)$$, '42501', null, 'guests can’t make offers (D6)');
reset role;

-- Expiry and reminders --------------------------------------------------------------------------------------

select pg_temp.act_as('16161616-0000-0000-0000-000000000002');
insert into r values ('o4', public.make_offer('eeee0000-0000-0000-0000-000000000001', 12500));
reset role;
update public.marketplace_offers set expires_at = now() + interval '3 hours' where id = pg_temp.offer('o4');
select is(public.expire_offers(), 0, 'nothing expires early');
select is((select count(*)::int from public.notifications where user_id = '16161616-0000-0000-0000-000000000001' and dedupe_key = 'offer:' || pg_temp.offer('o4') || ':expiring'), 1,
  'the responder is reminded before expiry');
update public.marketplace_offers set expires_at = now() - interval '1 minute' where id = pg_temp.offer('o4');
select is(public.expire_offers(), 1, 'the cron expires stale offers');
select is(pg_temp.status(pg_temp.offer('o4')), 'expired', 'expired offers are closed');
select ok(exists (select 1 from cron.job where jobname = 'expire-offers'), 'expiry runs on pg_cron');

-- Selling closes open offers ------------------------------------------------------------------------------

select pg_temp.act_as('16161616-0000-0000-0000-000000000002');
insert into r values ('o5', public.make_offer('eeee0000-0000-0000-0000-000000000001', 13000));
reset role;
select pg_temp.act_as('16161616-0000-0000-0000-000000000001');
select lives_ok($$select public.set_listing_status('eeee0000-0000-0000-0000-000000000001', 'sold', '16161616-0000-0000-0000-000000000002', 13500)$$, 'the seller marks it sold');
select is(pg_temp.status(pg_temp.offer('o5')), 'expired', 'open offers close when the listing sells');
reset role;
select pg_temp.act_as('16161616-0000-0000-0000-000000000002');
select throws_ok($$select public.make_offer('eeee0000-0000-0000-0000-000000000001', 13000)$$, '22023', 'This listing isn’t taking offers right now.', 'sold listings take no offers');
reset role;

select * from finish();
rollback;
