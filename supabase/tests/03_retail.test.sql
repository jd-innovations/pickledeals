begin;
select plan(47);

insert into auth.users (id, email) values
  ('dddddddd-0000-0000-0000-000000000001', 'user3@example.test'),
  ('dddddddd-0000-0000-0000-000000000002', 'editor3@example.test'),
  ('dddddddd-0000-0000-0000-000000000003', 'admin3@example.test');

create function pg_temp.act_as(uid uuid, app_role text) returns void language sql as $$
  select set_config('request.jwt.claims',
    json_build_object('sub', uid, 'role', 'authenticated', 'app_role', app_role)::text, true);
  set local role authenticated;
$$;

create function pg_temp.variant(product_slug text, label text) returns uuid language sql as $$
  select v.id from public.product_variants v join public.products p on p.id = v.product_id
   where p.slug = product_slug and v.label = label;
$$;

-- A clean variant for deterministic assertions (no seeded offers): Perseus CFS 14mm.
create temp table t as select pg_temp.variant('joola-perseus-cfs', '14mm') as vid;
grant select on t to anon, authenticated;

-- An existing affiliate program, so "editors can't read it" is a real check.
insert into public.affiliate_programs (retailer_id, network, tag_template)
select id, 'test', 'tag=pd-courtside' from public.retailers where slug = 'courtside-pro-shop';

-- Structure ---------------------------------------------------------------------------------------

select ok((select bool_and(relrowsecurity) from pg_class where oid in (
  'public.retailers'::regclass, 'public.affiliate_programs'::regclass, 'public.ingestion_sources'::regclass,
  'public.ingestion_runs'::regclass, 'public.raw_offer_records'::regclass, 'public.retailer_offers'::regclass,
  'public.price_points'::regclass, 'public.promo_codes'::regclass, 'public.promo_code_targets'::regclass,
  'public.outbound_clicks'::regclass, 'public.variant_price_stats'::regclass)), 'RLS is on for every retail table');
select is(position('affiliate' in pg_get_viewdef('public.variant_offer_ranking'::regclass)), 0,
  'the ranking view never reads affiliate data');

-- D1 ----------------------------------------------------------------------------------------------

insert into public.retailer_offers (variant_id, retailer_id, url, price_cents, price_display, price_source)
select (select vid from t), id, 'https://www.amazon.com/dp/TEST1', 9900, 'show', 'manual' from public.retailers where slug = 'amazon';
select is((select price_display::text || ':' || coalesce(price_cents::text, 'null') from public.retailer_offers where url = 'https://www.amazon.com/dp/TEST1'),
  'check_price:null', 'D1: a manual Amazon price is dropped and the offer is check-price');

insert into public.retailer_offers (variant_id, retailer_id, url, price_cents, price_source, external_ref)
select (select vid from t), id, 'https://www.amazon.com/dp/TEST2', 9500, 'api', 'api-1' from public.retailers where slug = 'amazon';
select is((select price_cents from public.retailer_offers where external_ref = 'api-1'), 9500, 'D1: an API price is stored');
select is((select price_cents from public.variant_offer_ranking where retailer_slug = 'amazon' and variant_id = (select vid from t) limit 1), null,
  'D1: check-price offers never expose a price through the ranking');
select is((select count(*)::int from public.variant_offer_ranking where variant_id = (select vid from t) and rank is not null), 0,
  'D1: check-price offers are never ranked');
select is((select best_offer_id from public.variant_price_stats where variant_id = (select vid from t)), null,
  'D1: check-price offers never become the best price');

select throws_ok($$insert into public.retailer_offers (variant_id, retailer_id, url, price_cents)
  select (select vid from t), id, 'https://evil.example/phish', 100 from public.retailers where slug = 'joola-com'$$,
  '23514', null, 'offer URLs must be on the retailer domain');
select lives_ok($$insert into public.retailer_offers (variant_id, retailer_id, url, price_cents)
  select (select vid from t), id, 'https://shop.joola.com/cfs-14', 19999 from public.retailers where slug = 'joola-com'$$,
  'subdomains of the retailer domain are allowed');

-- Ranking, promos, rounding -----------------------------------------------------------------------

select is((select price_cents + shipping_cents - delivered_cents from public.variant_offer_ranking
            where variant_id = (select vid from t) and retailer_slug = 'joola-com'), 2999,
  'percent codes round the saving down (15% of $199.99 = $29.99, not $30.00)');
select is((select promo_code from public.variant_offer_ranking where variant_id = (select vid from t) and retailer_slug = 'joola-com'), 'DINK15',
  'a live sitewide code applies to the offer');

insert into public.retailer_offers (variant_id, retailer_id, url, price_cents, shipping_cents)
select (select vid from t), id, 'https://courtside-pro-shop.example/cfs-14', 16900, 600 from public.retailers where slug = 'courtside-pro-shop';
insert into public.retailer_offers (variant_id, retailer_id, url, price_cents)
select (select vid from t), id, 'https://baseline-sports.example/cfs-14', 18000 from public.retailers where slug = 'baseline-sports';

select is((select retailer_slug from public.variant_offer_ranking where variant_id = (select vid from t) and rank = 1), 'joola-com',
  'ranking orders by delivered price including the best code (JOOLA $170.00 < CourtSide $175.00)');
select is((select promo_code from public.variant_offer_ranking where variant_id = (select vid from t) and retailer_slug = 'baseline-sports'), null,
  'a code verified 30 days ago is stale and never applied');
select is((select count(*)::int from public.live_promo_codes where code = 'OLDCODE'), 0, 'stale codes are hidden');
select is((select promo_code from public.variant_offer_ranking where variant_id = (select vid from t) and retailer_slug = 'courtside-pro-shop'), null,
  'category-targeted codes do not apply outside their category (COURT20 is shoes only)');

select is((select best_delivered_cents from public.variant_price_stats where variant_id = (select vid from t)), 17000,
  'stats pick the best delivered price');
select is((select offer_count from public.variant_price_stats where variant_id = (select vid from t)), 5, 'stats count every listed offer');

-- Price points on change only
select is((select count(*)::int from public.price_points p join public.retailer_offers o on o.id = p.offer_id
            where o.url = 'https://baseline-sports.example/cfs-14'), 1, 'creating an offer records one price point');
update public.retailer_offers set last_checked_at = now() where url = 'https://baseline-sports.example/cfs-14';
select is((select count(*)::int from public.price_points p join public.retailer_offers o on o.id = p.offer_id
            where o.url = 'https://baseline-sports.example/cfs-14'), 1, 'a re-check without a change records nothing');
update public.retailer_offers set price_cents = 15000 where url = 'https://baseline-sports.example/cfs-14';
select is((select count(*)::int from public.price_points p join public.retailer_offers o on o.id = p.offer_id
            where o.url = 'https://baseline-sports.example/cfs-14'), 2, 'a price change records a point');
select is((select best_delivered_cents from public.variant_price_stats where variant_id = (select vid from t)), 15000,
  'stats refresh when an offer changes');

-- Anonymous access --------------------------------------------------------------------------------

set local role anon;
select throws_ok('select * from public.retailer_offers', '42501', null, 'anon cannot read raw offers (stored API prices stay private)');
select throws_ok('select * from public.price_points', '42501', null, 'anon cannot read price points directly');
select throws_ok('select * from public.affiliate_programs', '42501', null, 'anon cannot read affiliate programs');
select throws_ok('select * from public.raw_offer_records', '42501', null, 'anon cannot read ingestion records');
select throws_ok('select * from public.outbound_clicks', '42501', null, 'anon cannot read clicks');
select ok((select count(*) from public.variant_offer_ranking) > 0, 'anon reads the ranking');
select ok((select count(*) from public.live_promo_codes) > 0, 'anon reads live promo codes');
select ok((select count(*) from public.variant_price_stats) > 0, 'anon reads price stats');
select ok((select count(*) from public.price_history(pg_temp.variant('joola-perseus-pro-iv', '16mm'), 90)) > 30,
  'anon reads daily price history');
select is((select count(*)::int from public.price_history(pg_temp.variant('joola-perseus-pro-iv', '16mm'), 90, 'amazon')), 0,
  'D1: there is no price history for check-price retailers');
select ok((select count(*) from public.recent_price_changes(pg_temp.variant('joola-perseus-pro-iv', '16mm'))) > 0,
  'anon reads recent price changes');
select throws_ok($$select public.ingest_offers('manual', '[]')$$, '42501', null, 'anon cannot ingest offers');
reset role;

-- Regular user ------------------------------------------------------------------------------------

select pg_temp.act_as('dddddddd-0000-0000-0000-000000000001', 'user');
select is((select count(*)::int from public.retailer_offers), 0, 'users see no raw offers');
select throws_ok($$insert into public.outbound_clicks (placement) values ('spoof')$$, '42501', null, 'users cannot write clicks');
select throws_ok($$select public.ingest_offers('manual', '[]')$$, '42501', null, 'users cannot ingest offers');
reset role;

-- Editor: ingestion pipeline ----------------------------------------------------------------------

select pg_temp.act_as('dddddddd-0000-0000-0000-000000000002', 'editor');
select is((select count(*)::int from public.affiliate_programs), 0, 'editors cannot read affiliate programs (admins only)');

select is(public.ingest_offers('manual',
  '[{"retailer_slug":"baseline-sports","url":"https://baseline-sports.example/hyperion-cfs","price_cents":14900,"product_slug":"joola-hyperion-cfs"}]', true)
  ->> 'matched', '1', 'dry run matches by product slug');
select is((select count(*)::int from public.retailer_offers where url = 'https://baseline-sports.example/hyperion-cfs'), 0, 'dry run writes nothing');

select is(public.ingest_offers('csv',
  '[{"retailer_slug":"baseline-sports","url":"https://baseline-sports.example/mystery","price_cents":9900,"title":"Hyperion CFS paddle 16","brand":"JOOLA","upc":"099999999990"}]', false)
  ->> 'unmatched', '1', 'records without a match key go to the review queue');
select is((select suggestions -> 0 ->> 'product_slug' from public.raw_offer_records where url = 'https://baseline-sports.example/mystery'),
  'joola-hyperion-cfs', 'the queue suggests the closest product');

select lives_ok($$select public.resolve_raw_offer(
  (select id from public.raw_offer_records where url = 'https://baseline-sports.example/mystery'),
  (select v.id from public.product_variants v join public.products p on p.id = v.product_id where p.slug = 'joola-hyperion-cfs' and v.is_default), true)$$,
  'an editor resolves a queued record');
select is((select count(*)::int from public.product_identifiers where kind = 'upc' and value = '099999999990'), 1,
  'resolving remembers the identifier');
select is(public.ingest_offers('csv',
  '[{"retailer_slug":"courtside-pro-shop","url":"https://courtside-pro-shop.example/mystery","price_cents":9800,"title":"anything","upc":"099999999990"}]', false)
  ->> 'matched', '1', 'the next import matches automatically by identifier');

select is(public.ingest_offers('manual', '[{"retailer_slug":"joola-com","url":"https://joola.com/x","product_slug":"joola-hyperion-cfs"}]', false)
  -> 'errors' -> 0 ->> 'message', 'JOOLA.com shows prices, so price_cents is required', 'priced retailers need a price');
reset role;

-- Admin ---------------------------------------------------------------------------------------------

select pg_temp.act_as('dddddddd-0000-0000-0000-000000000003', 'admin');
select lives_ok($$insert into public.affiliate_programs (retailer_id, network, tag_template)
  select id, 'test', 'tag=pd-20' from public.retailers where slug = 'baseline-sports'$$, 'admins manage affiliate programs');
select throws_ok($$insert into public.affiliate_programs (retailer_id, network, tag_template)
  select id, 'test', 'javascript:alert(1)' from public.retailers where slug = 'racquet-and-court'$$,
  '23514', null, 'affiliate tags must be plain query parameters');
reset role;

select * from finish();
rollback;
