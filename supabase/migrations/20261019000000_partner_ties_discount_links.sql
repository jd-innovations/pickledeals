-- Pickleball Grip Doctor (the seller of record for its own and its Shopify Collective items) gets two
-- user-approved behaviours (Oct 5, 2026):
--   · wins_price_ties: on an exact delivered-price tie between in-stock offers, its offer ranks first.
--     Only allowed with an ownership note, so the preference is always disclosed next to the offer.
--   · discount_link_template: Get deal opens a Shopify discount link, so a Grip Doctor code is already
--     applied at checkout ('/discount/{code}?redirect={path}'). The go function builds it on the
--     retailer's own domain; the code still shows in the app and is copied as a fallback.

alter table public.retailers
  add column wins_price_ties boolean not null default false,
  add column discount_link_template text
    check (discount_link_template ~ '^/[A-Za-z0-9/_-]*\{code\}[A-Za-z0-9/_?=&-]*\{path\}$'),
  add constraint retailers_ties_disclosed check (not wins_price_ties or ownership_note is not null);

comment on column public.retailers.wins_price_ties is
  'Ranks first on exact delivered-price ties between in-stock offers. Requires ownership_note (disclosure).';
comment on column public.retailers.discount_link_template is
  'Shopify discount link path; {code} and {path} are filled by the go function, e.g. /discount/{code}?redirect={path}.';

update public.retailers
   set wins_price_ties = true,
       discount_link_template = '/discount/{code}?redirect={path}',
       ownership_note = 'PickleDeals’ owner also owns this store; it’s listed first when prices tie'
 where slug = 'pickleball-grip-doctor';

-- Ranking: delivered price → in stock → tie preference (disclosed) → lower shipping → retailer name.
-- Appends code_auto_applied for the app's button label.
create or replace view public.variant_offer_ranking with (security_barrier = true) as
with live as (
  select o.*, r.slug as retailer_slug, r.name as retailer_name, r.kind as retailer_kind, v.product_id,
         r.tracking_excluded as retailer_tracking_excluded, r.ownership_note as retailer_ownership_note,
         r.wins_price_ties as retailer_wins_ties, r.discount_link_template is not null as retailer_applies_codes,
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
             public.promo_discount_cents(p, l.price_cents, l.shipping_cents) as discount
        from public.promo_codes p
       where p.retailer_id = l.retailer_id
         and public.promo_is_live(p)
         and l.shown_display = 'show'
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
       case when shown_display = 'show' then price_cents + shipping_cents - promo_discount_cents end as delivered_cents,
       case when shown_display = 'show' then
         row_number() over (partition by variant_id, shown_display
                            order by price_cents + shipping_cents - promo_discount_cents, in_stock desc,
                                     retailer_wins_ties desc, shipping_cents, lower(retailer_name), id)
       end as rank,
       last_checked_at,
       price_source,
       retailer_tracking_excluded as tracking_excluded,
       ships_from,
       retailer_ownership_note as ownership_note,
       (promo_code is not null and retailer_applies_codes) as code_auto_applied
  from priced;
