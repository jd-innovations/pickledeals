-- Store content (user decision, Oct 5, 2026): products sold through a connected Shopify store show the
-- store's full description and images, kept in sync automatically. Pickleball Grip Doctor holds the
-- rights to this content. Descriptions are stored as structured blocks (headings, paragraphs, lists,
-- bold) parsed from the store HTML by the ingest function; the app renders them in its own styles.
--   · products.description + content link (content_source_id, content_ref, content_hash, synced_at)
--   · retailer_offers.content_ref: which store product an offer belongs to
--   · product_images.content_source_id: images managed by the sync (curated images are never touched)
--   · Create product copies description and specs from the import record and asks for a run, so the
--     images arrive within minutes; products without content link themselves to a store automatically

alter table public.products
  add column description       jsonb check (description is null or jsonb_typeof(description) = 'array'),
  add column content_source_id uuid references public.ingestion_sources (id) on delete set null,
  add column content_ref       text check (char_length(content_ref) <= 120),
  add column content_hash      text,
  add column content_synced_at timestamptz;

comment on column public.products.description is
  'Store description as blocks: {kind: heading, text} | {kind: paragraph, runs[]} | {kind: list, items: runs[][]}; runs are {text, bold?}.';

grant select (description) on public.products to anon, authenticated;
-- Staff see where a product's content comes from (admin product page). Not sensitive.
grant select (content_source_id, content_ref, content_synced_at) on public.products to authenticated;

alter table public.retailer_offers add column content_ref text check (char_length(content_ref) <= 120);
alter table public.product_images
  add column content_source_id uuid references public.ingestion_sources (id) on delete set null;

create index products_content_source on public.products (content_source_id) where content_source_id is not null;

-- ---------------------------------------------------------------------------------------------
-- Offers remember their store product (content_ref). Otherwise as in 20261018000000.
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
                                           in_stock, available_sizes, status, price_source, price_display, ships_from, content_ref)
  values (vid, rec.retailer_id, (select source_id from public.ingestion_runs where id = rec.run_id), rec.external_ref,
          rec.url, rec.price_cents, coalesce(rec.shipping_cents, 0), coalesce(rec.in_stock, true),
          coalesce(rec.available_sizes, '{}'), 'active',
          case src when 'api' then 'api' when 'feed' then 'feed' else 'manual' end::public.price_source,
          case when src = 'api' then case when rec.price_cents is null then 'check_price' else 'show' end::public.price_display end,
          ships, left(nullif(btrim(rec.payload ->> 'content_ref'), ''), 120))
  on conflict on constraint retailer_offers_unique do update set
    url = excluded.url, price_cents = excluded.price_cents, shipping_cents = excluded.shipping_cents,
    in_stock = excluded.in_stock, available_sizes = excluded.available_sizes, status = 'active',
    source_id = excluded.source_id, price_source = excluded.price_source,
    price_display = coalesce(excluded.price_display, (select r.price_display_default from public.retailers r where r.id = excluded.retailer_id)),
    ships_from = excluded.ships_from,
    content_ref = excluded.content_ref,
    last_checked_at = now()
  returning o.id, (o.xmax = 0) into oid, created;

  update public.raw_offer_records
     set match_status = 'matched', matched_variant_id = vid, offer_id = oid
   where id = raw_id;
  return jsonb_build_object('offer_id', oid, 'created', created);
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- Create product starts complete: description, specs and the store link come from the record.
-- Otherwise as in 20261018000000.
-- ---------------------------------------------------------------------------------------------

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
  rec      public.raw_offer_records;
  base     text;
  new_slug text;
  n        integer := 1;
  pid      uuid;
  vid      uuid;
  vkey     text;
  src_id   uuid;
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

  -- Store content from the import record: description and specs now; images on the source's next run,
  -- requested here so they arrive within minutes.
  if nullif(rec.payload ->> 'content_ref', '') is not null then
    select ru.source_id into src_id from public.ingestion_runs ru where ru.id = rec.run_id;
    update public.products p
       set description = case when jsonb_typeof(rec.payload -> 'description') = 'array' then rec.payload -> 'description' end,
           specs = case when jsonb_typeof(rec.payload -> 'specs') = 'object' then rec.payload -> 'specs' else p.specs end,
           content_source_id = src_id,
           content_ref = left(rec.payload ->> 'content_ref', 120)
     where p.id = pid;
    update public.ingestion_sources s set next_run_at = now() where s.id = src_id and s.is_active;
  end if;

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

-- ---------------------------------------------------------------------------------------------
-- Sync helpers for the ingest function (service role only)
-- ---------------------------------------------------------------------------------------------

-- Products with no description and no active images adopt the store content of their active offers
-- from this source. Returns every product linked to the source.
create or replace function public.link_store_content(source uuid)
returns table (product_id uuid, slug text, content_ref text, content_hash text)
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.products p
     set content_source_id = link_store_content.source, content_ref = x.content_ref, content_hash = null
    from (select distinct on (v.product_id) v.product_id, o.content_ref
            from public.retailer_offers o
            join public.product_variants v on v.id = o.variant_id
           where o.source_id = link_store_content.source and o.status = 'active' and o.content_ref is not null
           order by v.product_id, o.last_checked_at desc) x
   where p.id = x.product_id and p.content_source_id is null and p.description is null
     and not exists (select 1 from public.product_images i where i.product_id = p.id and i.status = 'active');

  return query
  select p.id, p.slug::text, p.content_ref, p.content_hash
    from public.products p
   where p.content_source_id = link_store_content.source and p.content_ref is not null;
end;
$$;

-- Writes a product's synced description, and specs only while staff haven't filled any.
create or replace function public.apply_store_content(product uuid, description jsonb, specs jsonb, hash text)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.products p
     set description = case when jsonb_typeof(apply_store_content.description) = 'array'
                             and jsonb_array_length(apply_store_content.description) > 0
                            then apply_store_content.description end,
         specs = case when p.specs = '{}'::jsonb and jsonb_typeof(apply_store_content.specs) = 'object'
                      then apply_store_content.specs else p.specs end,
         content_hash = apply_store_content.hash,
         content_synced_at = now()
   where p.id = apply_store_content.product;
$$;

revoke execute on function public.link_store_content(uuid), public.apply_store_content(uuid, jsonb, jsonb, text)
  from public, anon, authenticated;
grant execute on function public.link_store_content(uuid), public.apply_store_content(uuid, jsonb, jsonb, text) to service_role;

-- ---------------------------------------------------------------------------------------------
-- Admin: use a store offer's content for an existing product (e.g. one with curated images)
-- ---------------------------------------------------------------------------------------------

create or replace function public.staff_use_store_content(product uuid, offer uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  o public.retailer_offers;
begin
  if not public.is_staff() then
    raise exception 'staff_use_store_content requires an admin or editor' using errcode = '42501';
  end if;
  select * into o from public.retailer_offers where id = staff_use_store_content.offer;
  if o.id is null or o.content_ref is null or o.source_id is null then
    raise exception 'this offer has no store content' using errcode = '22023';
  end if;
  if not exists (select 1 from public.product_variants v where v.id = o.variant_id and v.product_id = staff_use_store_content.product) then
    raise exception 'the offer belongs to another product' using errcode = '22023';
  end if;
  update public.products p
     set content_source_id = o.source_id, content_ref = o.content_ref, content_hash = null
   where p.id = staff_use_store_content.product;
  update public.ingestion_sources s set next_run_at = now() where s.id = o.source_id and s.is_active;
  perform public.log_staff_action('product.use_store_content', 'product', staff_use_store_content.product::text, null,
                                  jsonb_build_object('offer_id', o.id, 'content_ref', o.content_ref));
end;
$$;

revoke execute on function public.staff_use_store_content(uuid, uuid) from public, anon;
grant execute on function public.staff_use_store_content(uuid, uuid) to authenticated;
