-- Brands in the marketplace filter.
-- 1. A brand a seller types for a custom item ("selkirk", "Six-Zero") is tagged as the catalog brand when
--    the letters and digits match, on publish and on edit, and existing listings are backfilled.
-- 2. The brand filter also matches untagged typed brands the same way (e.g. a brand added to the catalog
--    after the listing was published).
-- 3. market_brand_counts(): active listings per brand, so the filter sheet can put brands that have
--    something for sale first. Goes through market_match, so blocks apply as everywhere else.

-- Letters and digits only, lower case: "K-Swiss", "k swiss" and "KSWISS" share one key.
create or replace function public.brand_key(t text)
returns text
language sql
immutable
set search_path = ''
as $$
  select nullif(regexp_replace(lower(coalesce(t, '')), '[^a-z0-9]', '', 'g'), '');
$$;

create or replace function public.brand_for_text(t text)
returns uuid
language sql
stable
set search_path = ''
as $$
  select b.id from public.brands b
   where b.is_active and public.brand_key(b.name) = public.brand_key(t)
   order by b.name
   limit 1;
$$;

create or replace function public.listings_tag_brand()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.product_id is null and new.brand_id is null and new.custom_brand_text is not null then
    new.brand_id := public.brand_for_text(new.custom_brand_text);
  end if;
  return new;
end;
$$;

revoke execute on function public.brand_key(text), public.brand_for_text(text), public.listings_tag_brand() from public, anon, authenticated;

create trigger listings_tag_brand before insert or update of custom_brand_text, brand_id, product_id on public.listings
  for each row execute function public.listings_tag_brand();

update public.listings
   set brand_id = public.brand_for_text(custom_brand_text)
 where product_id is null and brand_id is null and custom_brand_text is not null
   and public.brand_for_text(custom_brand_text) is not null;

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
     and (market_match.brand_slugs is null or cardinality(market_match.brand_slugs) = 0 or b.slug = any (market_match.brand_slugs)
          or (b.id is null and exists (
                select 1 from public.brands fb
                 where fb.slug = any (market_match.brand_slugs)
                   and public.brand_key(fb.name) = public.brand_key(l.custom_brand_text))))
     and (market_match.min_cents is null or l.price_cents >= market_match.min_cents)
     and (market_match.max_cents is null or l.price_cents <= market_match.max_cents)
     and (not market_match.pickup_only or l.pickup)
     and (auth.uid() is null or not exists (
           select 1 from public.user_blocks ub
            where (ub.blocker_id = auth.uid() and ub.blocked_id = l.seller_id)
               or (ub.blocker_id = l.seller_id and ub.blocked_id = auth.uid())));
$$;

create or replace function public.market_brand_counts()
returns table (slug text, listings integer)
language sql
stable
security definer
set search_path = ''
as $$
  select b.slug::text, count(*)::int
    from public.listings l
    left join public.products p on p.id = l.product_id
    join public.brands b on b.id = coalesce(p.brand_id, l.brand_id)
   where l.id in (select public.market_match(statuses => array['active']))
   group by b.slug;
$$;

revoke execute on function public.market_brand_counts() from public;
grant execute on function public.market_brand_counts() to anon, authenticated;
