-- Phase 6, D3: staff resolve the custom-listing review queue — link the listing to a catalog variant
-- (it then shows on that product page and feeds its market stats) or dismiss it.
-- Listings are only writable through RPCs, so linking is a staff-only definer function.

create or replace function public.resolve_listing_review(review uuid, decision text, variant uuid default null, notes text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  lid  uuid;
  pid  uuid;
begin
  if not public.is_staff() then
    raise exception 'staff only' using errcode = '42501';
  end if;
  select r.listing_id into lid from public.listing_catalog_reviews r where r.id = review and r.decision = 'pending' for update;
  if lid is null then
    raise exception 'review not found or already resolved' using errcode = 'P0002';
  end if;

  if decision = 'linked' then
    select v.product_id into pid from public.product_variants v where v.id = variant;
    if pid is null then
      raise exception 'choose a catalog variant' using errcode = '22023';
    end if;
    -- listings_normalize takes the category from the product.
    update public.listings set product_id = pid, variant_id = variant where id = lid;
  elsif decision <> 'dismissed' then
    raise exception 'decision must be linked or dismissed' using errcode = '22023';
  end if;

  update public.listing_catalog_reviews
     set decision = resolve_listing_review.decision::public.catalog_review_decision, suggested_product_id = coalesce(pid, suggested_product_id),
         notes = coalesce(resolve_listing_review.notes, listing_catalog_reviews.notes), reviewed_by = auth.uid(), reviewed_at = now()
   where id = review;
end;
$$;

revoke execute on function public.resolve_listing_review(uuid, text, uuid, text) from public, anon;
grant execute on function public.resolve_listing_review(uuid, text, uuid, text) to authenticated;
