-- Price tracking excludes Amazon (Oct 4, 2026). Amazon's Associates policies restrict price tracking
-- and price alerting. PickleDeals tracks every other retailer; offers from retailers flagged
-- tracking_excluded (always Amazon) never feed the tracking layer:
--   variant_price_stats (best price, deal quality, lows) · target-price alerts · saved price-drop pushes
--   · tracking-based deals ("below typical", "lowest we've tracked") · LOWEST PRICE / HOT DEAL badges.
-- Their offers still list, rank and link (discovery). API prices were already kept out of history (Phase 12).

alter table public.retailers add column tracking_excluded boolean not null default false;
comment on column public.retailers.tracking_excluded is
  'Offers never feed price stats, alerts, price-drop notifications or tracking-based deals. Always true for Amazon.';

create or replace function public.retailers_tracking_policy()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.domain ~ '(^|\.)amazon\.[a-z.]+$' then
    new.tracking_excluded := true;
  end if;
  return new;
end;
$$;

create trigger retailers_tracking_policy before insert or update on public.retailers
  for each row execute function public.retailers_tracking_policy();
revoke execute on function public.retailers_tracking_policy() from public, anon, authenticated;

update public.retailers set tracking_excluded = true where domain ~ '(^|\.)amazon\.[a-z.]+$';

-- Ranking view gains tracking_excluded (appended column).
create or replace view public.variant_offer_ranking with (security_barrier = true) as
with live as (
  select o.*, r.slug as retailer_slug, r.name as retailer_name, r.kind as retailer_kind, v.product_id,
         r.tracking_excluded as retailer_tracking_excluded,
         case when o.price_source = 'api' and o.last_checked_at < now() - interval '60 minutes'
              then 'check_price'::public.price_display else o.price_display end as shown_display
    from public.retailer_offers o
    join public.retailers r on r.id = o.retailer_id and r.is_active
    join public.product_variants v on v.id = o.variant_id
   where o.status = 'active' and public.product_is_public(v.product_id)
),
priced as (
  select l.*, best.promo_id, best.promo_code, coalesce(best.discount, 0) as promo_discount_cents
    from live l
    left join lateral (
      select p.id as promo_id, p.code as promo_code,
             public.promo_discount_cents(p, l.price_cents, l.shipping_cents) as discount
        from public.promo_codes p
       where p.retailer_id = l.retailer_id
         and public.promo_is_live(p)
         and l.shown_display = 'show'
         and (not exists (select 1 from public.promo_code_targets t where t.promo_id = p.id)
              or exists (select 1 from public.promo_code_targets t
                          join public.products pr on pr.id = l.product_id
                         where t.promo_id = p.id
                           and (t.variant_id = l.variant_id or t.product_id = l.product_id or t.category_id = pr.category_id)))
       order by discount desc, p.ends_at nulls last
       limit 1
    ) best on best.discount > 0
)
select id as offer_id, variant_id, product_id, retailer_id, retailer_slug, retailer_name, retailer_kind,
       shown_display as price_display,
       case when shown_display = 'show' then price_cents end as price_cents,
       case when shown_display = 'show' then shipping_cents end as shipping_cents,
       in_stock, available_sizes,
       promo_id, promo_code,
       case when shown_display = 'show' then promo_discount_cents end as promo_discount_cents,
       case when shown_display = 'show' then price_cents + shipping_cents - promo_discount_cents end as delivered_cents,
       case when shown_display = 'show' then
         row_number() over (partition by variant_id, shown_display
                            order by price_cents + shipping_cents - promo_discount_cents, in_stock desc, last_checked_at desc)
       end as rank,
       last_checked_at,
       price_source,
       retailer_tracking_excluded as tracking_excluded
  from priced;

-- Stats describe tracked retailers only: the best price, deal quality and lows ignore excluded offers.
create or replace function public.refresh_variant_price_stats(vid uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  best       record;
  typical    integer;
  low30      integer;
  low90      integer;
  prior_low  integer;
  hist_days  integer;
  quality    public.deal_quality;
  n_offers   integer;
  list_best  integer;
begin
  select offer_id, delivered_cents, price_cents into best
    from public.variant_offer_ranking
   where variant_id = vid and price_display = 'show' and not tracking_excluded
   order by delivered_cents, in_stock desc, last_checked_at desc
   limit 1;
  -- History records price + shipping only, so "all-time low" compares like with like (no codes).
  select min(price_cents + shipping_cents) into list_best
    from public.variant_offer_ranking where variant_id = vid and price_display = 'show' and not tracking_excluded;
  select count(*) into n_offers from public.variant_offer_ranking where variant_id = vid;

  select percentile_cont(0.5) within group (order by low_cents)::int, min(low_cents), count(*)
    into typical, low90, hist_days
    from public.variant_daily_lows(vid, 90);
  select min(low_cents) into low30 from public.variant_daily_lows(vid, 30);
  select min(p.price_cents + p.shipping_cents) into prior_low
    from public.price_points p
    join public.retailer_offers o on o.id = p.offer_id
    join public.retailers r on r.id = o.retailer_id
   where o.variant_id = vid and p.price_display = 'show' and p.active and p.price_cents is not null
     and p.observed_at < current_date and not r.tracking_excluded;

  -- Honest labels: no quality without a price or a week of history, and "all-time low" only with
  -- two weeks of history.
  if best.delivered_cents is null or typical is null or coalesce(hist_days, 0) < 7 then
    quality := null;
  elsif hist_days >= 14 and prior_low is not null and list_best < prior_low then
    quality := 'all_time_low';
  elsif best.delivered_cents <= typical * 0.85 then
    quality := 'excellent';
  elsif best.delivered_cents <= typical * 0.95 then
    quality := 'good';
  elsif best.delivered_cents <= typical * 1.05 then
    quality := 'typical';
  else
    quality := 'above_typical';
  end if;

  insert into public.variant_price_stats as s (variant_id, best_offer_id, best_delivered_cents, best_price_cents, offer_count,
                                               typical_cents, low_30d_cents, low_90d_cents, low_all_time_cents, history_days,
                                               deal_quality, updated_at)
  values (vid, best.offer_id, best.delivered_cents, best.price_cents, n_offers, typical, low30, low90,
          least(prior_low, list_best), coalesce(hist_days, 0), quality, now())
  on conflict (variant_id) do update set
    best_offer_id = excluded.best_offer_id, best_delivered_cents = excluded.best_delivered_cents,
    best_price_cents = excluded.best_price_cents, offer_count = excluded.offer_count,
    typical_cents = excluded.typical_cents, low_30d_cents = excluded.low_30d_cents,
    low_90d_cents = excluded.low_90d_cents, low_all_time_cents = excluded.low_all_time_cents,
    history_days = excluded.history_days, deal_quality = excluded.deal_quality, updated_at = now();
end;
$$;

-- Target-price alerts fire on tracked retailers' prices only.
create or replace function public.evaluate_price_alerts(vid uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  a      record;
  best   record;
  fired  integer := 0;
begin
  for a in
    select pa.*, p.slug as product_slug, p.name as product_name, b.name as brand_name
      from public.price_alerts pa
      join public.product_variants v on v.id = vid and v.product_id = pa.product_id
      join public.products p on p.id = pa.product_id
      join public.brands b on b.id = p.brand_id
     where pa.status = 'active' and pa.include_new and (pa.variant_id is null or pa.variant_id = vid)
  loop
    select r.delivered_cents, r.retailer_name, v.label
      into best
      from public.variant_offer_ranking r
      join public.product_variants v on v.id = r.variant_id
     where r.product_id = a.product_id and r.price_display = 'show' and not r.tracking_excluded
       and (a.variant_id is null or r.variant_id = a.variant_id)
     order by r.delivered_cents
     limit 1;

    if best.delivered_cents is not null and best.delivered_cents <= a.target_cents
       and (a.last_notified_cents is null or best.delivered_cents < a.last_notified_cents) then
      perform public.notify(
        a.user_id, 'target_price',
        format('%s %s is %s', a.brand_name, a.product_name, public.format_usd(best.delivered_cents)),
        format('Below your %s target at %s.', public.format_usd(a.target_cents), best.retailer_name),
        '/deals/product/' || a.product_slug,
        format('alert:%s:%s', a.id, best.delivered_cents),
        jsonb_build_object('alert_id', a.id, 'price_cents', best.delivered_cents));
      update public.price_alerts set last_notified_at = now(), last_notified_cents = best.delivered_cents where id = a.id;
      fired := fired + 1;
    end if;
  end loop;
  return fired;
end;
$$;

-- Deals: when the best offer is from an excluded retailer, only non-tracking deals apply (its promo
-- code, or a discount off MSRP); "below typical" / "lowest we've tracked" never do.
create or replace function public.detect_deal(vid uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  best      record;
  s         public.variant_price_stats;
  msrp      integer;
  list_now  integer;
  week_ago  integer;
  drop_7d   integer;
  v_kind     public.deal_kind;
  v_headline text;
  v_ref      integer;
  existing  uuid;
begin
  select o.offer_id, o.delivered_cents, o.price_cents, o.shipping_cents, o.promo_code, o.promo_discount_cents, o.tracking_excluded
    into best
    from public.variant_offer_ranking o
   where o.variant_id = vid and o.rank = 1;
  select * into s from public.variant_price_stats where variant_id = vid;
  select coalesce(v.msrp_cents, p.msrp_cents) into msrp
    from public.product_variants v join public.products p on p.id = v.product_id where v.id = vid;

  if best.offer_id is not null then
    list_now := best.price_cents + best.shipping_cents;
    week_ago := public.variant_low_on(vid, current_date - 7);

    if best.promo_code is not null then
      v_kind := 'promo';
      v_headline := format('Extra %s off with code %s', public.format_usd(best.promo_discount_cents), best.promo_code);
      v_ref := msrp;
    elsif not best.tracking_excluded and s.deal_quality in ('good', 'excellent', 'all_time_low') then
      v_kind := 'price_drop';
      v_headline := case when s.deal_quality = 'all_time_low' then 'Lowest price we’ve tracked'
                       else format('%s below typical', public.format_usd(s.typical_cents - best.delivered_cents)) end;
      v_ref := s.typical_cents;
    elsif msrp is not null and best.delivered_cents <= floor(msrp * 0.85) then
      v_kind := 'sale';
      v_headline := format('%s%% off MSRP', floor((msrp - best.delivered_cents) * 100.0 / msrp)::int);
      v_ref := msrp;
    end if;
  end if;
  drop_7d := case when coalesce(best.tracking_excluded, false) then 0 else greatest(coalesce(week_ago - list_now, 0), 0) end;

  select id into existing from public.deals where variant_id = vid and origin = 'auto' and status = 'active';

  if v_kind is null then
    update public.deals set status = 'expired', ends_at = now() where id = existing;
  elsif existing is null then
    insert into public.deals (variant_id, offer_id, kind, headline, origin, reference_cents, drop_7d_cents)
    values (vid, best.offer_id, v_kind, v_headline, 'auto', v_ref, drop_7d);
  else
    update public.deals
       set offer_id = best.offer_id, kind = v_kind, headline = v_headline,
           reference_cents = v_ref, drop_7d_cents = drop_7d
     where id = existing
       and (offer_id, deals.kind, deals.headline, reference_cents, drop_7d_cents)
           is distinct from (best.offer_id, v_kind, v_headline, v_ref, drop_7d);
  end if;
end;
$$;

-- Deal cards: no tracking badges (LOWEST PRICE, HOT DEAL) or deal quality on an excluded retailer's price.
create or replace view public.deal_feed with (security_barrier = true) as
with live as (
  select d.*, coalesce(
           -- pinned offer (curated) if still listed, else the variant's current best
           (select r.offer_id from public.variant_offer_ranking r where r.offer_id = d.offer_id and d.origin = 'curated'),
           (select r.offer_id from public.variant_offer_ranking r where r.variant_id = d.variant_id and r.rank = 1),
           (select r.offer_id from public.variant_offer_ranking r where r.variant_id = d.variant_id order by r.rank nulls last limit 1)
         ) as current_offer_id
    from public.deals d
   where d.status = 'active' and d.starts_at <= now() and (d.ends_at is null or d.ends_at > now())
)
select l.id as deal_id, l.kind, l.origin, l.headline, l.is_staff_pick, l.created_at, l.starts_at,
       l.variant_id, v.label as variant_label, (select count(*) from public.product_variants x where x.product_id = p.id) > 1 as has_variants,
       p.id as product_id, p.slug as product_slug, p.name as product_name,
       b.slug as brand_slug, b.name as brand_name, c.slug as category_slug, c.name as category_name,
       r.offer_id, r.retailer_slug, r.retailer_name, r.price_display,
       r.delivered_cents as price_cents, r.in_stock, r.promo_id, r.promo_code,
       coalesce(v.msrp_cents, p.msrp_cents) as msrp_cents,
       coalesce(l.reference_cents, v.msrp_cents, p.msrp_cents) as was_cents,
       case when r.delivered_cents is not null and coalesce(l.reference_cents, v.msrp_cents, p.msrp_cents) > r.delivered_cents
            then floor((coalesce(l.reference_cents, v.msrp_cents, p.msrp_cents) - r.delivered_cents) * 100.0
                       / coalesce(l.reference_cents, v.msrp_cents, p.msrp_cents))::int end as discount_pct,
       l.drop_7d_cents, (case when r.tracking_excluded then null else s.deal_quality end) as deal_quality, s.offer_count,
       least(l.ends_at, pc.ends_at) as ends_at,
       (select jsonb_build_object('path', i.storage_path, 'is_cutout', i.is_cutout, 'blurhash', i.blurhash)
          from public.product_images i
         where i.product_id = p.id and i.status = 'active' and (i.rights_expires_at is null or i.rights_expires_at > now())
         order by i.sort limit 1) as image,
       array_remove(array[
         case when (case when r.tracking_excluded then null else s.deal_quality end) = 'all_time_low' then 'LOWEST PRICE' end,
         case when l.drop_7d_cents > 0 and r.delivered_cents is not null and l.drop_7d_cents >= r.delivered_cents * 0.05 then 'PRICE DROP' end,
         case when least(l.ends_at, pc.ends_at) <= now() + interval '48 hours' then 'ENDING SOON' end,
         case when r.promo_code is not null then 'PROMO CODE' end,
         case when (case when r.tracking_excluded then null else s.deal_quality end) = 'excellent' then 'HOT DEAL' end,
         case when l.starts_at > now() - interval '48 hours' then 'NEW DEAL' end
       ], null) as badges,
       -- Feed order: staff picks, then the biggest honest saving, then the newest.
       (case when l.is_staff_pick then 1000 else 0 end)
         + coalesce(floor((coalesce(l.reference_cents, v.msrp_cents, p.msrp_cents) - r.delivered_cents) * 100.0
                          / nullif(coalesce(l.reference_cents, v.msrp_cents, p.msrp_cents), 0)), 0)
         + case when (case when r.tracking_excluded then null else s.deal_quality end) = 'all_time_low' then 15 when (case when r.tracking_excluded then null else s.deal_quality end) = 'excellent' then 10 else 0 end as score
  from live l
  join public.variant_offer_ranking r on r.offer_id = l.current_offer_id
  join public.product_variants v on v.id = l.variant_id
  join public.products p on p.id = v.product_id
  join public.brands b on b.id = p.brand_id
  join public.categories c on c.id = p.category_id
  left join public.variant_price_stats s on s.variant_id = l.variant_id
  left join public.promo_codes pc on pc.id = r.promo_id;

comment on view public.deal_feed is
  'Live deals with current prices from variant_offer_ranking (D1-safe). Never reads affiliate data or placements. No tracking claims on tracking-excluded retailers.';

-- Recompute with the new rules.
select public.refresh_variant_price_stats(variant_id) from (select distinct variant_id from public.retailer_offers) v;
