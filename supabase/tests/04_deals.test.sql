begin;
select plan(30);

insert into auth.users (id, email) values
  ('eeeeeeee-0000-0000-0000-000000000001', 'user4@example.test'),
  ('eeeeeeee-0000-0000-0000-000000000002', 'editor4@example.test');

create function pg_temp.act_as(uid uuid, app_role text) returns void language sql as $$
  select set_config('request.jwt.claims',
    json_build_object('sub', uid, 'role', 'authenticated', 'app_role', app_role)::text, true);
  set local role authenticated;
$$;

-- A clean variant with no seeded offers: Perseus CFS 14mm (MSRP $179.95).
create temp table t as
select v.id as vid, p.id as pid from public.product_variants v join public.products p on p.id = v.product_id
 where p.slug = 'joola-perseus-cfs' and v.label = '14mm';
grant select on t to anon, authenticated;

create function pg_temp.auto_deal() returns public.deals language sql as $$
  select * from public.deals where variant_id = (select vid from t) and origin = 'auto' and status = 'active';
$$;

-- Structure ---------------------------------------------------------------------------------------

select ok((select bool_and(relrowsecurity) from pg_class where oid in (
  'public.deals'::regclass, 'public.collections'::regclass, 'public.collection_items'::regclass, 'public.placements'::regclass)),
  'RLS is on for every deals table');
select is(position('affiliate' in pg_get_viewdef('public.deal_feed'::regclass)), 0, 'the deal feed never reads affiliate data');
select is(position('placements' in pg_get_viewdef('public.deal_feed'::regclass)), 0, 'sponsorship never feeds the organic deal feed');

-- Detection ---------------------------------------------------------------------------------------

insert into public.retailer_offers (variant_id, retailer_id, url, price_cents)
select (select vid from t), id, 'https://baseline-sports.example/cfs14', 17000 from public.retailers where slug = 'baseline-sports';
select is((pg_temp.auto_deal()).id, null, 'no deal for a price only 5% under MSRP');

update public.retailer_offers set price_cents = 14000 where url = 'https://baseline-sports.example/cfs14';
select is((pg_temp.auto_deal()).kind::text, 'sale', '15%+ under MSRP becomes a sale deal');
select is((pg_temp.auto_deal()).headline, '22% off MSRP', 'sale headline rounds the saving down');
create temp table first_deal as select (pg_temp.auto_deal()).id as id;

insert into public.promo_codes (retailer_id, code, title, discount_type, discount_value, verified_at)
select id, 'CFS10', '$10 off', 'amount', 1000, now() from public.retailers where slug = 'baseline-sports';
select is((pg_temp.auto_deal()).kind::text, 'promo', 'a live code turns it into a promo deal');
select is((pg_temp.auto_deal()).headline, 'Extra $10 off with code CFS10', 'promo headline uses whole dollars');
select is((pg_temp.auto_deal()).id, (select id from first_deal), 'the deal keeps its id while it stays valid');

update public.promo_codes set status = 'removed' where code = 'CFS10';
update public.retailer_offers set price_cents = 17900 where url = 'https://baseline-sports.example/cfs14';
select is((pg_temp.auto_deal()).id, null, 'the deal expires when it stops qualifying');
select is((select status::text from public.deals where id = (select id from first_deal)), 'expired', 'expired deals are kept, not deleted');

-- D1: an Amazon API price never creates an auto deal.
insert into public.retailer_offers (variant_id, retailer_id, url, price_cents, price_source)
select (select vid from t), id, 'https://www.amazon.com/dp/D1DEAL', 9900, 'api' from public.retailers where slug = 'amazon';
select is((pg_temp.auto_deal()).id, null, 'D1: check-price offers never become auto deals');

-- Feed ----------------------------------------------------------------------------------------------

set local role anon;
select throws_ok('select * from public.deals', '42501', null, 'anon cannot read the deals table directly');
select throws_ok('select * from public.placements', '42501', null, 'anon cannot read placements directly');
select ok((select count(*) from public.deal_feed) > 0, 'anon reads the deal feed');
select is((select count(*)::int from public.deal_feed where price_display = 'check_price'), 0, 'auto deals in the feed always have a price');
select is((select count(*)::int from (select x ->> 'product_id' from jsonb_array_elements(public.deals_feed() -> 'items') x
                                        group by 1 having count(*) > 1) d), 0, 'feeds show one card per product');
select ok((select bool_and((x ->> 'price_cents')::int <= 5000) from jsonb_array_elements(public.deals_feed('under_50') -> 'items') x),
  'under-$50 feed respects the price');
select ok((select bool_and(x ->> 'promo_code' is not null) from jsonb_array_elements(public.deals_feed('promo_codes') -> 'items') x),
  'promo-code feed only has coded deals');
select ok((select bool_and(x ->> 'category_slug' = 'paddles') from jsonb_array_elements(public.deals_feed(category_slug => 'paddles') -> 'items') x),
  'category filter applies');
select ok((select bool_and((x ->> 'price_cents')::int between 15000 and 20000)
             from jsonb_array_elements(public.deals_feed(min_cents => 15000, max_cents => 20000) -> 'items') x),
  'price range filter applies');
select is(public.deals_home() -> 'sponsored' -> 0 ->> 'label', 'Sponsored', 'sponsored placements are labelled');
select ok((public.deals_home() -> 'hero' ->> 'is_staff_pick')::boolean, 'the staff pick leads the home feed');
reset role;

-- Staff ---------------------------------------------------------------------------------------------

select pg_temp.act_as('eeeeeeee-0000-0000-0000-000000000001', 'user');
select throws_ok($$insert into public.deals (variant_id, kind, headline, origin) select vid, 'editorial', 'Nope', 'curated' from t$$,
  '42501', null, 'users cannot create deals');
select throws_ok($$insert into public.collections (slug, title) values ('user-coll', 'Nope')$$, '42501', null, 'users cannot create collections');
reset role;

select pg_temp.act_as('eeeeeeee-0000-0000-0000-000000000002', 'editor');
select lives_ok($$insert into public.deals (variant_id, kind, headline, origin, is_staff_pick, ends_at)
  select vid, 'editorial', 'Editor’s choice for control players', 'curated', true, now() + interval '1 day' from t$$,
  'staff create curated deals');
select throws_ok($$insert into public.placements (kind, product_id, campaign, label) select 'sponsored_deal', pid, 'X', 'Ad' from t$$,
  '23514', null, 'placements must target what their kind says');
reset role;

select is((select headline from public.deal_feed where variant_id = (select vid from t) and origin = 'curated'),
  'Editor’s choice for control players', 'curated deals appear in the feed with current prices');
select is((select badges @> array['ENDING SOON'] from public.deal_feed where variant_id = (select vid from t) and origin = 'curated'),
  true, 'deals ending within 48 hours are badged');

update public.deals set ends_at = now() - interval '1 minute', starts_at = now() - interval '2 days'
 where variant_id = (select vid from t) and origin = 'curated';
do $$ begin perform public.refresh_deals(); end $$;
select is((select status::text from public.deals where variant_id = (select vid from t) and origin = 'curated'), 'expired',
  'the scheduled refresh expires ended deals');

select * from finish();
rollback;
