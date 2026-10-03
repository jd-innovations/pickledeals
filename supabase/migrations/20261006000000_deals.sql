-- Phase 4: deals discovery (§4.3, §13). A deal is a time-bounded, noteworthy state of an offer —
-- detected automatically from prices, or curated by staff — never a separate product.
-- Collections are editorial groupings; placements are labelled sponsored inventory that never
-- changes best-price ranking. D1 carries through: check-price offers never become auto deals.

create type public.deal_kind as enum ('price_drop', 'sale', 'promo', 'editorial');
create type public.deal_status as enum ('active', 'expired', 'removed');
create type public.deal_origin as enum ('auto', 'curated');
create type public.collection_kind as enum ('editorial', 'sponsored');
create type public.placement_kind as enum ('sponsored_deal', 'sponsored_product', 'sponsored_collection');

-- ---------------------------------------------------------------------------------------------
-- deals
-- ---------------------------------------------------------------------------------------------

create table public.deals (
  id              uuid primary key default gen_random_uuid(),
  variant_id      uuid not null references public.product_variants (id) on delete cascade,
  -- Auto deals follow the variant's best offer; curated deals may pin a specific offer.
  offer_id        uuid references public.retailer_offers (id) on delete set null,
  kind            public.deal_kind not null,
  headline        text not null check (char_length(btrim(headline)) between 2 and 90),
  origin          public.deal_origin not null,
  status          public.deal_status not null default 'active',
  is_staff_pick   boolean not null default false,
  -- Reference shown as "was": MSRP for sales and codes, typical price for price drops.
  reference_cents integer check (reference_cents > 0),
  drop_7d_cents   integer not null default 0,
  starts_at       timestamptz not null default now(),
  ends_at         timestamptz,
  created_by      uuid references auth.users (id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint deals_dates check (ends_at is null or ends_at >= starts_at)
);

-- One live automatic deal per variant: its id stays stable while the deal stays valid (links and
-- saves keep working); a new episode starts after it expires.
create unique index deals_one_active_auto on public.deals (variant_id) where origin = 'auto' and status = 'active';
create index deals_status_ends on public.deals (status, ends_at);
create index deals_variant on public.deals (variant_id);

create trigger deals_set_updated_at before update on public.deals
  for each row execute function public.set_updated_at();

-- "$20", "$34.35" — whole dollars drop the cents (copy only; money stays integer cents).
create or replace function public.format_usd(cents integer)
returns text
language sql
immutable
set search_path = ''
as $$
  select '$' || case when cents % 100 = 0 then to_char(cents / 100, 'FM999,999,990')
                     else to_char(cents / 100.0, 'FM999,999,990.00') end;
$$;

-- Best "list" price (price + shipping, no code) on a given day, for 7-day drops.
create or replace function public.variant_low_on(vid uuid, d date)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select low_cents from public.variant_daily_lows(vid, (current_date - d) + 1) where day = d;
$$;

-- Detects, updates or expires a variant's automatic deal from its current best priced offer.
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
  v_kind     public.deal_kind;
  v_headline text;
  v_ref      integer;
  existing  uuid;
begin
  select o.offer_id, o.delivered_cents, o.price_cents, o.shipping_cents, o.promo_code, o.promo_discount_cents
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
    elsif s.deal_quality in ('good', 'excellent', 'all_time_low') then
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

  select id into existing from public.deals where variant_id = vid and origin = 'auto' and status = 'active';

  if v_kind is null then
    update public.deals set status = 'expired', ends_at = now() where id = existing;
  elsif existing is null then
    insert into public.deals (variant_id, offer_id, kind, headline, origin, reference_cents, drop_7d_cents)
    values (vid, best.offer_id, v_kind, v_headline, 'auto', v_ref, greatest(coalesce(week_ago - list_now, 0), 0));
  else
    update public.deals
       set offer_id = best.offer_id, kind = v_kind, headline = v_headline,
           reference_cents = v_ref, drop_7d_cents = greatest(coalesce(week_ago - list_now, 0), 0)
     where id = existing
       and (offer_id, deals.kind, deals.headline, reference_cents, drop_7d_cents)
           is distinct from (best.offer_id, v_kind, v_headline, v_ref, greatest(coalesce(week_ago - list_now, 0), 0));
  end if;
end;
$$;

revoke execute on function public.detect_deal(uuid), public.variant_low_on(uuid, date) from public, anon, authenticated;

-- Detection runs whenever stats refresh (offer or promo changes).
create or replace function public.detect_deal_on_stats()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.detect_deal(new.variant_id);
  return null;
end;
$$;

revoke execute on function public.detect_deal_on_stats() from public, anon, authenticated;

create trigger variant_price_stats_detect_deal after insert or update on public.variant_price_stats
  for each row execute function public.detect_deal_on_stats();

-- Time-based hygiene (codes expiring, stale verification, ended curated deals). Scheduled below.
create or replace function public.refresh_deals()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  vid uuid;
  n   integer := 0;
begin
  update public.deals set status = 'expired' where status = 'active' and ends_at is not null and ends_at <= now();
  for vid in select distinct variant_id from public.retailer_offers where status = 'active' loop
    perform public.refresh_variant_price_stats(vid);
    n := n + 1;
  end loop;
  return n;
end;
$$;

revoke execute on function public.refresh_deals() from public, anon, authenticated;

-- ---------------------------------------------------------------------------------------------
-- collections + placements
-- ---------------------------------------------------------------------------------------------

create table public.collections (
  id         uuid primary key default gen_random_uuid(),
  slug       public.slug not null unique,
  title      text not null check (char_length(btrim(title)) between 2 and 60),
  subtitle   text check (char_length(subtitle) <= 120),
  eyebrow    text check (char_length(eyebrow) <= 40),
  kind       public.collection_kind not null default 'editorial',
  sort       integer not null default 0,
  is_active  boolean not null default true,
  starts_at  timestamptz,
  ends_at    timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger collections_set_updated_at before update on public.collections
  for each row execute function public.set_updated_at();

create table public.collection_items (
  id            uuid primary key default gen_random_uuid(),
  collection_id uuid not null references public.collections (id) on delete cascade,
  deal_id       uuid references public.deals (id) on delete cascade,
  product_id    uuid references public.products (id) on delete cascade,
  sort          integer not null default 0,
  constraint collection_items_one check (num_nonnulls(deal_id, product_id) = 1)
);

create index collection_items_collection on public.collection_items (collection_id, sort);

create table public.placements (
  id         uuid primary key default gen_random_uuid(),
  kind       public.placement_kind not null,
  deal_id    uuid references public.deals (id) on delete cascade,
  product_id uuid references public.products (id) on delete cascade,
  collection_id uuid references public.collections (id) on delete cascade,
  campaign   text not null check (char_length(btrim(campaign)) between 2 and 60),
  -- Sponsored inventory is always labelled in the app.
  label      text not null default 'Sponsored' check (char_length(btrim(label)) between 2 and 30),
  sort       integer not null default 0,
  is_active  boolean not null default true,
  starts_at  timestamptz not null default now(),
  ends_at    timestamptz,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint placements_target check (
    (kind = 'sponsored_deal' and deal_id is not null and num_nonnulls(product_id, collection_id) = 0)
    or (kind = 'sponsored_product' and product_id is not null and num_nonnulls(deal_id, collection_id) = 0)
    or (kind = 'sponsored_collection' and collection_id is not null and num_nonnulls(deal_id, product_id) = 0))
);

create trigger placements_set_updated_at before update on public.placements
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------------------------
-- deal_feed — public fields of live deals with current prices (definer view; D1-safe because it
-- reads prices only from variant_offer_ranking, which nulls check-price offers)
-- ---------------------------------------------------------------------------------------------

create view public.deal_feed with (security_barrier = true) as
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
       l.drop_7d_cents, s.deal_quality, s.offer_count,
       least(l.ends_at, pc.ends_at) as ends_at,
       (select jsonb_build_object('path', i.storage_path, 'is_cutout', i.is_cutout, 'blurhash', i.blurhash)
          from public.product_images i
         where i.product_id = p.id and i.status = 'active' and (i.rights_expires_at is null or i.rights_expires_at > now())
         order by i.sort limit 1) as image,
       array_remove(array[
         case when s.deal_quality = 'all_time_low' then 'LOWEST PRICE' end,
         case when l.drop_7d_cents > 0 and r.delivered_cents is not null and l.drop_7d_cents >= r.delivered_cents * 0.05 then 'PRICE DROP' end,
         case when least(l.ends_at, pc.ends_at) <= now() + interval '48 hours' then 'ENDING SOON' end,
         case when r.promo_code is not null then 'PROMO CODE' end,
         case when s.deal_quality = 'excellent' then 'HOT DEAL' end,
         case when l.starts_at > now() - interval '48 hours' then 'NEW DEAL' end
       ], null) as badges,
       -- Feed order: staff picks, then the biggest honest saving, then the newest.
       (case when l.is_staff_pick then 1000 else 0 end)
         + coalesce(floor((coalesce(l.reference_cents, v.msrp_cents, p.msrp_cents) - r.delivered_cents) * 100.0
                          / nullif(coalesce(l.reference_cents, v.msrp_cents, p.msrp_cents), 0)), 0)
         + case when s.deal_quality = 'all_time_low' then 15 when s.deal_quality = 'excellent' then 10 else 0 end as score
  from live l
  join public.variant_offer_ranking r on r.offer_id = l.current_offer_id
  join public.product_variants v on v.id = l.variant_id
  join public.products p on p.id = v.product_id
  join public.brands b on b.id = p.brand_id
  join public.categories c on c.id = p.category_id
  left join public.variant_price_stats s on s.variant_id = l.variant_id
  left join public.promo_codes pc on pc.id = r.promo_id;

comment on view public.deal_feed is
  'Live deals with current prices from variant_offer_ranking (D1-safe). Never reads affiliate data or placements.';

-- ---------------------------------------------------------------------------------------------
-- Feeds and filters (public)
-- ---------------------------------------------------------------------------------------------

create or replace function public.deals_feed(
  feed          text default 'today',
  category_slug text default null,
  brand_slug    text default null,
  collection_slug text default null,
  min_cents     integer default null,
  max_cents     integer default null,
  brand_slugs   text[] default null,
  kinds         text[] default null,
  in_stock_only boolean default false,
  sort          text default null,
  max_rows      integer default 40,
  skip          integer default 0)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with filtered as (
    -- One card per product: its best-scoring live deal (variants share a product page).
    select distinct on (f.product_id) f.*
      from public.deal_feed f
     where (deals_feed.category_slug is null or f.category_slug = deals_feed.category_slug)
       and (deals_feed.brand_slug is null or f.brand_slug = deals_feed.brand_slug)
       and (deals_feed.collection_slug is null or exists (
             select 1 from public.collection_items ci join public.collections co on co.id = ci.collection_id
              where co.slug = deals_feed.collection_slug and co.is_active
                and (ci.deal_id = f.deal_id or ci.product_id = f.product_id)))
       and (min_cents is null or f.price_cents >= min_cents)
       and (max_cents is null or f.price_cents <= max_cents)
       and (brand_slugs is null or cardinality(brand_slugs) = 0 or f.brand_slug = any (brand_slugs))
       and (kinds is null or cardinality(kinds) = 0 or f.kind::text = any (kinds))
       and (not in_stock_only or f.in_stock)
       and case feed
             when 'price_drops' then f.drop_7d_cents > 0
             when 'ending_soon' then f.ends_at is not null and f.ends_at <= now() + interval '7 days'
             when 'promo_codes' then f.promo_code is not null
             when 'under_50' then f.price_cents <= 5000
             when 'under_100' then f.price_cents <= 10000
             when 'new' then f.starts_at > now() - interval '7 days'
             when 'staff_picks' then f.is_staff_pick
             else true
           end
     order by f.product_id, f.score desc, f.price_cents nulls last
  ),
  ordered as (
    select f.*, row_number() over (
             order by
               case coalesce(sort, case feed when 'price_drops' then 'drop' when 'ending_soon' then 'ending'
                                             when 'new' then 'newest' else 'best' end)
                 when 'drop' then -f.drop_7d_cents
                 when 'discount' then -coalesce(f.discount_pct, 0)
                 when 'price_asc' then coalesce(f.price_cents, 2147483647)
                 when 'price_desc' then -coalesce(f.price_cents, 0)
                 when 'ending' then extract(epoch from coalesce(f.ends_at, 'infinity'::timestamptz))
                 when 'newest' then -extract(epoch from f.starts_at)
                 else -f.score
               end,
               f.product_name) as rn
      from filtered f
  )
  select jsonb_build_object(
    'total', (select count(*) from filtered),
    'items', coalesce((select jsonb_agg(to_jsonb(o) - 'rn' - 'score' order by o.rn)
                         from ordered o
                        where o.rn > greatest(skip, 0) and o.rn <= greatest(skip, 0) + least(greatest(max_rows, 1), 100)), '[]'::jsonb));
$$;

-- Everything Deals home needs in one round trip.
create or replace function public.deals_home()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with top_category as (
    select category_slug, category_name, count(*) as n
      from public.deal_feed group by 1, 2 order by n desc, category_slug limit 1
  )
  select jsonb_build_object(
    'live_count', (select count(distinct product_id) from public.deal_feed),
    'checked_at', (select max(last_checked_at) from public.variant_offer_ranking),
    'hero', (select to_jsonb(f) - 'score' from public.deal_feed f where f.price_cents is not null
              order by f.is_staff_pick desc, f.score desc, f.product_name limit 1),
    'price_drops', public.deals_feed('price_drops', max_rows => 3) -> 'items',
    'trending', (select jsonb_build_object('category_slug', t.category_slug, 'category_name', t.category_name,
                                           'items', public.deals_feed('today', category_slug => t.category_slug, max_rows => 8) -> 'items')
                   from top_category t),
    'collections', coalesce((
      select jsonb_agg(jsonb_build_object('slug', co.slug, 'title', co.title, 'subtitle', co.subtitle, 'eyebrow', co.eyebrow,
                                          'deal_count', (public.deals_feed(collection_slug => co.slug, max_rows => 1) ->> 'total')::int,
                                          'from_cents', (select min(f.price_cents) from public.deal_feed f join public.collection_items ci
                                                           on ci.deal_id = f.deal_id or ci.product_id = f.product_id
                                                          where ci.collection_id = co.id))
                       order by co.sort)
        from public.collections co
       where co.is_active and co.kind = 'editorial'
         and (co.starts_at is null or co.starts_at <= now()) and (co.ends_at is null or co.ends_at > now())), '[]'::jsonb),
    'sponsored', coalesce((
      select jsonb_agg(jsonb_build_object('label', pl.label, 'campaign', pl.campaign, 'deal', to_jsonb(f) - 'score') order by pl.sort)
        from public.placements pl
        join public.deal_feed f on f.deal_id = pl.deal_id
       where pl.is_active and pl.kind = 'sponsored_deal' and pl.starts_at <= now() and (pl.ends_at is null or pl.ends_at > now())), '[]'::jsonb),
    'promos', coalesce((
      select jsonb_agg(to_jsonb(x) order by x.verified_at desc)
        from (select * from public.live_promo_codes order by verified_at desc limit 4) x), '[]'::jsonb),
    'under_100', public.deals_feed('under_100', max_rows => 4) -> 'items'
  );
$$;

revoke execute on function public.deals_feed(text, text, text, text, integer, integer, text[], text[], boolean, text, integer, integer),
  public.deals_home() from public;
grant execute on function public.deals_feed(text, text, text, text, integer, integer, text[], text[], boolean, text, integer, integer),
  public.deals_home() to anon, authenticated;

-- ---------------------------------------------------------------------------------------------
-- RLS + privileges
-- ---------------------------------------------------------------------------------------------

alter table public.deals enable row level security;
alter table public.collections enable row level security;
alter table public.collection_items enable row level security;
alter table public.placements enable row level security;

create policy "active collections are public" on public.collections for select
  to anon, authenticated using (is_active or (select public.is_staff()));
create policy "items of active collections are public" on public.collection_items for select
  to anon, authenticated using (exists (select 1 from public.collections c where c.id = collection_id and (c.is_active or (select public.is_staff()))));

do $$
declare
  t text;
begin
  foreach t in array array['deals', 'collections', 'collection_items', 'placements'] loop
    if t in ('deals', 'placements') then
      execute format('create policy "staff read %1$s" on public.%1$I for select to authenticated using ((select public.is_staff()))', t);
    end if;
    execute format('create policy "staff insert %1$s" on public.%1$I for insert to authenticated with check ((select public.is_staff()))', t);
    execute format('create policy "staff update %1$s" on public.%1$I for update to authenticated using ((select public.is_staff())) with check ((select public.is_staff()))', t);
    execute format('create policy "staff delete %1$s" on public.%1$I for delete to authenticated using ((select public.is_staff()))', t);
  end loop;
end;
$$;

revoke all on public.deals, public.collections, public.collection_items, public.placements, public.deal_feed from anon, authenticated;
grant select on public.collections, public.collection_items, public.deal_feed to anon, authenticated;
grant select, insert, update, delete on public.deals, public.placements to authenticated;
grant insert, update, delete on public.collections, public.collection_items to authenticated;

-- ---------------------------------------------------------------------------------------------
-- Schedule: expire ended deals and re-evaluate time-sensitive states every 30 minutes.
-- ---------------------------------------------------------------------------------------------

create extension if not exists pg_cron;
select cron.schedule('refresh-deals', '*/30 * * * *', 'select public.refresh_deals()');
