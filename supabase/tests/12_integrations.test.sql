begin;
select plan(41);

insert into auth.users (id, email) values
  ('17171717-0000-0000-0000-000000000001', 'intstaff@example.test'),
  ('17171717-0000-0000-0000-000000000002', 'intmember@example.test');

create function pg_temp.act_as(uid uuid, app_role text default null) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated', 'app_role', app_role)::text, true);
  set local role authenticated;
$$;

-- Test fixtures: an API-priced and a feed source on fresh retailers, and two catalog variants.
insert into public.retailers (id, slug, name, kind, domain, price_display_default) values
  ('a1000000-0000-0000-0000-000000000001', 'amazon-test', 'Amazon Test', 'marketplace', 'amazon-test.com', 'check_price'),
  ('a1000000-0000-0000-0000-000000000002', 'feedshop', 'Feed Shop', 'retailer', 'feedshop.com', 'show');
insert into public.ingestion_sources (slug, name, kind, retailer_id, is_active, interval_minutes, max_age_minutes, config) values
  ('test-api', 'Test API', 'api', 'a1000000-0000-0000-0000-000000000001', true, 30, 60, '{"adapter": "amazon-creators"}'),
  ('test-feed', 'Test feed', 'feed', 'a1000000-0000-0000-0000-000000000002', true, 360, 2880, '{"adapter": "delimited-feed", "url_env": "FEED_URL_TEST"}');

create temp table v as
select (select v.id from public.product_variants v join public.products p on p.id = v.product_id where p.slug = 'joola-perseus-pro-iv' and v.label = '16mm') as perseus,
       (select v.id from public.product_variants v join public.products p on p.id = v.product_id where p.slug = 'joola-perseus-pro-iv' and v.label = '14mm') as perseus14;
insert into public.product_identifiers (variant_id, kind, value, retailer_id)
select perseus, 'asin', 'B0PERSEUS1', 'a1000000-0000-0000-0000-000000000001' from v;

-- Structure and privileges --------------------------------------------------------------------------

select ok(not has_function_privilege('authenticated', 'public.claim_ingestion_runs(text)', 'EXECUTE'), 'only the service claims runs');
select ok(not has_function_privilege('authenticated', 'public.finish_ingestion_run(text, uuid, boolean, text, boolean)', 'EXECUTE'), 'only the service finishes runs');
select ok(not has_function_privilege('authenticated', 'public.learn_identifiers(uuid, uuid)', 'EXECUTE'), 'learning is internal');
select throws_ok($$update public.ingestion_sources set max_age_minutes = 120 where slug = 'test-api'$$, '23514', null,
  'API prices can’t be kept longer than an hour (Amazon policy)');
select throws_ok($$update public.ingestion_sources set config = '{"url_env": "SUPABASE_SERVICE_ROLE_KEY"}' where slug = 'test-feed'$$, '23514', null,
  'a source can only name FEED_URL_* secrets');
select throws_ok($$insert into public.affiliate_programs (retailer_id, network, link_template) values ('a1000000-0000-0000-0000-000000000002', 'avantlink', 'http://x.com/?u={url}')$$,
  '23514', null, 'click URLs must be https with {url}');
select lives_ok($$insert into public.affiliate_programs (retailer_id, network, link_template) values ('a1000000-0000-0000-0000-000000000002', 'avantlink', 'https://www.avantlink.com/click.php?tt=cl&mi=1&pw=2&url={url}')$$,
  'a network click URL works without a query tag');

-- API source: price shows, never becomes history, learns identifiers ------------------------------------

select is((public.ingest_offers('test-api', jsonb_build_array(jsonb_build_object('retailer_slug', 'amazon-test', 'url', 'https://www.amazon-test.com/dp/B0PERSEUS1',
  'external_ref', 'B0PERSEUS1', 'asin', 'B0PERSEUS1', 'upc', '840099999990', 'price_cents', 18999)), false, true) ->> 'matched')::int, 1,
  'an API record matches by ASIN');
select is((select price_display::text || ':' || price_cents from public.variant_offer_ranking where retailer_slug = 'amazon-test'), 'show:18999',
  'an API price shows even for a check-price retailer (D1)');
select is((select price_source::text from public.variant_offer_ranking where retailer_slug = 'amazon-test'), 'api', 'the ranking view exposes the price source');
select is((select count(*)::int from public.price_points p join public.retailer_offers o on o.id = p.offer_id where o.retailer_id = 'a1000000-0000-0000-0000-000000000001'), 0,
  'API prices are never stored as price history');
select is((select source from public.product_identifiers where kind = 'upc' and value = '840099999990'), 'learned', 'the UPC from the API is learned');
select is((select variant_id from public.product_identifiers where kind = 'upc' and value = '840099999990'), (select perseus from v), 'for the matched variant');

update public.retailer_offers set last_checked_at = now() - interval '61 minutes' where retailer_id = 'a1000000-0000-0000-0000-000000000001';
select is((select price_display::text from public.variant_offer_ranking where retailer_slug = 'amazon-test'), 'check_price',
  'an API price older than 60 minutes stops showing at once');
select is((select price_cents from public.variant_offer_ranking where retailer_slug = 'amazon-test'), null, 'and carries no number');
select ok(public.enforce_offer_freshness() >= 1, 'the freshness job clears stale API prices');
select is((select price_cents from public.retailer_offers where retailer_id = 'a1000000-0000-0000-0000-000000000001'), null, 'the stale price is gone from storage');
select is((public.ingest_offers('test-api', jsonb_build_array(jsonb_build_object('retailer_slug', 'amazon-test', 'url', 'https://www.amazon-test.com/dp/B0PERSEUS1',
  'external_ref', 'B0PERSEUS1', 'asin', 'B0PERSEUS1', 'price_cents', 18499)), false, true) ->> 'offers_updated')::int, 1, 'the next refresh updates the same offer');
select is((select price_display::text || ':' || price_cents from public.variant_offer_ranking where retailer_slug = 'amazon-test'), 'show:18499', 'and the price shows again');

update public.raw_offer_records set created_at = now() - interval '25 hours'
 where retailer_id = 'a1000000-0000-0000-0000-000000000001';
select ok(public.purge_api_payloads() >= 2, 'raw API responses are deleted after 24 hours');

-- Feed source: partial runs, learned matches, review dedupe, conflicts ------------------------------------

select is((public.ingest_offers('test-feed', jsonb_build_array(
    jsonb_build_object('retailer_slug', 'feedshop', 'url', 'https://feedshop.com/p/perseus', 'external_ref', 'FS-1', 'upc', '840099999990', 'mpn', 'PER-16', 'price_cents', 19999),
    jsonb_build_object('retailer_slug', 'feedshop', 'url', 'https://feedshop.com/p/x', 'external_ref', 'FS-2'),
    jsonb_build_object('retailer_slug', 'feedshop', 'url', 'https://feedshop.com/p/hat', 'external_ref', 'FS-3', 'title', 'Feed Shop hat', 'price_cents', 2500)), false, true)
  ->> 'error_count')::int, 1, 'a bad row fails alone in an automated run');
select is((select count(*)::int from public.retailer_offers where retailer_id = 'a1000000-0000-0000-0000-000000000002' and status = 'active'), 1,
  'the good row still lands (matched by the UPC learned from the API)');
select is((select source from public.product_identifiers where kind = 'mpn' and value = 'PER-16'), 'learned', 'and teaches the catalog its MPN');
select is((select count(*)::int from public.raw_offer_records where retailer_id = 'a1000000-0000-0000-0000-000000000002' and match_status = 'unmatched'), 1,
  'the unknown item goes to the review queue');

create temp table run2 as
select public.ingest_offers('test-feed', jsonb_build_array(
    jsonb_build_object('retailer_slug', 'feedshop', 'url', 'https://feedshop.com/p/perseus-new', 'external_ref', 'FS-1', 'price_cents', 19499),
    jsonb_build_object('retailer_slug', 'feedshop', 'url', 'https://feedshop.com/p/hat', 'external_ref', 'FS-3', 'title', 'Feed Shop hat', 'price_cents', 2400),
    jsonb_build_object('retailer_slug', 'feedshop', 'url', 'https://feedshop.com/p/conflict', 'external_ref', 'FS-4', 'upc', '840099999990', 'mpn', 'PER-16',
                       'retailer_sku', 'FS-4', 'price_cents', 21000)), false, true) as r;
select is((select (r ->> 'already_queued')::int from run2), 1, 'an item already in review isn’t queued again');
select is((select price_cents from public.raw_offer_records where external_ref = 'FS-3'), 2400, 'its queued record is refreshed instead');
select is((select price_cents from public.retailer_offers where external_ref = 'FS-1'), 19499, 'a previously matched SKU keeps its match without identifiers');
select is((select count(*)::int from public.raw_offer_records where match_status = 'unmatched' and retailer_id = 'a1000000-0000-0000-0000-000000000002'), 1,
  'the review queue still has one item');

-- Rejected items stay rejected.
update public.raw_offer_records set match_status = 'rejected' where external_ref = 'FS-3';
select is((public.ingest_offers('test-feed', jsonb_build_array(jsonb_build_object('retailer_slug', 'feedshop', 'url', 'https://feedshop.com/p/hat',
  'external_ref', 'FS-3', 'title', 'Feed Shop hat', 'price_cents', 2300)), false, true) ->> 'unmatched')::int, 0, 'a rejected item isn’t queued again');

-- A learned identifier never overwrites one pointing at another variant.
insert into public.product_identifiers (variant_id, kind, value) select perseus14, 'gtin', '00840099999991' from v;
insert into public.raw_offer_records (id, run_id, payload, retailer_id, url, gtin, external_ref)
select 'b1000000-0000-0000-0000-000000000001', (select id from public.ingestion_runs order by created_at desc limit 1), '{}',
       'a1000000-0000-0000-0000-000000000002', 'https://feedshop.com/p/x', '00840099999991', 'FS-9';
select is((select public.learn_identifiers('b1000000-0000-0000-0000-000000000001', perseus) ->> 'conflicts' from v), '1', 'a conflicting identifier is counted');
select is((select variant_id from public.product_identifiers where value = '00840099999991'), (select perseus14 from v), 'and left pointing at its variant');

-- Scheduler: claim, finish, backoff, complete-feed deactivation ---------------------------------------------

update public.ingestion_sources set next_run_at = now() - interval '1 minute' where slug in ('test-api', 'test-feed');
select is((select count(*)::int from public.claim_ingestion_runs() where slug in ('test-api', 'test-feed')), 2, 'due sources are claimed');
select is((select count(*)::int from public.claim_ingestion_runs() where slug in ('test-api', 'test-feed')), 0, 'a running source isn’t claimed twice');
select public.finish_ingestion_run('test-api', null, false, 'token failed');
select ok((select consecutive_failures = 1 and running_since is null and next_run_at > now() + interval '29 minutes' and last_error = 'token failed'
             from public.ingestion_sources where slug = 'test-api'), 'a failure is recorded and the next run is scheduled');

-- Complete feed: FS-1 present in the run, so nothing else disappears; then a run without it.
select is((select public.finish_ingestion_run('test-feed', (select (r ->> 'run_id')::uuid from run2), true, null, true) ->> 'deactivated'), '0',
  'offers still in the feed stay active');
create temp table run3 as
select public.ingest_offers('test-feed', jsonb_build_array(jsonb_build_object('retailer_slug', 'feedshop', 'url', 'https://feedshop.com/p/c',
  'external_ref', 'FS-4', 'retailer_sku', 'FS-4', 'price_cents', 21000)), false, true) as r;
select is((select public.finish_ingestion_run('test-feed', (select (r ->> 'run_id')::uuid from run3), true, null, true) ->> 'deactivated'), '1',
  'an offer missing from a full feed is hidden');
select is((select status::text from public.retailer_offers where external_ref = 'FS-1'), 'inactive', 'that offer is the one the feed dropped');
create temp table run4 as select public.ingest_offers('test-feed', '[]', false, true) as r;
select is((select public.finish_ingestion_run('test-feed', (select (r ->> 'run_id')::uuid from run4), true, null, true) ->> 'deactivated'), '0',
  'a feed that looks truncated deactivates nothing');
select matches((select last_error from public.ingestion_sources where slug = 'test-feed'), 'nothing was deactivated', 'and says why');

-- Staff surface ---------------------------------------------------------------------------------------------

select pg_temp.act_as('17171717-0000-0000-0000-000000000002');
select throws_ok($$select public.request_ingestion_run('test-feed')$$, '42501', null, 'members can’t run integrations');
reset role;
select pg_temp.act_as('17171717-0000-0000-0000-000000000001', 'editor');
select ok((select count(*) >= 2 from public.staff_integrations() where slug in ('test-api', 'test-feed')), 'staff see integration health');
reset role;

select * from finish();
rollback;
