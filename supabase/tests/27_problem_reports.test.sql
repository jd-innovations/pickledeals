begin;
select plan(14);

insert into auth.users (id, email) values
  ('27272727-0000-0000-0000-000000000001', 'probseller@example.test'),
  ('27272727-0000-0000-0000-000000000002', 'probone@example.test'),
  ('27272727-0000-0000-0000-000000000003', 'probtwo@example.test'),
  ('27272727-0000-0000-0000-000000000004', 'probthree@example.test'),
  ('27272727-0000-0000-0000-000000000005', 'probstaff@example.test');

create function pg_temp.act_as(uid uuid, app_role text default null) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated', 'app_role', app_role)::text, true);
  set local role authenticated;
$$;

insert into public.listings (id, seller_id, category_id, custom_title, condition, price_cents, status, published_at) values
  ('27270000-0000-0000-0000-000000000001', '27272727-0000-0000-0000-000000000001', (select id from public.categories where slug = 'paddles'), 'Problem test paddle', 'good', 9000, 'active', now());

-- An offer at a store with a live code.
create temp table t as
select (select v.id from public.product_variants v join public.products p on p.id = v.product_id where p.status = 'active' limit 1) as vid,
       (select id from public.retailers where slug = 'joola-com') as rid;
insert into public.retailer_offers (id, variant_id, retailer_id, url, price_cents, external_ref)
select '27270000-0000-0000-0000-0000000000a1', vid, rid, 'https://joola.com/problem-test', 19999, 'problem-test' from t;
insert into public.promo_codes (id, retailer_id, code, title, discount_type, discount_value, verified_at)
select '27270000-0000-0000-0000-0000000000b1', rid, 'PROBTEST', 'Test code', 'percent', 10, now() from t;

create function pg_temp.live() returns boolean language sql security definer as $$
  select public.promo_is_live(p) from public.promo_codes p where p.id = '27270000-0000-0000-0000-0000000000b1';
$$;
grant execute on function pg_temp.live() to authenticated;

-- 1. Listings: "Not as described"
select pg_temp.act_as('27272727-0000-0000-0000-000000000002');
select lives_ok($$select public.file_report('listing', '27270000-0000-0000-0000-000000000001', 'not_as_described', 'Photos show a different paddle')$$,
                'a listing can be reported as not as described');
select throws_ok($$select public.file_report('user', '27272727-0000-0000-0000-000000000001', 'not_as_described')$$, '22023', null,
                 '"not as described" is for listings only');

-- 2. Offers and codes
select lives_ok($$select public.file_report('offer', '27270000-0000-0000-0000-0000000000a1', 'wrong_price', 'It is $229 on the site')$$,
                'an offer can be reported as the wrong price');
select throws_ok($$select public.file_report('offer', '27270000-0000-0000-0000-0000000000a1', 'scam')$$, '22023', null,
                 'offers only take the price and stock reasons');
select throws_ok($$select public.file_report('listing', '27270000-0000-0000-0000-000000000001', 'wrong_price')$$, '22023', null,
                 'listings don''t take the deal reasons');
select lives_ok($$select public.file_report('promo', '27270000-0000-0000-0000-0000000000b1', 'code_failed')$$, 'a code can be reported as not working');
select lives_ok($$select public.file_report('promo', '27270000-0000-0000-0000-0000000000b1', 'code_failed', 'Still not working')$$,
                'reporting again only updates the same report');
reset role;
select is(pg_temp.live(), true, 'one person isn''t enough to pull a code');

-- 3. Three different people within a day un-verify the code.
select pg_temp.act_as('27272727-0000-0000-0000-000000000003');
select public.file_report('promo', '27270000-0000-0000-0000-0000000000b1', 'code_failed');
reset role;
select is(pg_temp.live(), true, 'nor two');
select pg_temp.act_as('27272727-0000-0000-0000-000000000004');
select public.file_report('promo', '27270000-0000-0000-0000-0000000000b1', 'code_failed');
reset role;
select is(pg_temp.live(), false, 'three people saying it fails take it out of the app until it''s verified again');

-- Staff
select pg_temp.act_as('27272727-0000-0000-0000-000000000005', 'admin');
select is((select listing_status from public.staff_reports() where target_type = 'promo' and target_id = '27270000-0000-0000-0000-0000000000b1' limit 1),
          'unverified', 'staff see the code is unverified');
select ok((select target_label from public.staff_reports() where target_type = 'offer' limit 1) like '% at JOOLA% · $199.99 shown',
          'offer reports show the store and the price we showed');
select lives_ok(format($$select public.resolve_report(%L, 'actioned', 'Price fixed at source', true)$$,
                       (select id from public.reports where target_type = 'offer' limit 1)), 'staff turn the offer off');
reset role;
select is((select status::text from public.retailer_offers where id = '27270000-0000-0000-0000-0000000000a1'), 'inactive', 'and it''s off');

select * from finish();
rollback;
