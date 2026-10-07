-- Prices are item prices; shipping is the store's policy, settled at checkout (owner decision, Oct 7).
-- Shipping is charged per order, not per item, and depends on the cart, the address and (Shopify
-- Collective) the supplier, so adding a flat amount to every item overstated multi-item orders and made
-- cheap accessories look dearer than on the store itself. Now:
--   · variant_offer_ranking.delivered_cents = price − applicable code (no shipping); offers rank on it,
--     then in stock → disclosed tie preference → lower shipping (free first) → name.
--   · Free-shipping codes no longer change a price (they still list as promo codes).
--   · Price history, typical price, lows, "all-time low" and recent changes use item prices too.
--   · retailers.shipping_policy: the store's policy line shown under the price ("Free shipping over $39").
-- Supersedes the best-price rule in ARCHITECTURE_PLAN.md §5 (price + shipping − promo).

alter table public.retailers add column shipping_policy text check (char_length(btrim(shipping_policy)) between 1 and 80);
comment on column public.retailers.shipping_policy is 'Shown under prices, e.g. "Free shipping over $39". Shipping itself is settled at checkout.';
update public.retailers set shipping_policy = 'Free shipping over $39' where slug = 'pickleball-grip-doctor';

create or replace view public.variant_offer_ranking with (security_barrier = true) as
with live as (
  select o.*, r.slug as retailer_slug, r.name as retailer_name, r.kind as retailer_kind, v.product_id,
         r.tracking_excluded as retailer_tracking_excluded, r.ownership_note as retailer_ownership_note,
         r.wins_price_ties as retailer_wins_ties, r.discount_link_template is not null as retailer_applies_codes,
         r.shipping_policy as retailer_shipping_policy,
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
             public.promo_discount_cents(p, l.price_cents, 0) as discount
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
       case when shown_display = 'show' then price_cents - promo_discount_cents end as delivered_cents,
       case when shown_display = 'show' then
         row_number() over (partition by variant_id, shown_display
                            order by price_cents - promo_discount_cents, in_stock desc,
                                     retailer_wins_ties desc, shipping_cents, lower(retailer_name), id)
       end as rank,
       last_checked_at,
       price_source,
       retailer_tracking_excluded as tracking_excluded,
       ships_from,
       retailer_ownership_note as ownership_note,
       (promo_code is not null and retailer_applies_codes) as code_auto_applied,
       retailer_shipping_policy as shipping_policy
  from priced;

create or replace function public.variant_daily_lows(vid uuid, days integer, retailer uuid default null)
returns table (day date, low_cents integer)
language sql
stable
security definer
set search_path = ''
as $$
  with span as (
    select d::date as day
      from generate_series(current_date - (greatest(days, 1) - 1), current_date, interval '1 day') d
  ),
  offers as (
    select o.id from public.retailer_offers o
     where o.variant_id = vid and (retailer is null or o.retailer_id = retailer)
  )
  select s.day, min(pp.price_cents)::int
    from span s
    cross join offers o
    cross join lateral (
      select p.price_cents, p.shipping_cents, p.price_display, p.active
        from public.price_points p
       where p.offer_id = o.id and p.observed_at < s.day + 1
       order by p.observed_at desc
       limit 1
    ) pp
   where pp.price_display = 'show' and pp.active and pp.price_cents is not null
   group by s.day
   order by s.day;
$$;

create or replace function public.recent_price_changes(variant uuid, max_rows integer default 10)
returns table (observed_at timestamptz, retailer_name text, previous_cents integer, price_cents integer)
language sql
stable
security definer
set search_path = ''
as $$
  select x.observed_at, x.retailer_name, x.prev, x.cur
    from (
      select p.observed_at, r.name as retailer_name,
             lag(p.price_cents) over (partition by p.offer_id order by p.observed_at) as prev,
             p.price_cents as cur
        from public.price_points p
        join public.retailer_offers o on o.id = p.offer_id
        join public.retailers r on r.id = o.retailer_id
       where o.variant_id = variant and p.price_display = 'show' and p.active and p.price_cents is not null
    ) x
   where x.prev is not null and x.prev <> x.cur
   order by x.observed_at desc
   limit least(greatest(max_rows, 1), 50);
$$;

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
  -- History records item prices (no codes), so "all-time low" compares like with like.
  select min(price_cents) into list_best
    from public.variant_offer_ranking where variant_id = vid and price_display = 'show' and not tracking_excluded;
  select count(*) into n_offers from public.variant_offer_ranking where variant_id = vid;

  select percentile_cont(0.5) within group (order by low_cents)::int, min(low_cents), count(*)
    into typical, low90, hist_days
    from public.variant_daily_lows(vid, 90);
  select min(low_cents) into low30 from public.variant_daily_lows(vid, 30);
  select min(p.price_cents) into prior_low
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
    list_now := best.price_cents;
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

-- Recompute stats and deals on the new basis.
select public.refresh_deals();
