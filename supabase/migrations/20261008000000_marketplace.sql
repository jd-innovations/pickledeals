-- Phase 6: marketplace listings (§4.5, §8, D2, D3). Listings are public once published; status
-- changes go through RPCs only. D2: the device sends a point to an RPC that snaps it to the
-- geohash-6 cell centre (~1 km) — exact coordinates are never stored in any table, view or RPC.
-- D3: custom (non-catalog) listings are allowed and queued for admin catalog review.

create type public.listing_condition as enum ('new_sealed', 'like_new', 'excellent', 'good', 'fair');
create type public.listing_status as enum ('draft', 'active', 'pending', 'sold', 'removed');
create type public.catalog_review_decision as enum ('pending', 'linked', 'promoted', 'dismissed');

-- ---------------------------------------------------------------------------------------------
-- Location snapping (D2)
-- ---------------------------------------------------------------------------------------------

-- Snaps a point to the centre of its geohash cell. precision 6 ≈ 1.2 × 0.6 km (listings),
-- 5 ≈ 4.9 × 4.9 km (home areas). Grid snapping, not jitter: averaging can't recover a home.
create or replace function public.snap_point(lat double precision, lng double precision, cell_precision integer default 6)
returns table (point extensions.geography, geohash text)
language sql
immutable
set search_path = ''
as $$
  select extensions.st_pointfromgeohash(g)::extensions.geography, g
    from (select extensions.st_geohash(extensions.st_setsrid(extensions.st_makepoint(lng, lat), 4326), cell_precision) as g) x
   where lat between -90 and 90 and lng between -180 and 180;
$$;

-- ---------------------------------------------------------------------------------------------
-- listings
-- ---------------------------------------------------------------------------------------------

create table public.listings (
  id                uuid primary key default gen_random_uuid(),
  seller_id         uuid not null references auth.users (id) on delete cascade,
  product_id        uuid references public.products (id) on delete set null,
  variant_id        uuid references public.product_variants (id) on delete set null,
  category_id       uuid not null references public.categories (id),
  custom_title      text check (char_length(btrim(custom_title)) between 3 and 80),
  custom_brand_text text check (char_length(btrim(custom_brand_text)) between 1 and 40),
  -- D3: custom items may name a known brand.
  brand_id          uuid references public.brands (id) on delete set null,
  condition         public.listing_condition not null,
  price_cents       integer not null check (price_cents between 100 and 1000000),
  accepts_offers    boolean not null default true,
  description       text not null default '' check (char_length(description) <= 1000),
  pickup            boolean not null default true,
  ships             boolean not null default false,
  status            public.listing_status not null default 'draft',
  sold_to_user_id   uuid references auth.users (id) on delete set null,
  sold_price_cents  integer check (sold_price_cents > 0),
  removed_reason    text,
  published_at      timestamptz,
  sold_at           timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  constraint listings_what check (product_id is not null or custom_title is not null),
  constraint listings_handover check (pickup or ships)
);

create index listings_status_published on public.listings (status, published_at desc);
create index listings_product_live on public.listings (product_id) where status in ('active', 'pending');
create index listings_seller_status on public.listings (seller_id, status);
create index listings_variant on public.listings (variant_id);

create trigger listings_set_updated_at before update on public.listings
  for each row execute function public.set_updated_at();

-- Catalog listings take their category from the product, and variants must belong to it.
create or replace function public.listings_normalize()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.product_id is not null then
    select p.category_id into new.category_id from public.products p where p.id = new.product_id;
    if new.variant_id is not null
       and not exists (select 1 from public.product_variants v where v.id = new.variant_id and v.product_id = new.product_id) then
      raise exception 'variant does not belong to the product' using errcode = '23514';
    end if;
  else
    new.variant_id := null;
  end if;
  new.description := btrim(new.description);
  return new;
end;
$$;

create trigger listings_normalize before insert or update of product_id, variant_id, description on public.listings
  for each row execute function public.listings_normalize();

-- Seller-only settings (buyers can't read the auto-decline floor).
create table public.listing_private (
  listing_id              uuid primary key references public.listings (id) on delete cascade,
  hide_offers_below_cents integer check (hide_offers_below_cents > 0)
);

create table public.listing_images (
  id           uuid primary key default gen_random_uuid(),
  listing_id   uuid not null references public.listings (id) on delete cascade,
  storage_path text not null unique,
  sort         integer not null default 0,
  width        integer check (width > 0),
  height       integer check (height > 0),
  blurhash     text,
  created_at   timestamptz not null default now()
);

create index listing_images_listing on public.listing_images (listing_id, sort);

-- Approximate public location only (D2).
create table public.listing_locations (
  listing_id   uuid primary key references public.listings (id) on delete cascade,
  public_point extensions.geography(point, 4326) not null,
  geohash6     text not null check (char_length(geohash6) = 6),
  area_label   text not null check (char_length(btrim(area_label)) between 2 and 60),
  postal_code  text check (postal_code ~ '^[0-9]{5}$')
);

create index listing_locations_point on public.listing_locations using gist (public_point);

-- D3: admin review of custom listings (link to an existing product or promote to a draft one).
create table public.listing_catalog_reviews (
  id                   uuid primary key default gen_random_uuid(),
  listing_id           uuid not null unique references public.listings (id) on delete cascade,
  suggested_product_id uuid references public.products (id) on delete set null,
  suggestions          jsonb not null default '[]',
  decision             public.catalog_review_decision not null default 'pending',
  notes                text,
  reviewed_by          uuid references auth.users (id) on delete set null,
  reviewed_at          timestamptz,
  created_at           timestamptz not null default now()
);

create table public.saved_listings (
  user_id    uuid not null references auth.users (id) on delete cascade,
  listing_id uuid not null references public.listings (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, listing_id)
);

-- Seller's approximate home area (D2: snapped; private). Used for "near you" and used alerts.
alter table public.profiles_private
  add column home_point extensions.geography(point, 4326),
  add column home_label text check (char_length(btrim(home_label)) between 2 and 60);

-- Words that can't appear in a listing (prohibited items, counterfeits). Staff-managed.
create table public.prohibited_terms (
  term       text primary key check (term = lower(btrim(term)) and char_length(term) >= 3),
  reason     text not null,
  created_at timestamptz not null default now()
);

insert into public.prohibited_terms (term, reason) values
  ('counterfeit', 'Counterfeit goods aren’t allowed.'),
  ('replica', 'Replicas aren’t allowed.'),
  ('knockoff', 'Knockoffs aren’t allowed.'),
  ('stolen', 'Stolen goods aren’t allowed.');

-- ---------------------------------------------------------------------------------------------
-- variant_market_stats — what pre-owned sells for (sold prices weighted ×2), last 180 days
-- ---------------------------------------------------------------------------------------------

create table public.variant_market_stats (
  variant_id      uuid primary key references public.product_variants (id) on delete cascade,
  active_listings integer not null default 0,
  min_ask_cents   integer,
  used_p25_cents  integer,
  used_p75_cents  integer,
  updated_at      timestamptz not null default now()
);

create or replace function public.refresh_variant_market_stats(vid uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if vid is null then
    return;
  end if;
  insert into public.variant_market_stats as s (variant_id, active_listings, min_ask_cents, used_p25_cents, used_p75_cents, updated_at)
  select vid,
         count(*) filter (where l.status = 'active'),
         min(l.price_cents) filter (where l.status = 'active'),
         (select percentile_disc(0.25) within group (order by p)::int from (
            select coalesce(x.sold_price_cents, x.price_cents) as p from public.listings x
             where x.variant_id = vid and x.status in ('active', 'pending', 'sold') and x.published_at > now() - interval '180 days'
            union all
            select x.sold_price_cents from public.listings x
             where x.variant_id = vid and x.status = 'sold' and x.sold_price_cents is not null and x.published_at > now() - interval '180 days') w),
         (select percentile_disc(0.75) within group (order by p)::int from (
            select coalesce(x.sold_price_cents, x.price_cents) as p from public.listings x
             where x.variant_id = vid and x.status in ('active', 'pending', 'sold') and x.published_at > now() - interval '180 days'
            union all
            select x.sold_price_cents from public.listings x
             where x.variant_id = vid and x.status = 'sold' and x.sold_price_cents is not null and x.published_at > now() - interval '180 days') w),
         now()
    from public.listings l
   where l.variant_id = vid and l.status <> 'draft'
  on conflict (variant_id) do update set
    active_listings = excluded.active_listings, min_ask_cents = excluded.min_ask_cents,
    used_p25_cents = excluded.used_p25_cents, used_p75_cents = excluded.used_p75_cents, updated_at = now();
end;
$$;

revoke execute on function public.refresh_variant_market_stats(uuid) from public, anon, authenticated;

create or replace function public.listings_after_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op in ('INSERT', 'UPDATE') then
    perform public.refresh_variant_market_stats(new.variant_id);
  end if;
  if tg_op in ('UPDATE', 'DELETE') and old.variant_id is distinct from (case when tg_op = 'UPDATE' then new.variant_id end) then
    perform public.refresh_variant_market_stats(old.variant_id);
  end if;
  return null;
end;
$$;

revoke execute on function public.listings_after_change() from public, anon, authenticated;

create trigger listings_market_stats after insert or update of status, price_cents, sold_price_cents, variant_id or delete on public.listings
  for each row execute function public.listings_after_change();

-- ---------------------------------------------------------------------------------------------
-- Publish / status / location RPCs
-- ---------------------------------------------------------------------------------------------

-- Checks shared by publish and edit. Raises with a user-facing message.
create or replace function public.check_listing_text(title text, body text)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  hit public.prohibited_terms;
begin
  select * into hit from public.prohibited_terms t
   where lower(coalesce(title, '') || ' ' || coalesce(body, '')) ~ ('\m' || t.term || '\M')
   limit 1;
  if hit.term is not null then
    raise exception '%', hit.reason using errcode = '22023', hint = 'prohibited_term';
  end if;
end;
$$;

-- Sets a listing's approximate location from a device point (owner only). Never stores the input.
create or replace function public.set_listing_location(listing uuid, lat double precision, lng double precision, area_label text, postal_code text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  snapped record;
begin
  if not exists (select 1 from public.listings l where l.id = listing and l.seller_id = auth.uid()) then
    raise exception 'listing not found' using errcode = '42501';
  end if;
  select * into snapped from public.snap_point(lat, lng, 6);
  if snapped.point is null then
    raise exception 'invalid location' using errcode = '22023';
  end if;
  insert into public.listing_locations (listing_id, public_point, geohash6, area_label, postal_code)
  values (listing, snapped.point, snapped.geohash, btrim(area_label), nullif(btrim(postal_code), ''))
  on conflict (listing_id) do update set
    public_point = excluded.public_point, geohash6 = excluded.geohash6,
    area_label = excluded.area_label, postal_code = excluded.postal_code;
end;
$$;

-- Creates and publishes a listing in one transaction. Images are uploaded first to
-- listing-images/{seller}/{listing_id}/… (the client chooses the listing id).
create or replace function public.publish_listing(listing jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid     uuid := auth.uid();
  lid     uuid := (listing ->> 'id')::uuid;
  img     jsonb;
  idx     integer := 0;
  loc     jsonb := listing -> 'location';
begin
  if uid is null then
    raise exception 'sign in first' using errcode = '42501';
  end if;
  if (select count(*) from public.listings where seller_id = uid and created_at > now() - interval '1 day') >= 20 then
    raise exception 'You can publish up to 20 listings a day. Try again tomorrow.' using errcode = '22023', hint = 'rate_limited';
  end if;
  perform public.check_listing_text(listing ->> 'custom_title', listing ->> 'description');
  if jsonb_array_length(coalesce(listing -> 'images', '[]')) not between 1 and 10 then
    raise exception 'Add between 1 and 10 photos.' using errcode = '22023';
  end if;
  if loc is null then
    raise exception 'Choose an approximate location.' using errcode = '22023';
  end if;

  insert into public.listings (id, seller_id, product_id, variant_id, category_id, custom_title, custom_brand_text, brand_id, condition,
                               price_cents, accepts_offers, description, pickup, ships, status, published_at)
  values (lid, uid, nullif(listing ->> 'product_id', '')::uuid, nullif(listing ->> 'variant_id', '')::uuid,
          coalesce(nullif(listing ->> 'category_id', '')::uuid,
                   (select p.category_id from public.products p where p.id = nullif(listing ->> 'product_id', '')::uuid)),
          nullif(btrim(listing ->> 'custom_title'), ''), nullif(btrim(listing ->> 'custom_brand_text'), ''),
          (select b.id from public.brands b where b.slug = nullif(listing ->> 'brand_slug', '')),
          (listing ->> 'condition')::public.listing_condition, (listing ->> 'price_cents')::int,
          coalesce((listing ->> 'accepts_offers')::boolean, true), coalesce(listing ->> 'description', ''),
          coalesce((listing ->> 'pickup')::boolean, true), coalesce((listing ->> 'ships')::boolean, false), 'active', now());

  insert into public.listing_private (listing_id, hide_offers_below_cents)
  values (lid, nullif(listing ->> 'hide_offers_below_cents', '')::int);

  for img in select * from jsonb_array_elements(listing -> 'images') loop
    if (img ->> 'path') not like uid::text || '/' || lid::text || '/%' then
      raise exception 'photos must be uploaded to your own listing folder' using errcode = '42501';
    end if;
    insert into public.listing_images (listing_id, storage_path, sort, width, height)
    values (lid, img ->> 'path', idx, nullif(img ->> 'width', '')::int, nullif(img ->> 'height', '')::int);
    idx := idx + 1;
  end loop;

  perform public.set_listing_location(lid, (loc ->> 'lat')::double precision, (loc ->> 'lng')::double precision,
                                      loc ->> 'area_label', loc ->> 'postal_code');

  -- D3: custom items go to the catalog review queue with the matcher's suggestions.
  if nullif(listing ->> 'product_id', '') is null then
    insert into public.listing_catalog_reviews (listing_id, suggestions, suggested_product_id)
    select lid, s, (select p.id from public.products p where p.slug = s -> 0 ->> 'product_slug')
      from (select public.suggest_catalog_matches(listing ->> 'custom_title', listing ->> 'custom_brand_text') as s) x;
  end if;
  return lid;
end;
$$;

-- Status changes (seller only): active ⇄ pending → sold, or removed.
create or replace function public.set_listing_status(listing uuid, status text, buyer uuid default null, sold_price integer default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  l public.listings;
begin
  select * into l from public.listings where id = listing for update;
  if l.id is null or l.seller_id <> auth.uid() then
    raise exception 'listing not found' using errcode = '42501';
  end if;
  if l.status in ('sold', 'removed') then
    raise exception 'This listing is already %.', l.status using errcode = '22023';
  end if;
  if status not in ('active', 'pending', 'sold', 'removed') then
    raise exception 'unknown status %', status using errcode = '22023';
  end if;
  update public.listings
     set status = set_listing_status.status::public.listing_status,
         sold_to_user_id = case when set_listing_status.status = 'sold' then buyer end,
         sold_price_cents = case when set_listing_status.status = 'sold' then coalesce(sold_price, l.price_cents) end,
         sold_at = case when set_listing_status.status = 'sold' then now() end
   where id = listing;
end;
$$;

-- Owner edit with the same text checks as publish.
create or replace function public.update_listing(listing uuid, changes jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  l public.listings;
begin
  select * into l from public.listings where id = listing;
  if l.id is null or l.seller_id <> auth.uid() then
    raise exception 'listing not found' using errcode = '42501';
  end if;
  if l.status in ('sold', 'removed') then
    raise exception 'Sold or removed listings can’t be edited.' using errcode = '22023';
  end if;
  perform public.check_listing_text(coalesce(changes ->> 'custom_title', l.custom_title), coalesce(changes ->> 'description', l.description));
  update public.listings set
    price_cents = coalesce((changes ->> 'price_cents')::int, price_cents),
    description = coalesce(changes ->> 'description', description),
    condition = coalesce((changes ->> 'condition')::public.listing_condition, condition),
    accepts_offers = coalesce((changes ->> 'accepts_offers')::boolean, accepts_offers),
    pickup = coalesce((changes ->> 'pickup')::boolean, pickup),
    ships = coalesce((changes ->> 'ships')::boolean, ships)
  where id = listing;
  if changes ? 'hide_offers_below_cents' then
    update public.listing_private set hide_offers_below_cents = nullif(changes ->> 'hide_offers_below_cents', '')::int where listing_id = listing;
  end if;
end;
$$;

-- The caller's approximate home area (snapped to ~5 km, private).
create or replace function public.set_home_area(lat double precision, lng double precision, label text, radius_m integer default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  snapped record;
begin
  if auth.uid() is null then
    raise exception 'sign in first' using errcode = '42501';
  end if;
  select * into snapped from public.snap_point(lat, lng, 5);
  update public.profiles_private
     set home_point = snapped.point, home_label = btrim(label),
         search_radius_m = coalesce(radius_m, search_radius_m)
   where user_id = auth.uid();
  update public.profiles set area_label = btrim(label) where id = auth.uid();
end;
$$;

revoke execute on function public.snap_point(double precision, double precision, integer), public.check_listing_text(text, text)
  from public, anon, authenticated;
revoke execute on function public.set_listing_location(uuid, double precision, double precision, text, text),
  public.publish_listing(jsonb), public.set_listing_status(uuid, text, uuid, integer), public.update_listing(uuid, jsonb),
  public.set_home_area(double precision, double precision, text, integer) from public, anon;
grant execute on function public.set_listing_location(uuid, double precision, double precision, text, text),
  public.publish_listing(jsonb), public.set_listing_status(uuid, text, uuid, integer), public.update_listing(uuid, jsonb),
  public.set_home_area(double precision, double precision, text, integer) to authenticated;

-- ---------------------------------------------------------------------------------------------
-- Public marketplace feed (approximate distance only; never returns coordinates)
-- ---------------------------------------------------------------------------------------------

create or replace function public.market_feed(
  lat           double precision default null,
  lng           double precision default null,
  radius_m      integer default 40000,
  include_shipping boolean default true,
  category_slug text default null,
  product       uuid default null,
  seller        uuid default null,
  conditions    text[] default null,
  brand_slugs   text[] default null,
  min_cents     integer default null,
  max_cents     integer default null,
  pickup_only   boolean default false,
  statuses      text[] default array['active', 'pending'],
  sort          text default 'nearest',
  max_rows      integer default 40,
  skip          integer default 0)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with origin as (
    select case when lat is not null and lng is not null
                then (select s.point from public.snap_point(lat, lng, 6) s) end as pt
  ),
  base as (
    select l.id, l.seller_id, l.status, l.condition, l.price_cents, l.pickup, l.ships, l.published_at, l.accepts_offers,
           coalesce(p.name, l.custom_title) as title, p.slug as product_slug, l.product_id, l.variant_id, v.label as variant_label,
           coalesce(b.name, l.custom_brand_text) as brand_name, b.slug as brand_slug, c.slug as category_slug, c.name as category_name,
           loc.area_label,
           case when o.pt is not null then extensions.st_distance(loc.public_point, o.pt)::int end as distance_m,
           vs.best_delivered_cents as best_new_cents,
           (select i.storage_path from public.listing_images i where i.listing_id = l.id order by i.sort limit 1) as image_path
      from public.listings l
      cross join origin o
      join public.listing_locations loc on loc.listing_id = l.id
      join public.categories c on c.id = l.category_id
      left join public.products p on p.id = l.product_id
      left join public.product_variants v on v.id = l.variant_id
      left join public.brands b on b.id = coalesce(p.brand_id, l.brand_id)
      left join public.variant_price_stats vs on vs.variant_id = coalesce(l.variant_id, (select dv.id from public.product_variants dv where dv.product_id = l.product_id and dv.is_default))
     where l.status::text = any (statuses)
       and (category_slug is null or c.slug = category_slug)
       and (product is null or l.product_id = product)
       and (seller is null or l.seller_id = seller)
       and (conditions is null or cardinality(conditions) = 0 or l.condition::text = any (conditions))
       and (brand_slugs is null or cardinality(brand_slugs) = 0 or b.slug = any (brand_slugs))
       and (min_cents is null or l.price_cents >= min_cents)
       and (max_cents is null or l.price_cents <= max_cents)
       and (not pickup_only or l.pickup)
       and (o.pt is null or radius_m is null
            or extensions.st_dwithin(loc.public_point, o.pt, radius_m)
            or (include_shipping and l.ships))
  )
  select jsonb_build_object(
    'total', (select count(*) from base),
    'items', coalesce((
      select jsonb_agg(to_jsonb(x) - 'rn' order by x.rn)
        from (select b.*, row_number() over (order by
                case when sort = 'nearest' then coalesce(b.distance_m, 2147483647) end,
                case when sort = 'price_asc' then b.price_cents end,
                case when sort = 'price_desc' then -b.price_cents end,
                b.published_at desc) as rn
                from base b) x
       where x.rn > greatest(skip, 0) and x.rn <= greatest(skip, 0) + least(greatest(max_rows, 1), 100)), '[]'::jsonb));
$$;

revoke execute on function public.market_feed(double precision, double precision, integer, boolean, text, uuid, uuid, text[], text[], integer, integer, boolean, text[], text, integer, integer) from public;
grant execute on function public.market_feed(double precision, double precision, integer, boolean, text, uuid, uuid, text[], text[], integer, integer, boolean, text[], text, integer, integer) to anon, authenticated;

-- ---------------------------------------------------------------------------------------------
-- Notifications: used alerts on publish, savers on pending/sold
-- ---------------------------------------------------------------------------------------------

create or replace function public.notify_listing_events()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  a     record;
  title text := (select coalesce(p.name, new.custom_title) from public.products p where p.id = new.product_id);
  pt    extensions.geography := (select public_point from public.listing_locations where listing_id = new.id);
  uid   uuid;
begin
  title := coalesce(title, new.custom_title);
  if new.status = 'active' and (tg_op = 'INSERT' or old.status = 'draft') and new.product_id is not null then
    for a in
      select pa.id, pa.user_id, pa.target_cents, pp.home_point, pp.search_radius_m
        from public.price_alerts pa
        join public.profiles_private pp on pp.user_id = pa.user_id
       where pa.product_id = new.product_id and pa.status = 'active' and pa.include_used
         and (pa.variant_id is null or pa.variant_id = new.variant_id)
         and new.price_cents <= pa.target_cents and pa.user_id <> new.seller_id
    loop
      if new.ships or (a.home_point is not null and pt is not null and extensions.st_dwithin(a.home_point, pt, a.search_radius_m)) then
        perform public.notify(a.user_id, 'price_alert', format('Pre-owned %s for %s', title, public.format_usd(new.price_cents)),
          'A listing matches your alert.', '/market/listing/' || new.id, 'listing:' || new.id, jsonb_build_object('listing_id', new.id));
      end if;
    end loop;
  elsif tg_op = 'UPDATE' and new.status in ('pending', 'sold') and old.status is distinct from new.status then
    for uid in select s.user_id from public.saved_listings s where s.listing_id = new.id loop
      perform public.notify(uid, 'system', format('%s is %s', title, new.status::text),
        case new.status when 'sold' then 'A listing you saved has sold.' else 'A listing you saved is pending — the seller may still take offers.' end,
        '/market/listing/' || new.id, format('listing:%s:%s', new.id, new.status), jsonb_build_object('listing_id', new.id));
    end loop;
  end if;
  return null;
end;
$$;

revoke execute on function public.notify_listing_events() from public, anon, authenticated;

-- Deferred so the listing's location (written later in the publish transaction) is visible.
create constraint trigger listings_notify after insert or update of status on public.listings
  deferrable initially deferred
  for each row execute function public.notify_listing_events();

-- ---------------------------------------------------------------------------------------------
-- RLS + privileges
-- ---------------------------------------------------------------------------------------------

alter table public.listings enable row level security;
alter table public.listing_private enable row level security;
alter table public.listing_images enable row level security;
alter table public.listing_locations enable row level security;
alter table public.listing_catalog_reviews enable row level security;
alter table public.saved_listings enable row level security;
alter table public.prohibited_terms enable row level security;
alter table public.variant_market_stats enable row level security;

create or replace function public.listing_is_public(lid uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.listings l where l.id = lid and l.status in ('active', 'pending', 'sold'));
$$;

create policy "published listings are public" on public.listings for select
  to anon, authenticated using (status in ('active', 'pending', 'sold') or seller_id = (select auth.uid()) or (select public.is_staff()));
create policy "staff moderate listings" on public.listings for update
  to authenticated using ((select public.is_staff())) with check ((select public.is_staff()));

create policy "sellers read their listing settings" on public.listing_private for select
  to authenticated using (exists (select 1 from public.listings l where l.id = listing_id and l.seller_id = (select auth.uid())));

create policy "images of public listings are public" on public.listing_images for select
  to anon, authenticated using (public.listing_is_public(listing_id)
    or exists (select 1 from public.listings l where l.id = listing_id and l.seller_id = (select auth.uid())));
create policy "sellers delete their images" on public.listing_images for delete
  to authenticated using (exists (select 1 from public.listings l where l.id = listing_id and l.seller_id = (select auth.uid())));

create policy "approximate locations of public listings are public" on public.listing_locations for select
  to anon, authenticated using (public.listing_is_public(listing_id)
    or exists (select 1 from public.listings l where l.id = listing_id and l.seller_id = (select auth.uid())));

create policy "staff manage catalog reviews" on public.listing_catalog_reviews for all
  to authenticated using ((select public.is_staff())) with check ((select public.is_staff()));
create policy "staff manage prohibited terms" on public.prohibited_terms for all
  to authenticated using ((select public.is_staff())) with check ((select public.is_staff()));
create policy "market stats are public" on public.variant_market_stats for select to anon, authenticated using (true);

create policy "owners read saved listings" on public.saved_listings for select to authenticated using ((select auth.uid()) = user_id);
create policy "owners insert saved listings" on public.saved_listings for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "owners delete saved listings" on public.saved_listings for delete to authenticated using ((select auth.uid()) = user_id);

revoke all on public.listings, public.listing_private, public.listing_images, public.listing_locations,
  public.listing_catalog_reviews, public.saved_listings, public.prohibited_terms, public.variant_market_stats from anon, authenticated;

-- Buyers never see who bought or for how much; writes go through RPCs (status via RPC only).
grant select (id, seller_id, product_id, variant_id, category_id, custom_title, custom_brand_text, brand_id, condition, price_cents,
              accepts_offers, description, pickup, ships, status, published_at, sold_at, created_at, updated_at)
  on public.listings to anon, authenticated;
grant update (status, removed_reason) on public.listings to authenticated;  -- staff moderation (RLS: staff only)
grant select on public.listing_private to authenticated;
grant select on public.listing_images to anon, authenticated;
grant delete on public.listing_images to authenticated;
-- Only the label and coarse fields are client-readable; the snapped point is used server-side.
grant select (listing_id, area_label, geohash6) on public.listing_locations to anon, authenticated;
grant select, insert, update, delete on public.listing_catalog_reviews, public.prohibited_terms to authenticated;
grant select on public.variant_market_stats to anon, authenticated;
grant select, insert, delete on public.saved_listings to authenticated;

-- profiles_private: home area is written via set_home_area only; the snapped point stays server-side.
revoke select on public.profiles_private from authenticated;
grant select (user_id, search_radius_m, appearance, home_label, created_at, updated_at) on public.profiles_private to authenticated;

-- ---------------------------------------------------------------------------------------------
-- Storage: listing photos — public read, sellers write only to their own folder
-- ---------------------------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('listing-images', 'listing-images', true, 10485760, array['image/jpeg', 'image/webp'])
on conflict (id) do nothing;

create policy "sellers upload listing photos to their folder" on storage.objects for insert
  to authenticated with check (bucket_id = 'listing-images' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "sellers manage their listing photos" on storage.objects for update
  to authenticated using (bucket_id = 'listing-images' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "sellers delete their listing photos" on storage.objects for delete
  to authenticated using (bucket_id = 'listing-images' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "sellers list their listing photos" on storage.objects for select
  to authenticated using (bucket_id = 'listing-images' and (storage.foldername(name))[1] = (select auth.uid())::text);

-- Price alerts can now include pre-owned listings (the Phase 5 seam).
grant update (include_used) on public.price_alerts to authenticated;
