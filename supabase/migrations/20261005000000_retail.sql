-- Phase 3: retailers, offers, price history, promo codes, best-price ranking and stats, outbound
-- clicks and the ingestion pipeline (ARCHITECTURE_PLAN §4.3, §9, D1).
--
-- D1 is enforced here, not in the UI: offers at check-price retailers (Amazon) never store a
-- manual/feed price, are never ranked, and never feed stats or price history.
-- Ranking never reads affiliate data (principle 4); a pgTAP test enforces that.

-- ---------------------------------------------------------------------------------------------
-- Types
-- ---------------------------------------------------------------------------------------------

create type public.retailer_kind as enum ('marketplace', 'retailer', 'manufacturer');
create type public.price_display as enum ('show', 'check_price');
create type public.price_source as enum ('manual', 'feed', 'api');
create type public.offer_status as enum ('active', 'inactive');
create type public.discount_type as enum ('percent', 'amount', 'free_ship');
create type public.promo_status as enum ('active', 'removed');
create type public.ingestion_kind as enum ('manual', 'csv', 'feed', 'api');
create type public.match_status as enum ('matched', 'unmatched', 'rejected');
create type public.deal_quality as enum ('above_typical', 'typical', 'good', 'excellent', 'all_time_low');

-- ---------------------------------------------------------------------------------------------
-- retailers + affiliate programs
-- ---------------------------------------------------------------------------------------------

create table public.retailers (
  id                    uuid primary key default gen_random_uuid(),
  slug                  public.slug not null unique,
  name                  text not null check (char_length(btrim(name)) between 1 and 60),
  kind                  public.retailer_kind not null default 'retailer',
  -- Offer URLs must live on this host or a subdomain (the go redirect never becomes an open redirect).
  domain                text not null check (domain ~ '^[a-z0-9-]+(\.[a-z0-9-]+)+$'),
  logo_path             text,
  -- D1: where we lack permission or reliable data, offers render "Check price" instead of a number.
  price_display_default public.price_display not null default 'show',
  is_active             boolean not null default true,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

create trigger retailers_set_updated_at before update on public.retailers
  for each row execute function public.set_updated_at();

create table public.affiliate_programs (
  id               uuid primary key default gen_random_uuid(),
  retailer_id      uuid not null unique references public.retailers (id) on delete cascade,
  network          text not null,
  -- Query string appended to offer URLs by the go function, e.g. "tag=pickledeals-20".
  tag_template     text not null check (tag_template ~ '^[A-Za-z0-9_.~-]+=[A-Za-z0-9_.~{}-]*(&[A-Za-z0-9_.~-]+=[A-Za-z0-9_.~{}-]*)*$'),
  commission_notes text,
  is_active        boolean not null default true,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

comment on table public.affiliate_programs is
  'Commission data. Never client-readable and never joined by ranking views (principle 4).';

create trigger affiliate_programs_set_updated_at before update on public.affiliate_programs
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------------------------
-- Ingestion: sources, runs, raw records (staff only)
-- ---------------------------------------------------------------------------------------------

create table public.ingestion_sources (
  id          uuid primary key default gen_random_uuid(),
  slug        public.slug not null unique,
  name        text not null,
  kind        public.ingestion_kind not null,
  retailer_id uuid references public.retailers (id) on delete set null,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now()
);

insert into public.ingestion_sources (slug, name, kind) values
  ('manual', 'Admin entry', 'manual'),
  ('csv', 'CSV import', 'csv');

create table public.ingestion_runs (
  id         uuid primary key default gen_random_uuid(),
  source_id  uuid not null references public.ingestion_sources (id),
  created_by uuid references auth.users (id) on delete set null,
  report     jsonb not null default '{}',
  created_at timestamptz not null default now()
);

create table public.raw_offer_records (
  id                 uuid primary key default gen_random_uuid(),
  run_id             uuid not null references public.ingestion_runs (id) on delete cascade,
  payload            jsonb not null,
  retailer_id        uuid references public.retailers (id) on delete set null,
  title              text,
  brand_text         text,
  gtin               text,
  upc                text,
  ean                text,
  asin               text,
  mpn                text,
  retailer_sku       text,
  external_ref       text,
  url                text,
  price_cents        integer,
  shipping_cents     integer,
  in_stock           boolean,
  available_sizes    text[],
  match_status       public.match_status not null default 'unmatched',
  matched_variant_id uuid references public.product_variants (id) on delete set null,
  match_method       text,
  match_confidence   numeric(4, 3),
  suggestions        jsonb not null default '[]',
  offer_id           uuid,
  error              text,
  created_at         timestamptz not null default now(),
  resolved_at        timestamptz,
  resolved_by        uuid references auth.users (id) on delete set null
);

create index raw_offer_records_queue on public.raw_offer_records (created_at desc) where match_status = 'unmatched';

-- ---------------------------------------------------------------------------------------------
-- retailer_offers — current state only
-- ---------------------------------------------------------------------------------------------

create table public.retailer_offers (
  id              uuid primary key default gen_random_uuid(),
  variant_id      uuid not null references public.product_variants (id) on delete cascade,
  retailer_id     uuid not null references public.retailers (id) on delete cascade,
  source_id       uuid references public.ingestion_sources (id) on delete set null,
  external_ref    text,
  url             text not null check (url ~ '^https://'),
  price_cents     integer check (price_cents > 0),
  shipping_cents  integer not null default 0 check (shipping_cents >= 0),
  in_stock        boolean not null default true,
  available_sizes text[] not null default '{}',
  status          public.offer_status not null default 'active',
  price_display   public.price_display not null,
  price_source    public.price_source not null default 'manual',
  first_seen_at   timestamptz not null default now(),
  last_checked_at timestamptz not null default now(),
  last_changed_at timestamptz not null default now(),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint retailer_offers_unique unique nulls not distinct (variant_id, retailer_id, external_ref),
  constraint retailer_offers_show_needs_price check (price_display = 'check_price' or price_cents is not null),
  constraint retailer_offers_d1_no_unverified_price check (price_display = 'show' or price_source = 'api' or price_cents is null)
);

create index retailer_offers_variant_active on public.retailer_offers (variant_id) where status = 'active';
create index retailer_offers_retailer on public.retailer_offers (retailer_id);

-- D1 + URL safety, applied to every write regardless of client.
create or replace function public.retailer_offers_enforce()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  r      public.retailers;
  host   text;
begin
  select * into r from public.retailers where id = new.retailer_id;

  -- Retailers without permission/reliable data: only an approved API may show a price.
  if r.price_display_default = 'check_price' and new.price_source <> 'api' then
    new.price_display := 'check_price';
    new.price_cents := null;
  elsif new.price_display is null then
    new.price_display := r.price_display_default;
  end if;

  host := lower(substring(new.url from '^https://([^/:?#]+)'));
  if host is null or not (host = r.domain or host like '%.' || r.domain) then
    raise exception 'offer URL must be on % (got %)', r.domain, coalesce(host, new.url) using errcode = '23514';
  end if;

  if tg_op = 'UPDATE' and (new.price_cents, new.shipping_cents, new.in_stock, new.price_display)
       is distinct from (old.price_cents, old.shipping_cents, old.in_stock, old.price_display) then
    new.last_changed_at := now();
  end if;
  return new;
end;
$$;

create trigger retailer_offers_enforce before insert or update on public.retailer_offers
  for each row execute function public.retailer_offers_enforce();

create trigger retailer_offers_set_updated_at before update on public.retailer_offers
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------------------------
-- price_points — append-only history, written on change
-- ---------------------------------------------------------------------------------------------

create table public.price_points (
  id             bigint generated always as identity primary key,
  offer_id       uuid not null references public.retailer_offers (id) on delete cascade,
  observed_at    timestamptz not null default now(),
  price_cents    integer,
  shipping_cents integer not null default 0,
  in_stock       boolean not null,
  price_display  public.price_display not null,
  active         boolean not null default true
);

create index price_points_offer_time on public.price_points (offer_id, observed_at desc);

create or replace function public.retailer_offers_record_point()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' or (new.price_cents, new.shipping_cents, new.in_stock, new.price_display, new.status)
       is distinct from (old.price_cents, old.shipping_cents, old.in_stock, old.price_display, old.status) then
    insert into public.price_points (offer_id, price_cents, shipping_cents, in_stock, price_display, active)
    values (new.id, new.price_cents, new.shipping_cents, new.in_stock, new.price_display, new.status = 'active');
  end if;
  return null;
end;
$$;

revoke execute on function public.retailer_offers_record_point() from public, anon, authenticated;

create trigger retailer_offers_record_point after insert or update on public.retailer_offers
  for each row execute function public.retailer_offers_record_point();

-- ---------------------------------------------------------------------------------------------
-- promo_codes + targets
-- ---------------------------------------------------------------------------------------------

create table public.promo_codes (
  id                 uuid primary key default gen_random_uuid(),
  retailer_id        uuid not null references public.retailers (id) on delete cascade,
  brand_id           uuid references public.brands (id) on delete set null,
  code               text not null check (code ~ '^[A-Za-z0-9_-]{2,40}$'),
  title              text not null check (char_length(btrim(title)) between 2 and 80),
  discount_type      public.discount_type not null,
  -- percent: whole percent (1–90); amount: cents; free_ship: unused (1).
  discount_value     integer not null check (discount_value > 0),
  min_purchase_cents integer not null default 0 check (min_purchase_cents >= 0),
  starts_at          timestamptz,
  ends_at            timestamptz,
  verified_at        timestamptz,
  is_exclusive       boolean not null default false,
  terms              text,
  status             public.promo_status not null default 'active',
  source_id          uuid references public.ingestion_sources (id) on delete set null,
  created_by         uuid references auth.users (id) on delete set null,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  constraint promo_codes_percent_range check (discount_type <> 'percent' or discount_value between 1 and 90),
  constraint promo_codes_dates check (ends_at is null or starts_at is null or ends_at > starts_at)
);

create unique index promo_codes_active_code on public.promo_codes (retailer_id, upper(code)) where status = 'active';

create trigger promo_codes_set_updated_at before update on public.promo_codes
  for each row execute function public.set_updated_at();

create table public.promo_code_targets (
  id          uuid primary key default gen_random_uuid(),
  promo_id    uuid not null references public.promo_codes (id) on delete cascade,
  product_id  uuid references public.products (id) on delete cascade,
  variant_id  uuid references public.product_variants (id) on delete cascade,
  category_id uuid references public.categories (id) on delete cascade,
  constraint promo_code_targets_one check (num_nonnulls(product_id, variant_id, category_id) = 1)
);

create index promo_code_targets_promo on public.promo_code_targets (promo_id);

-- Live = active, inside its dates, and verified in the last 14 days (§9: stale codes are hidden).
create or replace function public.promo_is_live(p public.promo_codes)
returns boolean
language sql
stable
set search_path = ''
as $$
  select p.status = 'active'
     and p.verified_at is not null and p.verified_at > now() - interval '14 days'
     and (p.starts_at is null or p.starts_at <= now())
     and (p.ends_at is null or p.ends_at > now());
$$;

-- Discount a live promo gives an offer, in cents. Percent discounts round down: never overstate.
create or replace function public.promo_discount_cents(p public.promo_codes, price_cents integer, shipping_cents integer)
returns integer
language sql
immutable
set search_path = ''
as $$
  select case
    when price_cents is null or price_cents < p.min_purchase_cents then 0
    when p.discount_type = 'percent' then floor(price_cents::numeric * p.discount_value / 100)::int
    when p.discount_type = 'amount' then least(p.discount_value, price_cents)
    else shipping_cents
  end;
$$;

-- ---------------------------------------------------------------------------------------------
-- outbound_clicks — written by the go function only
-- ---------------------------------------------------------------------------------------------

create table public.outbound_clicks (
  id         bigint generated always as identity primary key,
  user_id    uuid references auth.users (id) on delete set null,
  offer_id   uuid references public.retailer_offers (id) on delete set null,
  promo_id   uuid references public.promo_codes (id) on delete set null,
  placement  text check (char_length(placement) <= 40),
  created_at timestamptz not null default now()
);

create index outbound_clicks_offer on public.outbound_clicks (offer_id, created_at desc);

-- ---------------------------------------------------------------------------------------------
-- Ranking: delivered = price + shipping − best live promo. check_price offers are listed but
-- never ranked. Definer views: clients cannot read retailer_offers directly (it would expose
-- stored API prices of check_price offers); these return public fields only.
-- ---------------------------------------------------------------------------------------------

create view public.variant_offer_ranking with (security_barrier = true) as
with live as (
  select o.*, r.slug as retailer_slug, r.name as retailer_name, r.kind as retailer_kind, v.product_id
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
         and l.price_display = 'show'
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
       price_display,
       case when price_display = 'show' then price_cents end as price_cents,
       case when price_display = 'show' then shipping_cents end as shipping_cents,
       in_stock, available_sizes,
       promo_id, promo_code,
       case when price_display = 'show' then promo_discount_cents end as promo_discount_cents,
       case when price_display = 'show' then price_cents + shipping_cents - promo_discount_cents end as delivered_cents,
       case when price_display = 'show' then
         row_number() over (partition by variant_id, price_display
                            order by price_cents + shipping_cents - promo_discount_cents, in_stock desc, last_checked_at desc)
       end as rank,
       last_checked_at
  from priced;

comment on view public.variant_offer_ranking is
  'Best-price ranking (§4.3). Uses consumer-facing price data only; never reads affiliate_programs.';

create view public.live_promo_codes with (security_barrier = true) as
select p.id, p.retailer_id, r.slug as retailer_slug, r.name as retailer_name, p.brand_id, p.code, p.title,
       p.discount_type, p.discount_value, p.min_purchase_cents, p.ends_at, p.verified_at, p.is_exclusive, p.terms
  from public.promo_codes p
  join public.retailers r on r.id = p.retailer_id and r.is_active
 where public.promo_is_live(p);

-- ---------------------------------------------------------------------------------------------
-- variant_price_stats — derived; refreshed when offers or promos change
-- ---------------------------------------------------------------------------------------------

create table public.variant_price_stats (
  variant_id           uuid primary key references public.product_variants (id) on delete cascade,
  best_offer_id        uuid,
  best_delivered_cents integer,
  best_price_cents     integer,
  offer_count          integer not null default 0,
  typical_cents        integer,
  low_30d_cents        integer,
  low_90d_cents        integer,
  low_all_time_cents   integer,
  history_days         integer not null default 0,
  deal_quality         public.deal_quality,
  updated_at           timestamptz not null default now()
);

-- Daily lowest delivered price (price + shipping, promos excluded) across a variant's priced
-- offers, carrying each offer's last known price forward through days without changes.
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
  select s.day, min(pp.price_cents + pp.shipping_cents)::int
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
    from public.variant_offer_ranking where variant_id = vid and rank = 1;
  -- History records price + shipping only, so "all-time low" compares like with like (no codes).
  select min(price_cents + shipping_cents) into list_best
    from public.variant_offer_ranking where variant_id = vid and price_display = 'show';
  select count(*) into n_offers from public.variant_offer_ranking where variant_id = vid;

  select percentile_cont(0.5) within group (order by low_cents)::int, min(low_cents), count(*)
    into typical, low90, hist_days
    from public.variant_daily_lows(vid, 90);
  select min(low_cents) into low30 from public.variant_daily_lows(vid, 30);
  select min(p.price_cents + p.shipping_cents) into prior_low
    from public.price_points p join public.retailer_offers o on o.id = p.offer_id
   where o.variant_id = vid and p.price_display = 'show' and p.active and p.price_cents is not null
     and p.observed_at < current_date;

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

revoke execute on function public.refresh_variant_price_stats(uuid) from public, anon, authenticated;
revoke execute on function public.variant_daily_lows(uuid, integer, uuid) from public;
grant execute on function public.variant_daily_lows(uuid, integer, uuid) to anon, authenticated;

-- Synchronous refresh for V1 volumes. Phase 4+ can move this to a pgmq 'offer_changed' queue.
create or replace function public.refresh_stats_on_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  vid uuid;
  rid uuid;
begin
  if tg_table_name = 'retailer_offers' then
    if tg_op in ('INSERT', 'UPDATE') then
      perform public.refresh_variant_price_stats(new.variant_id);
    end if;
    if tg_op = 'DELETE' then
      perform public.refresh_variant_price_stats(old.variant_id);
    elsif tg_op = 'UPDATE' and old.variant_id is distinct from new.variant_id then
      perform public.refresh_variant_price_stats(old.variant_id);
    end if;
  else
    -- promo_codes / promo_code_targets: every variant with an offer at the affected retailer.
    if tg_table_name = 'promo_codes' then
      rid := case when tg_op = 'DELETE' then old.retailer_id else new.retailer_id end;
    else
      select p.retailer_id into rid from public.promo_codes p
       where p.id = case when tg_op = 'DELETE' then old.promo_id else new.promo_id end;
    end if;
    for vid in select distinct o.variant_id from public.retailer_offers o where o.retailer_id = rid loop
      perform public.refresh_variant_price_stats(vid);
    end loop;
  end if;
  return null;
end;
$$;

revoke execute on function public.refresh_stats_on_change() from public, anon, authenticated;

create trigger retailer_offers_refresh_stats after insert or update or delete on public.retailer_offers
  for each row execute function public.refresh_stats_on_change();
create trigger promo_codes_refresh_stats after insert or update or delete on public.promo_codes
  for each row execute function public.refresh_stats_on_change();
create trigger promo_code_targets_refresh_stats after insert or update or delete on public.promo_code_targets
  for each row execute function public.refresh_stats_on_change();

-- ---------------------------------------------------------------------------------------------
-- Public history RPCs (priced offers only — D1)
-- ---------------------------------------------------------------------------------------------

create or replace function public.price_history(variant uuid, days integer default 90, retailer_slug text default null)
returns table (day date, low_cents integer)
language sql
stable
security definer
set search_path = ''
as $$
  -- A retailer filter that names a check-price (or unknown) retailer returns nothing, never "all".
  select h.* from public.variant_daily_lows(
           variant, least(greatest(days, 7), 1825),
           (select r.id from public.retailers r where r.slug = retailer_slug)) h
   where retailer_slug is null
      or exists (select 1 from public.retailers r where r.slug = retailer_slug and r.price_display_default = 'show');
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
             lag(p.price_cents + p.shipping_cents) over (partition by p.offer_id order by p.observed_at) as prev,
             p.price_cents + p.shipping_cents as cur
        from public.price_points p
        join public.retailer_offers o on o.id = p.offer_id
        join public.retailers r on r.id = o.retailer_id
       where o.variant_id = variant and p.price_display = 'show' and p.active and p.price_cents is not null
    ) x
   where x.prev is not null and x.prev <> x.cur
   order by x.observed_at desc
   limit least(greatest(max_rows, 1), 50);
$$;

revoke execute on function public.price_history(uuid, integer, text), public.recent_price_changes(uuid, integer) from public;
grant execute on function public.price_history(uuid, integer, text), public.recent_price_changes(uuid, integer) to anon, authenticated;

-- ---------------------------------------------------------------------------------------------
-- RLS + privileges
-- ---------------------------------------------------------------------------------------------

alter table public.retailers enable row level security;
alter table public.affiliate_programs enable row level security;
alter table public.ingestion_sources enable row level security;
alter table public.ingestion_runs enable row level security;
alter table public.raw_offer_records enable row level security;
alter table public.retailer_offers enable row level security;
alter table public.price_points enable row level security;
alter table public.promo_codes enable row level security;
alter table public.promo_code_targets enable row level security;
alter table public.outbound_clicks enable row level security;
alter table public.variant_price_stats enable row level security;

create policy "active retailers are public" on public.retailers for select
  to anon, authenticated using (is_active or (select public.is_staff()));
create policy "price stats are public" on public.variant_price_stats for select
  to anon, authenticated using (true);

-- Staff read/write (affiliate programs: admins only; clicks: admins read, nobody writes but go).
do $$
declare
  t text;
begin
  foreach t in array array['retailers', 'ingestion_sources', 'ingestion_runs', 'raw_offer_records', 'retailer_offers',
                           'promo_codes', 'promo_code_targets'] loop
    if t <> 'retailers' then
      execute format('create policy "staff read %1$s" on public.%1$I for select to authenticated using ((select public.is_staff()))', t);
    end if;
    execute format('create policy "staff insert %1$s" on public.%1$I for insert to authenticated with check ((select public.is_staff()))', t);
    execute format('create policy "staff update %1$s" on public.%1$I for update to authenticated using ((select public.is_staff())) with check ((select public.is_staff()))', t);
    execute format('create policy "staff delete %1$s" on public.%1$I for delete to authenticated using ((select public.is_staff()))', t);
  end loop;
end;
$$;

create policy "staff read price points" on public.price_points for select to authenticated using ((select public.is_staff()));
create policy "admins manage affiliate programs" on public.affiliate_programs for all
  to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
create policy "admins read clicks" on public.outbound_clicks for select to authenticated using ((select public.is_admin()));

revoke all on public.retailers, public.affiliate_programs, public.ingestion_sources, public.ingestion_runs,
  public.raw_offer_records, public.retailer_offers, public.price_points, public.promo_codes,
  public.promo_code_targets, public.outbound_clicks, public.variant_price_stats,
  public.variant_offer_ranking, public.live_promo_codes from anon, authenticated;

grant select on public.retailers, public.variant_price_stats, public.variant_offer_ranking, public.live_promo_codes to anon, authenticated;
grant insert, update, delete on public.retailers to authenticated;
grant select, insert, update, delete on public.affiliate_programs, public.ingestion_sources, public.ingestion_runs,
  public.raw_offer_records, public.retailer_offers, public.promo_codes, public.promo_code_targets to authenticated;
grant select on public.price_points, public.outbound_clicks to authenticated;
