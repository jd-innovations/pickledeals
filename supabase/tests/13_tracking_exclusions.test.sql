begin;
select plan(14);

insert into auth.users (id, email) values ('18181818-0000-0000-0000-000000000001', 'tracker@example.test');

create temp table v as
select vr.id as vid, p.id as pid
  from public.product_variants vr join public.products p on p.id = vr.product_id
 where p.slug = 'joola-perseus-pro-iv' and vr.label = '16mm';

-- The flag ------------------------------------------------------------------------------------------

select ok((select tracking_excluded from public.retailers where slug = 'amazon'), 'Amazon is excluded from price tracking');
update public.retailers set tracking_excluded = false where slug = 'amazon';
select ok((select tracking_excluded from public.retailers where slug = 'amazon'), 'and can’t be switched back on');
insert into public.retailers (slug, name, domain) values ('amazon-uk', 'Amazon UK', 'amazon.co.uk'), ('not-amazon', 'Not Amazon', 'amazon-deals.com');
select ok((select tracking_excluded from public.retailers where slug = 'amazon-uk'), 'any amazon.* domain is excluded automatically');
select ok(not (select tracking_excluded from public.retailers where slug = 'not-amazon'), 'look-alike domains aren’t');

-- A saved product and a target alert, then a live Amazon price far below every tracked retailer.
insert into public.saved_products (user_id, product_id) select '18181818-0000-0000-0000-000000000001', pid from v;
insert into public.price_alerts (user_id, product_id, variant_id, target_cents)
select '18181818-0000-0000-0000-000000000001', pid, vid, 15000 from v;
create temp table tracked_before as select best_offer_id, best_delivered_cents from public.variant_price_stats where variant_id = (select vid from v);

select is((public.ingest_offers('amazon-creators', jsonb_build_array(jsonb_build_object('retailer_slug', 'amazon',
  'url', 'https://www.amazon.com/dp/DEV0000001', 'external_ref', 'DEV0000001', 'asin', 'DEV0000001', 'price_cents', 9999)), false, true)
  ->> 'matched')::int, 1, 'a live Amazon price arrives');

select is((select retailer_slug from public.variant_offer_ranking where variant_id = (select vid from v) and rank = 1), 'amazon',
  'Amazon still ranks first for shoppers (discovery)');
select is((select tracking_excluded from public.variant_offer_ranking where variant_id = (select vid from v) and rank = 1), true,
  'and the ranking view says it’s untracked');
select is((select best_offer_id from public.variant_price_stats where variant_id = (select vid from v)), (select best_offer_id from tracked_before),
  'price stats keep describing tracked retailers');
select is((select count(*)::int from public.notifications where user_id = '18181818-0000-0000-0000-000000000001' and type in ('target_price', 'price_drop')), 0,
  'an Amazon price never fires a target alert or a saved-product price drop');
select isnt((select kind::text from public.deals where variant_id = (select vid from v) and origin = 'auto' and status = 'active'), 'price_drop',
  'no "below typical" deal on an Amazon price');
select ok(not exists (select 1 from public.deal_feed where variant_id = (select vid from v) and offer_id in
                (select o.id from public.retailer_offers o join public.retailers r on r.id = o.retailer_id where r.slug = 'amazon')
              and (deal_quality is not null or badges && array['LOWEST PRICE', 'HOT DEAL'])),
  'Amazon deal cards carry no tracking claims');

-- A tracked retailer reaching the target still alerts.
update public.retailer_offers o set price_cents = 14500, shipping_cents = 0
  from public.retailers r
 where r.id = o.retailer_id and r.slug = 'courtside-pro-shop' and o.variant_id = (select vid from v);
select is((select count(*)::int from public.notifications where user_id = '18181818-0000-0000-0000-000000000001' and type = 'target_price'), 1,
  'a tracked retailer under the target fires the alert');
select matches((select body from public.notifications where user_id = '18181818-0000-0000-0000-000000000001' and type = 'target_price'),
  'CourtSide Pro Shop', 'naming the tracked retailer, not Amazon');
select is((select r.slug::text from public.variant_price_stats s join public.retailer_offers o on o.id = s.best_offer_id
             join public.retailers r on r.id = o.retailer_id where s.variant_id = (select vid from v)), 'courtside-pro-shop',
  'the tracked best price moves with tracked retailers');

select * from finish();
rollback;
