-- Store codes re-verify themselves (owner decision, Oct 8). For sources that can check a code at the
-- store (Shopify: a Storefront API test cart with the code applied), the ingest job asks for one
-- in-stock sample offer per active code, builds a cart with it, and marks the code verified only when
-- the store says the code is applicable. A code the store rejects is left alone and drops out of the
-- app after 14 days, as before. No orders are placed.

-- One sample offer per active, in-date code of the source's retailer: an active, in-stock offer from
-- this source with a store product (content_ref) that the code's targeting rules accept.
create or replace function public.promo_verification_targets(source_slug text)
returns table (promo_id uuid, code text, content_ref text)
language sql
stable
security definer
set search_path = ''
as $$
  select p.id, p.code, o.content_ref
    from public.ingestion_sources s
    join public.promo_codes p on p.retailer_id = s.retailer_id
    cross join lateral (
      select o.content_ref
        from public.retailer_offers o
        join public.product_variants v on v.id = o.variant_id
        join public.products pr on pr.id = v.product_id
       where o.source_id = s.id and o.retailer_id = s.retailer_id and o.status = 'active' and o.in_stock
         and o.content_ref is not null and pr.status = 'active'
         and (not p.supplier_items_only or o.ships_from is not null)
         and (not exists (select 1 from public.promo_code_targets t where t.promo_id = p.id)
              or exists (select 1 from public.promo_code_targets t
                          where t.promo_id = p.id
                            and (t.variant_id = v.id or t.product_id = pr.id or t.category_id = pr.category_id)))
       order by o.price_cents desc nulls last
       limit 1
    ) o
   where s.slug = promo_verification_targets.source_slug
     and p.status = 'active'
     and (p.starts_at is null or p.starts_at <= now())
     and (p.ends_at is null or p.ends_at > now());
$$;

create or replace function public.mark_promos_verified(promo_ids uuid[])
returns integer
language sql
security definer
set search_path = ''
as $$
  with u as (
    update public.promo_codes set verified_at = now() where id = any(promo_ids) and status = 'active' returning 1
  )
  select count(*)::int from u;
$$;

revoke execute on function public.promo_verification_targets(text), public.mark_promos_verified(uuid[]) from public, anon, authenticated;
grant execute on function public.promo_verification_targets(text), public.mark_promos_verified(uuid[]) to service_role;
