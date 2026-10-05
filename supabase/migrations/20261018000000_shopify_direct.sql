-- Direct Shopify stores (docs/SHOPIFY_PLAN.md). Pickleball Grip Doctor is the pilot: a separate
-- business with the same owner as PickleDeals, listed as an ordinary retailer. Its feed carries its
-- own products and Shopify Collective items shipped by suppliers (e.g. Engage).
--   · retailers.ownership_note: disclosure shown on that retailer's offers (FTC material connection)
--   · retailer_offers.ships_from: the supplier that ships a Collective item ("Ships from Engage")
--   · brand_vendor_aliases + brand_for_vendor(): Shopify vendor names ("EngagePickleball") → brands
--   · staff_create_product_from_raw(): the review queue can create a draft product from a feed item
--   · ranking ties break on stock, shipping and retailer name, never on refresh time (a feed checked
--     every 30 minutes must not win ties against slower sources)

-- ---------------------------------------------------------------------------------------------
-- Columns
-- ---------------------------------------------------------------------------------------------

alter table public.retailers
  add column ownership_note text check (char_length(btrim(ownership_note)) between 1 and 120);

alter table public.retailer_offers
  add column ships_from text check (char_length(btrim(ships_from)) between 1 and 80);

-- Shopify adapter config may name env vars; only SHOPIFY_* names are ever read by the function.
alter table public.ingestion_sources
  add constraint ingestion_sources_shopify_env check (
    (config ->> 'domain_env' is null or config ->> 'domain_env' ~ '^SHOPIFY_[A-Z0-9_]{1,60}$') and
    (config ->> 'token_env' is null or config ->> 'token_env' ~ '^SHOPIFY_[A-Z0-9_]{1,60}$'));

-- ---------------------------------------------------------------------------------------------
-- Vendor names → brands
-- ---------------------------------------------------------------------------------------------

create table public.brand_vendor_aliases (
  vendor_key text primary key check (vendor_key ~ '^[a-z0-9]{1,80}$'),
  brand_id   uuid not null references public.brands (id) on delete cascade,
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

comment on table public.brand_vendor_aliases is
  'Retailer feed vendor names (normalized: lowercase letters and digits) mapped to catalog brands.';

alter table public.brand_vendor_aliases enable row level security;
create policy "staff read vendor aliases" on public.brand_vendor_aliases for select to authenticated using ((select public.is_staff()));
create policy "staff insert vendor aliases" on public.brand_vendor_aliases for insert to authenticated with check ((select public.is_staff()));
create policy "staff update vendor aliases" on public.brand_vendor_aliases for update to authenticated
  using ((select public.is_staff())) with check ((select public.is_staff()));
create policy "staff delete vendor aliases" on public.brand_vendor_aliases for delete to authenticated using ((select public.is_staff()));
revoke all on public.brand_vendor_aliases from anon, authenticated;
grant select, insert, update, delete on public.brand_vendor_aliases to authenticated;

create trigger brand_vendor_aliases_audit after insert or update or delete on public.brand_vendor_aliases
  for each row execute function public.log_staff_change();

create or replace function public.vendor_key(vendor text)
returns text
language sql
immutable
set search_path = ''
as $$
  select nullif(left(regexp_replace(lower(coalesce(vendor, '')), '[^a-z0-9]', '', 'g'), 80), '');
$$;

-- An alias wins; otherwise the brand whose name or slug matches, allowing the common
-- "Brand" + "Pickleball" store naming ("EngagePickleball" → Engage).
create or replace function public.brand_for_vendor(vendor text)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  with k as (select public.vendor_key(vendor) as key)
  select coalesce(
    (select a.brand_id from public.brand_vendor_aliases a, k where a.vendor_key = k.key),
    (select b.id
       from public.brands b, k
      where k.key in (public.vendor_key(b.name), public.vendor_key(b.slug),
                      public.vendor_key(b.name) || 'pickleball', 'pickleball' || public.vendor_key(b.name))
      order by b.is_active desc, b.name
      limit 1));
$$;

revoke execute on function public.brand_for_vendor(text) from public, anon;
grant execute on function public.brand_for_vendor(text) to authenticated, service_role;

-- ---------------------------------------------------------------------------------------------
-- Offers keep the supplier that ships them (from the record's ships_from: a vendor name)
-- ---------------------------------------------------------------------------------------------

create or replace function public.apply_raw_offer(raw_id uuid, vid uuid)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  rec     public.raw_offer_records;
  src     public.ingestion_kind;
  oid     uuid;
  created boolean;
  vendor  text;
  ships   text;
begin
  select * into rec from public.raw_offer_records where id = raw_id;
  select s.kind into src from public.ingestion_runs r join public.ingestion_sources s on s.id = r.source_id where r.id = rec.run_id;

  -- Shown as the brand's catalog name when the vendor maps to one ("EngagePickleball" → "Engage").
  vendor := nullif(btrim(rec.payload ->> 'ships_from'), '');
  if vendor is not null then
    ships := left(coalesce((select b.name from public.brands b where b.id = public.brand_for_vendor(vendor)), vendor), 80);
  end if;

  if rec.external_ref is not null then
    update public.retailer_offers o set external_ref = rec.external_ref
     where o.variant_id = vid and o.retailer_id = rec.retailer_id and o.external_ref is null and o.price_source = 'manual'
       and not exists (select 1 from public.retailer_offers x
                        where x.variant_id = vid and x.retailer_id = rec.retailer_id and x.external_ref = rec.external_ref);
  end if;

  insert into public.retailer_offers as o (variant_id, retailer_id, source_id, external_ref, url, price_cents, shipping_cents,
                                           in_stock, available_sizes, status, price_source, price_display, ships_from)
  values (vid, rec.retailer_id, (select source_id from public.ingestion_runs where id = rec.run_id), rec.external_ref,
          rec.url, rec.price_cents, coalesce(rec.shipping_cents, 0), coalesce(rec.in_stock, true),
          coalesce(rec.available_sizes, '{}'), 'active',
          case src when 'api' then 'api' when 'feed' then 'feed' else 'manual' end::public.price_source,
          case when src = 'api' then case when rec.price_cents is null then 'check_price' else 'show' end::public.price_display end,
          ships)
  on conflict on constraint retailer_offers_unique do update set
    url = excluded.url, price_cents = excluded.price_cents, shipping_cents = excluded.shipping_cents,
    in_stock = excluded.in_stock, available_sizes = excluded.available_sizes, status = 'active',
    source_id = excluded.source_id, price_source = excluded.price_source,
    price_display = coalesce(excluded.price_display, (select r.price_display_default from public.retailers r where r.id = excluded.retailer_id)),
    ships_from = excluded.ships_from,
    last_checked_at = now()
  returning o.id, (o.xmax = 0) into oid, created;

  update public.raw_offer_records
     set match_status = 'matched', matched_variant_id = vid, offer_id = oid
   where id = raw_id;
  return jsonb_build_object('offer_id', oid, 'created', created);
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- Ranking: neutral tie-break; ships_from and ownership_note appended for the app
-- ---------------------------------------------------------------------------------------------

create or replace view public.variant_offer_ranking with (security_barrier = true) as
with live as (
  select o.*, r.slug as retailer_slug, r.name as retailer_name, r.kind as retailer_kind, v.product_id,
         r.tracking_excluded as retailer_tracking_excluded, r.ownership_note as retailer_ownership_note,
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
       -- Delivered price decides. Ties: in stock first, then lower shipping, then retailer name (stable,
       -- and unrelated to who owns the store or how often its feed refreshes).
       case when shown_display = 'show' then
         row_number() over (partition by variant_id, shown_display
                            order by price_cents + shipping_cents - promo_discount_cents, in_stock desc, shipping_cents,
                                     lower(retailer_name), id)
       end as rank,
       last_checked_at,
       price_source,
       retailer_tracking_excluded as tracking_excluded,
       ships_from,
       retailer_ownership_note as ownership_note
  from priced;

-- ---------------------------------------------------------------------------------------------
-- Review queue: create a draft catalog product from a feed item
-- ---------------------------------------------------------------------------------------------

-- Creates a draft product (default variant) for an unmatched record, matches the record to it
-- (remembering its barcode/SKU), and remembers the record's vendor name for the brand. The offer
-- stays hidden until staff add the details and publish the product.
create or replace function public.staff_create_product_from_raw(
  raw_id        uuid,
  brand         uuid,
  category      uuid,
  name          text,
  variant_label text default null,
  msrp_cents    integer default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  rec   public.raw_offer_records;
  base     text;
  new_slug text;
  n     integer := 1;
  pid   uuid;
  vid   uuid;
  vkey  text;
begin
  -- Definer function: current_user is always the owner here, so only the caller's claims count.
  if not public.is_staff() then
    raise exception 'staff_create_product_from_raw requires an admin or editor' using errcode = '42501';
  end if;
  select * into rec from public.raw_offer_records where id = raw_id;
  if rec.id is null then
    raise exception 'record not found' using errcode = 'P0002';
  end if;
  if rec.match_status <> 'unmatched' then
    raise exception 'record is already %', rec.match_status using errcode = '22023';
  end if;
  if char_length(btrim(coalesce(staff_create_product_from_raw.name, ''))) not between 1 and 120 then
    raise exception 'name must be 1–120 characters' using errcode = '22023';
  end if;

  select left(regexp_replace(regexp_replace(lower(b.slug || ' ' || staff_create_product_from_raw.name), '[^a-z0-9]+', '-', 'g'), '(^-+|-+$)', '', 'g'), 72)
    into base
    from public.brands b where b.id = staff_create_product_from_raw.brand;
  if base is null then
    raise exception 'unknown brand' using errcode = '22023';
  end if;
  base := regexp_replace(base, '-+$', '');
  new_slug := base;
  while exists (select 1 from public.products p where p.slug = new_slug) loop
    n := n + 1;
    new_slug := base || '-' || n;
  end loop;

  insert into public.products (brand_id, category_id, slug, name, msrp_cents, status)
  values (staff_create_product_from_raw.brand, staff_create_product_from_raw.category, new_slug,
          btrim(staff_create_product_from_raw.name), staff_create_product_from_raw.msrp_cents, 'draft')
  returning id into pid;
  insert into public.product_variants (product_id, label, is_default)
  values (pid, coalesce(nullif(btrim(staff_create_product_from_raw.variant_label), ''), 'Standard'), true)
  returning id into vid;

  perform public.resolve_raw_offer(raw_id, vid, true);

  vkey := public.vendor_key(rec.brand_text);
  if vkey is not null and public.brand_for_vendor(rec.brand_text) is distinct from staff_create_product_from_raw.brand then
    insert into public.brand_vendor_aliases (vendor_key, brand_id) values (vkey, staff_create_product_from_raw.brand)
    on conflict (vendor_key) do update set brand_id = excluded.brand_id;
  end if;

  perform public.log_staff_action('raw_offer.create_product', 'product', pid::text, null,
                                  jsonb_build_object('raw_id', raw_id, 'slug', new_slug, 'title', rec.title));
  return jsonb_build_object('product_id', pid, 'variant_id', vid, 'slug', new_slug);
end;
$$;

revoke execute on function public.staff_create_product_from_raw(uuid, uuid, uuid, text, text, integer) from public, anon;
grant execute on function public.staff_create_product_from_raw(uuid, uuid, uuid, text, text, integer) to authenticated, service_role;

-- ---------------------------------------------------------------------------------------------
-- Pickleball Grip Doctor: retailer + source (off until the store's token is configured)
-- ---------------------------------------------------------------------------------------------

insert into public.retailers (slug, name, kind, domain, price_display_default, ownership_note)
values ('pickleball-grip-doctor', 'Pickleball Grip Doctor', 'retailer', 'pickleballgripdoctor.com', 'show',
        'PickleDeals’ owner also owns this store')
on conflict (slug) do update set ownership_note = excluded.ownership_note;

-- mode: 'storefront' (Storefront API, private token; the PickleDeals headless channel only) or
-- 'public' (the store's public product JSON: whole Online Store, no stock levels; a stopgap).
-- shipping: flat_cents for every order unless the item price reaches free_over_cents.
insert into public.ingestion_sources (slug, name, kind, retailer_id, is_active, interval_minutes, max_age_minutes, config)
values ('shopify-gripdoctor', 'Pickleball Grip Doctor (Shopify)', 'feed',
        (select id from public.retailers where slug = 'pickleball-grip-doctor'), false, 30, 360,
        jsonb_build_object('adapter', 'shopify', 'mode', 'storefront', 'retailer_slug', 'pickleball-grip-doctor',
                           'domain_env', 'SHOPIFY_GRIPDOCTOR_DOMAIN', 'token_env', 'SHOPIFY_GRIPDOCTOR_TOKEN',
                           'store_url', 'https://pickleballgripdoctor.com', 'utm_source', 'pickledeals',
                           'complete', true, 'max_records', 5000,
                           'shipping', jsonb_build_object('flat_cents', 0, 'free_over_cents', null)))
on conflict (slug) do nothing;
