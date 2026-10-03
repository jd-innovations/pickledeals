-- Phase 6 follow-up: "near you" from the caller's saved home area (which clients can't read, D2),
-- id and text filters (Saved listings, pre-owned search), and save counts for a seller's own listings (My listings).

drop function public.market_feed(double precision, double precision, integer, boolean, text, uuid, uuid, text[], text[], integer, integer, boolean, text[], text, integer, integer);

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
     where l.status::text = any (statuses)
       and (category_slug is null or c.slug = category_slug)
       and (product is null or l.product_id = product)
       and (seller is null or l.seller_id = seller)
       and (ids is null or l.id = any (ids))
       and (nullif(trim(q), '') is null or not exists (
             select 1 from unnest(regexp_split_to_array(lower(trim(q)), '\s+')) w
              where strpos(lower(concat_ws(' ', b.name, l.custom_brand_text, p.name, l.custom_title, v.label, c.name)), w) = 0))
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

revoke execute on function public.market_feed(double precision, double precision, integer, boolean, text, uuid, uuid, text[], text[], integer, integer, boolean, text[], text, integer, integer, boolean, uuid[], text) from public;
grant execute on function public.market_feed(double precision, double precision, integer, boolean, text, uuid, uuid, text[], text[], integer, integer, boolean, text[], text, integer, integer, boolean, uuid[], text) to anon, authenticated;

-- Save counts for the caller's own listings (savers stay anonymous).
create or replace function public.my_listing_save_counts()
returns table (listing_id uuid, saves integer)
language sql
stable
security definer
set search_path = ''
as $$
  select l.id, count(s.user_id)::int
    from public.listings l
    left join public.saved_listings s on s.listing_id = l.id
   where l.seller_id = auth.uid()
   group by l.id;
$$;

revoke execute on function public.my_listing_save_counts() from public, anon;
grant execute on function public.my_listing_save_counts() to authenticated;
