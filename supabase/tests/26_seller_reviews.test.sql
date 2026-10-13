begin;
select plan(30);

insert into auth.users (id, email) values
  ('26262626-0000-0000-0000-000000000001', 'reviewseller@example.test'),
  ('26262626-0000-0000-0000-000000000002', 'reviewbuyer@example.test'),
  ('26262626-0000-0000-0000-000000000003', 'reviewoutsider@example.test'),
  ('26262626-0000-0000-0000-000000000004', 'reviewstaff@example.test');
update public.profiles set display_name = 'Jordan R.' where id = '26262626-0000-0000-0000-000000000001';
update public.profiles set display_name = 'Dana B.' where id = '26262626-0000-0000-0000-000000000002';

create function pg_temp.act_as(uid uuid, app_role text default null) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated', 'app_role', app_role)::text, true);
  set local role authenticated;
$$;
create function pg_temp.as_anon() returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
  set local role anon;
$$;

insert into public.listings (id, seller_id, category_id, custom_title, condition, price_cents, status, published_at) values
  ('26260000-0000-0000-0000-000000000001', '26262626-0000-0000-0000-000000000001', (select id from public.categories where slug = 'paddles'), 'Review test paddle', 'good', 15000, 'active', now());
insert into public.listing_private (listing_id) values ('26260000-0000-0000-0000-000000000001');

create temp table r (k text primary key, v text);
grant all on r to authenticated, anon;

select ok((select relrowsecurity from pg_class where oid = 'public.seller_reviews'::regclass), 'RLS is on for seller reviews');

-- The buyer opens a thread with an offer; the outsider never messages.
select pg_temp.act_as('26262626-0000-0000-0000-000000000002');
select lives_ok($$select public.make_offer('26260000-0000-0000-0000-000000000001', 12000, 'Would you take 120?')$$, 'the buyer opens a thread with an offer');
reset role;

-- Buyer linking ------------------------------------------------------------------------------------

select pg_temp.act_as('26262626-0000-0000-0000-000000000001');
select is((select array_agg(buyer_id) from public.listing_buyer_candidates('26260000-0000-0000-0000-000000000001')),
          array['26262626-0000-0000-0000-000000000002'::uuid], 'the seller sees who messaged about the listing');
select throws_ok($$select public.set_listing_status('26260000-0000-0000-0000-000000000001', 'sold', '26262626-0000-0000-0000-000000000003')$$,
                 '22023', 'Pick someone who messaged you about this listing.', 'the buyer must have messaged about the listing');
reset role;
select pg_temp.act_as('26262626-0000-0000-0000-000000000003');
select is((select count(*)::int from public.listing_buyer_candidates('26260000-0000-0000-0000-000000000001')), 0, 'only the seller sees the candidates');
reset role;

select pg_temp.act_as('26262626-0000-0000-0000-000000000001');
select lives_ok($$select public.set_listing_status('26260000-0000-0000-0000-000000000001', 'sold', '26262626-0000-0000-0000-000000000002', 13000)$$,
                'the seller marks it sold to the buyer');
reset role;
select is((select sold_to_user_id from public.listings where id = '26260000-0000-0000-0000-000000000001'),
          '26262626-0000-0000-0000-000000000002'::uuid, 'the sale is linked to the buyer');
select is((select route from public.notifications where user_id = '26262626-0000-0000-0000-000000000002' and type = 'review'),
          '/rate-seller/26260000-0000-0000-0000-000000000001', 'the buyer is asked to rate the purchase');
select is((select email_status::text from public.notifications where user_id = '26262626-0000-0000-0000-000000000002' and type = 'review'),
          'pending', 'the request is queued for email');
select is((select m.meta ->> 'buyer_id' from public.messages m join public.conversations c on c.id = m.conversation_id
            where c.listing_id = '26260000-0000-0000-0000-000000000001' and m.kind = 'status_event' and m.meta ->> 'status' = 'sold'),
          '26262626-0000-0000-0000-000000000002', 'the sold line in the buyer''s thread carries the Rate seller button');

-- Email: unread an hour later, the request goes out with the item's name.
select is((select listing_title from public.claim_pending_emails(50, now() + interval '2 hours')
            where user_id = '26262626-0000-0000-0000-000000000002' and kind = 'review'),
          'Review test paddle', 'an unread request is emailed after an hour, naming the item');

-- Writing a review -----------------------------------------------------------------------------------

select pg_temp.act_as('26262626-0000-0000-0000-000000000003');
select is(public.my_review('26260000-0000-0000-0000-000000000001'), null, 'other people get nothing to review');
select throws_ok($$select public.submit_review('26260000-0000-0000-0000-000000000001', 5)$$, '42501', null, 'only the linked buyer can review');
reset role;

select pg_temp.act_as('26262626-0000-0000-0000-000000000002');
select is((public.my_review('26260000-0000-0000-0000-000000000001') ->> 'open')::boolean, true, 'the buyer can review for 30 days');
select throws_ok($$select public.submit_review('26260000-0000-0000-0000-000000000001', 6)$$, '22023', 'Choose 1 to 5 stars.', 'ratings are 1 to 5');
insert into r values ('rid', public.submit_review('26260000-0000-0000-0000-000000000001', 5, '  Smooth meet-up, exactly as described.  ')::text);
select lives_ok($$select public.submit_review('26260000-0000-0000-0000-000000000001', 4, 'Smooth meet-up, a few scuffs.')$$, 'the buyer can edit it');
reset role;

select is((select rating::int from public.seller_reviews where listing_id = '26260000-0000-0000-0000-000000000001'), 4, 'the edit replaces the rating');
select is((select count(*)::int from public.seller_reviews where listing_id = '26260000-0000-0000-0000-000000000001'), 1, 'one review per sale');
select is((select title from public.notifications where user_id = '26262626-0000-0000-0000-000000000001' and type = 'review'),
          'Dana left you a 5-star review', 'the seller hears about the first version');
select is((select count(*)::int from public.notifications where user_id = '26262626-0000-0000-0000-000000000001' and type = 'review'), 1,
          'edits don''t notify again');

-- Reading ----------------------------------------------------------------------------------------------

select pg_temp.as_anon();
select throws_ok('select * from public.seller_reviews', '42501', null, 'the table itself is closed');
select is(public.seller_reviews_for('26262626-0000-0000-0000-000000000001') -> 'average', '4.0'::jsonb, 'guests see the average');
select is((public.seller_reviews_for('26262626-0000-0000-0000-000000000001') -> 'items' -> 0 ->> 'reviewer_name'), 'Dana B.', 'and who wrote each review');
reset role;

-- The window ---------------------------------------------------------------------------------------------

update public.listings set sold_at = now() - interval '31 days' where id = '26260000-0000-0000-0000-000000000001';
select pg_temp.act_as('26262626-0000-0000-0000-000000000002');
select throws_ok($$select public.submit_review('26260000-0000-0000-0000-000000000001', 1)$$, '22023', 'Reviews close 30 days after the sale.', 'reviews close after 30 days');
select throws_ok($$select public.delete_review('26260000-0000-0000-0000-000000000001')$$, '22023', null, 'and so does deleting');
reset role;
update public.listings set sold_at = now() where id = '26260000-0000-0000-0000-000000000001';

-- Reports and hiding -------------------------------------------------------------------------------------

select pg_temp.act_as('26262626-0000-0000-0000-000000000002');
select throws_ok(format($$select public.file_report('review', %L, 'spam')$$, (select v from r where k = 'rid')), '22023', 'Nothing to report.',
                 'people can''t report their own review');
reset role;
select pg_temp.act_as('26262626-0000-0000-0000-000000000001');
insert into r values ('report', public.file_report('review', (select v::uuid from r where k = 'rid'), 'offensive', 'Not true')::text);
reset role;

-- The reviewer deletes their account: the rating stays, without a name.
delete from auth.users where id = '26262626-0000-0000-0000-000000000002';
select is((public.seller_reviews_for('26262626-0000-0000-0000-000000000001') -> 'items' -> 0 ->> 'reviewer_name'), 'Former member',
          'a deleted reviewer shows as Former member');

select pg_temp.act_as('26262626-0000-0000-0000-000000000004', 'admin');
select is((select target_label from public.staff_reports() where id = (select v::uuid from r where k = 'report')),
          '★4 review of Jordan R.', 'staff see the reported review');
select lives_ok(format($$select public.resolve_report(%L, 'actioned', 'Abusive', true)$$, (select v from r where k = 'report')), 'staff hide it');
reset role;
select is((public.seller_reviews_for('26262626-0000-0000-0000-000000000001') ->> 'count')::int, 0, 'hidden reviews don''t show or count');

select * from finish();
rollback;
