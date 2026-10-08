-- Promo codes can apply to supplier-shipped items only (owner decision, Oct 8: PICKLEDEALS5, 5% off
-- Shopify Collective items at Pickleball Grip Doctor, a PickleDeals exclusive). An offer is
-- supplier-shipped when it has ships_from (the Shopify adapter sets it for products tagged
-- "Shopify Collective", the same tag the store's discount collection uses), so new imports get the
-- code with no per-product setup. Combines with targets: both must match when both are set.

alter table public.promo_codes add column supplier_items_only boolean not null default false;
comment on column public.promo_codes.supplier_items_only is
  'Applies only to offers shipped by a supplier for the retailer (retailer_offers.ships_from is set), e.g. Shopify Collective items.';

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
         and (not p.supplier_items_only or l.ships_from is not null)
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
