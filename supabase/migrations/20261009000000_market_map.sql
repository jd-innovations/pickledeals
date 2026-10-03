-- Phase 7: marketplace map (§8, D2, D4). The grid feed and the map share one filter predicate
-- (market_match) so the two views can't drift. D2: the map RPC returns each listing's snapped
-- geohash-6 cell centre (public_point) and nothing finer; clustering happens on the client.

-- Listing ids matching the shared marketplace filters (no location terms — callers add those).
create or replace function public.market_match(
  statuses      text[] default array['active', 'pending'],
  category_slug text default null,
  product       uuid default null,
  seller        uuid default null,
  ids           uuid[] default null,
  q             text default null,
  conditions    text[] default null,
  brand_slugs   text[] default null,
  min_cents     integer default null,
  max_cents     integer default null,
  pickup_only   boolean default false)
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select l.id
    from public.listings l
    join public.categories c on c.id = l.category_id
    left join public.products p on p.id = l.product_id
    left join public.product_variants v on v.id = l.variant_id
    left join public.brands b on b.id = coalesce(p.brand_id, l.brand_id)
   where l.status::text = any (market_match.statuses)
     and (market_match.category_slug is null or c.slug = market_match.category_slug)
     and (market_match.product is null or l.product_id = market_match.product)
     and (market_match.seller is null or l.seller_id = market_match.seller)
     and (market_match.ids is null or l.id = any (market_match.ids))
     and (nullif(trim(market_match.q), '') is null or not exists (
           select 1 from unnest(regexp_split_to_array(lower(trim(market_match.q)), '\s+')) w
            where strpos(lower(concat_ws(' ', b.name, l.custom_brand_text, p.name, l.custom_title, v.label, c.name)), w) = 0))
     and (market_match.conditions is null or cardinality(market_match.conditions) = 0 or l.condition::text = any (market_match.conditions))
     and (market_match.brand_slugs is null or cardinality(market_match.brand_slugs) = 0 or b.slug = any (market_match.brand_slugs))
     and (market_match.min_cents is null or l.price_cents >= market_match.min_cents)
     and (market_match.max_cents is null or l.price_cents <= market_match.max_cents)
     and (not market_match.pickup_only or l.pickup);
$$;

revoke execute on function public.market_match(text[], text, uuid, uuid, uuid[], text, text[], text[], integer, integer, boolean) from public, anon, authenticated;

-- The feed, re-expressed on market_match (same signature and output as 20261008000100).
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
  skip          integer default 0,
  use_home      boolean default false,
  ids           uuid[] default null,
  q             text default null)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with origin as (
    select coalesce(
             case when lat is not null and lng is not null then (select s.point from public.snap_point(lat, lng, 6) s) end,
             case when use_home then (select pp.home_point from public.profiles_private pp where pp.user_id = auth.uid()) end
           ) as pt
  ),
  base as (
    select l.id, l.seller_id, l.status, l.condition, l.price_cents, l.pickup, l.ships, l.published_at, l.accepts_offers,
           coalesce(p.name, l.custom_title) as title, p.slug as product_slug, l.product_id, l.variant_id, v.label as variant_label,
           (select count(*) from public.product_variants x where x.product_id = l.product_id) > 1 as has_variants,
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
     where l.id in (select public.market_match(statuses, category_slug, product, seller, ids, q, conditions, brand_slugs, min_cents, max_cents, pickup_only))
       and (o.pt is null or radius_m is null
            or extensions.st_dwithin(loc.public_point, o.pt, radius_m)
            or (include_shipping and l.ships))
  )
  select jsonb_build_object(
    'total', (select count(*) from base),
    'has_origin', (select pt is not null from origin),
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

-- Listings inside a map viewport ("Search this area"). Each item carries its snapped cell centre
-- (lat/lng of public_point — never finer, D2) for client-side clustering. Capped at 500 rows,
-- nearest the viewport centre first; `truncated` tells the client there were more.
create or replace function public.market_in_bounds(
  min_lng       double precision,
  min_lat       double precision,
  max_lng       double precision,
  max_lat       double precision,
  lat           double precision default null,
  lng           double precision default null,
  use_home      boolean default false,
  category_slug text default null,
  conditions    text[] default null,
  brand_slugs   text[] default null,
  min_cents     integer default null,
  max_cents     integer default null,
  pickup_only   boolean default false,
  statuses      text[] default array['active', 'pending'],
  q             text default null,
  max_rows      integer default 500)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with box as (
    select extensions.st_makeenvelope(
             greatest(least(min_lng, max_lng), -180), greatest(least(min_lat, max_lat), -90),
             least(greatest(min_lng, max_lng), 180), least(greatest(min_lat, max_lat), 90), 4326) as env
  ),
  origin as (
    select coalesce(
             case when lat is not null and lng is not null then (select s.point from public.snap_point(lat, lng, 6) s) end,
             case when use_home then (select pp.home_point from public.profiles_private pp where pp.user_id = auth.uid()) end
           ) as pt
  ),
  -- Rank on cheap columns first; only the returned rows pay for the card fields.
  hits as (
    select loc.listing_id as id, loc.public_point,
           extensions.st_distance(loc.public_point::extensions.geometry, extensions.st_centroid(bx.env)) as centre_d
      from public.listing_locations loc
      cross join box bx
     where loc.public_point::extensions.geometry operator(extensions.&&) bx.env
       and loc.listing_id in (select public.market_match(statuses, category_slug, null, null, null, q, conditions, brand_slugs, min_cents, max_cents, pickup_only))
  ),
  top as (
    select h.*, row_number() over (order by h.centre_d, h.id) as rn
      from hits h
     order by h.centre_d, h.id
     limit least(greatest(max_rows, 1), 500)
  ),
  items as (
    select t.rn, l.id, l.status, l.condition, l.price_cents, l.pickup, l.ships,
           coalesce(p.name, l.custom_title) as title, p.slug as product_slug, v.label as variant_label,
           (select count(*) from public.product_variants x where x.product_id = l.product_id) > 1 as has_variants,
           coalesce(b.name, l.custom_brand_text) as brand_name, c.slug as category_slug, loc.area_label,
           pr.display_name as seller_name,
           case when o.pt is not null then extensions.st_distance(t.public_point, o.pt)::int end as distance_m,
           vs.best_delivered_cents as best_new_cents,
           (select i.storage_path from public.listing_images i where i.listing_id = l.id order by i.sort limit 1) as image_path,
           (select count(*)::int from public.listing_images i where i.listing_id = l.id) as image_count,
           extensions.st_y(t.public_point::extensions.geometry) as lat,
           extensions.st_x(t.public_point::extensions.geometry) as lng
      from top t
      cross join origin o
      join public.listings l on l.id = t.id
      join public.listing_locations loc on loc.listing_id = t.id
      join public.categories c on c.id = l.category_id
      join public.profiles pr on pr.id = l.seller_id
      left join public.products p on p.id = l.product_id
      left join public.product_variants v on v.id = l.variant_id
      left join public.brands b on b.id = coalesce(p.brand_id, l.brand_id)
      left join public.variant_price_stats vs on vs.variant_id = coalesce(l.variant_id, (select dv.id from public.product_variants dv where dv.product_id = l.product_id and dv.is_default))
  )
  select jsonb_build_object(
    'total', (select count(*) from hits),
    'truncated', (select count(*) from hits) > least(greatest(max_rows, 1), 500),
    'items', coalesce((select jsonb_agg(to_jsonb(i) - 'rn' order by i.rn) from items i), '[]'::jsonb));
$$;

revoke execute on function public.market_in_bounds(double precision, double precision, double precision, double precision, double precision, double precision, boolean, text, text[], text[], integer, integer, boolean, text[], text, integer) from public;
grant execute on function public.market_in_bounds(double precision, double precision, double precision, double precision, double precision, double precision, boolean, text, text[], text[], integer, integer, boolean, text[], text, integer) to anon, authenticated;

-- The bounds query filters by the geometry box; index it.
create index listing_locations_point_geom on public.listing_locations using gist ((public_point::extensions.geometry));
