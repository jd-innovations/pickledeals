-- Blocks reach the marketplace: once either side has blocked the other, the viewer no longer sees
-- that seller's listings in the grid, on the map, on product pages or on the seller's profile.
-- Everything goes through market_match, so this is the one place to change. Guests (no auth.uid())
-- are unaffected, and sellers always see their own listings.

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
     and (not market_match.pickup_only or l.pickup)
     and (auth.uid() is null or not exists (
           select 1 from public.user_blocks ub
            where (ub.blocker_id = auth.uid() and ub.blocked_id = l.seller_id)
               or (ub.blocker_id = l.seller_id and ub.blocked_id = auth.uid())));
$$;

revoke execute on function public.market_match(text[], text, uuid, uuid, uuid[], text, text[], text[], integer, integer, boolean) from public, anon, authenticated;
