-- Trusted stores add new items themselves (config.auto_create, on for Pickleball Grip Doctor at the
-- owner's request, Oct 7): an in-stock item that matches nothing becomes a published catalog product
-- (brand from the vendor, created if new; category from the product type or title; tidied name; store
-- content), or one more option of a store product already in the catalog (e.g. a restocked swing
-- weight). Unsure items (no vendor, no category rule) still wait in the review queue. Admins get an
-- Activity notification and a staff log entry. Promo codes are never extended automatically.
--
-- staff_create_product_from_raw is split into the internal create_product_from_raw (no auth check,
-- not callable by clients) and the staff wrapper (auth check + log), unchanged for the admin.

create or replace function public.create_product_from_raw(
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
  select * into rec from public.raw_offer_records where id = raw_id;
  if rec.id is null then
    raise exception 'record not found' using errcode = 'P0002';
  end if;
  if rec.match_status <> 'unmatched' then
    raise exception 'record is already %', rec.match_status using errcode = '22023';
  end if;
  if char_length(btrim(coalesce(create_product_from_raw.name, ''))) not between 1 and 120 then
    raise exception 'name must be 1–120 characters' using errcode = '22023';
  end if;

  select left(regexp_replace(regexp_replace(lower(b.slug || ' ' || create_product_from_raw.name), '[^a-z0-9]+', '-', 'g'), '(^-+|-+$)', '', 'g'), 72)
    into base
    from public.brands b where b.id = create_product_from_raw.brand;
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
  values (create_product_from_raw.brand, create_product_from_raw.category, new_slug,
          btrim(create_product_from_raw.name), create_product_from_raw.msrp_cents, 'draft')
  returning id into pid;
  insert into public.product_variants (product_id, label, is_default)
  values (pid, coalesce(nullif(btrim(create_product_from_raw.variant_label), ''), 'Standard'), true)
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
  if vkey is not null and public.brand_for_vendor(rec.brand_text) is distinct from create_product_from_raw.brand then
    insert into public.brand_vendor_aliases (vendor_key, brand_id) values (vkey, create_product_from_raw.brand)
    on conflict (vendor_key) do update set brand_id = excluded.brand_id;
  end if;

  return jsonb_build_object('product_id', pid, 'variant_id', vid, 'slug', new_slug);
end;
$$;

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
  res jsonb;
begin
  -- Definer function: current_user is always the owner here, so only the caller's claims count.
  if not public.is_staff() then
    raise exception 'staff_create_product_from_raw requires an admin or editor' using errcode = '42501';
  end if;
  res := public.create_product_from_raw(raw_id, brand, category, name, variant_label, msrp_cents);
  perform public.log_staff_action('raw_offer.create_product', 'product', res ->> 'product_id', null,
                                  jsonb_build_object('raw_id', raw_id, 'slug', res ->> 'slug',
                                                     'title', (select x.title from public.raw_offer_records x where x.id = raw_id)));
  return res;
end;
$$;

-- Category from a store's product type or title (first rule that matches). Null when unsure: the item
-- then waits in the review queue instead of landing in a guessed category.
create or replace function public.store_category_slug(t text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when t is null or btrim(t) = '' then null
    when t ~* '\mball\s*machines?\M|\mlaunchers?\M' then 'ball-machines'
    when t ~* '\m(towels?|line markers?|cones?|scorekeepers?|squeegees?)\M' then 'court-accessories'
    when t ~* '\m(socks?|shirts?|tees?|t-shirts?|hats?|caps?|visors?|hoodies?|shorts|skirts?|dress|jackets?|apparel|headbands?|wristbands?)\M' then 'apparel'
    when t ~* '\m(insoles?|shoes?|sneakers?|footwear)\M' then 'shoes'
    when t ~* '\m(bags?|backpacks?|duffels?|totes?|slings?)\M' then 'bags'
    when t ~* '\m(glasses|eyewear|sunglasses|goggles)\M' then 'eyewear'
    when t ~* '\mnets?\M' then 'nets'
    when t ~* '\mballs\M|\mball\s+(pack|set|bucket)' then 'balls'
    when t ~* '\m(training|trainers?)\M' then 'training'
    when t ~* '\m(lead|tape|weights?|cleaner|cleaning|spray|eraser|edge\s*guards?|kits?|covers?|cases?|dampeners?|attachments?|counterweights?)\M' then 'paddle-accessories'
    when t ~* '\m(grips?|overgrips?|undergrips?|wraps?)\M' then 'grips'
    when t ~* '\mpaddles?\M' then 'paddles'
  end;
$$;

-- A store title tidied into a catalog name: no "*AVAILABLE NOW*" / "**NEW**" / "NEW." markers, no
-- "| …" tail, no "(recommended …)" note, no leading vendor or brand name; long SEO titles are cut at
-- the first dash or comma.
create or replace function public.store_product_name(title text, vendor text, brand_name text)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  n   text := coalesce(title, '');
  w   text;
  cut integer;
begin
  n := regexp_replace(n, '\*+[^*]*\*+', ' ', 'g');
  n := split_part(n, ' | ', 1);
  n := regexp_replace(n, '\s*\([^)]*recommended[^)]*\)', '', 'gi');
  n := regexp_replace(n, '^\s*(new(\s+graphic)?\s*[.!:]\s*)+', '', 'i');
  n := regexp_replace(n, '\s+-\s+PGD\s*$', '', 'i');
  foreach w in array array[vendor, brand_name] loop
    if nullif(btrim(w), '') is not null then
      n := regexp_replace(n, '^\s*' || regexp_replace(btrim(w), '([.^$|?*+()\[\]{}\\])', '\\\1', 'g') || '\s+', '', 'i');
    end if;
  end loop;
  n := btrim(regexp_replace(n, '\s+', ' ', 'g'));
  if char_length(n) > 60 then
    cut := least(nullif(strpos(n, ' – '), 0), nullif(strpos(n, ' - '), 0), nullif(strpos(n, ', '), 0));
    if cut > 10 then
      n := left(n, cut - 1);
    end if;
  end if;
  n := btrim(regexp_replace(n, '[\s.|–-]+$', ''));
  if n = '' then
    n := btrim(coalesce(title, ''));
  end if;
  return left(n, 120);
end;
$$;

-- New in-stock item from a store with config.auto_create: a published catalog product, or one more
-- option (e.g. a swing weight) of a store product already in the catalog. Returns the variant, or null
-- when the item should wait for review (no vendor, unsure category, or nothing safe to do).
create or replace function public.auto_create_from_raw(raw_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  rec      public.raw_offer_records;
  p        jsonb;
  src_id   uuid;
  v_label  text;
  pid      uuid;
  vid      uuid;
  vendor   text;
  v_title  text;
  cat_slug text;
  cat      uuid;
  bid      uuid;
  bname    text;
  bslug    text;
  pname    text;
  res      jsonb;
begin
  select * into rec from public.raw_offer_records x where x.id = raw_id;
  if rec.id is null or rec.match_status <> 'unmatched' or not rec.in_stock then
    return null;
  end if;
  p := rec.payload;
  select ru.source_id into src_id from public.ingestion_runs ru where ru.id = rec.run_id;
  v_label := left(nullif(btrim(p ->> 'store_variant'), ''), 60);

  -- Another option of a store product that's already in the catalog.
  if nullif(p ->> 'content_ref', '') is not null then
    select pr.id into pid from public.products pr
     where pr.content_source_id = src_id and pr.content_ref = left(p ->> 'content_ref', 120)
     limit 1;
  end if;
  if pid is not null then
    if v_label is null then
      return null;
    end if;
    select v.id into vid from public.product_variants v where v.product_id = pid and v.label = v_label;
    if vid is null then
      insert into public.product_variants (product_id, label, is_default, sort)
      values (pid, v_label, false, coalesce((select max(v.sort) + 1 from public.product_variants v where v.product_id = pid), 0))
      returning id into vid;
    end if;
    perform public.resolve_raw_offer(raw_id, vid, true);
    perform public.log_staff_action('raw_offer.auto_variant', 'product', pid::text, null,
                                    jsonb_build_object('raw_id', raw_id, 'label', v_label, 'title', rec.title));
    return vid;
  end if;

  vendor := btrim(coalesce(rec.brand_text, ''));
  if vendor = '' then
    return null;
  end if;
  v_title := coalesce(nullif(btrim(p ->> 'store_title'), ''), rec.title);
  cat_slug := coalesce(public.store_category_slug(p ->> 'product_type'),
                       public.store_category_slug(regexp_replace(v_title, regexp_replace(vendor, '([.^$|?*+()\[\]{}\\])', '\\\1', 'g'), ' ', 'gi')));
  select c.id into cat from public.categories c where c.slug = cat_slug;
  if cat is null then
    return null;
  end if;

  -- Brand: a known vendor name, else a new brand named after the vendor ("Thrive Pickleball" → "Thrive").
  bid := public.brand_for_vendor(vendor);
  if bid is null then
    bname := left(coalesce(nullif(btrim(regexp_replace(vendor, '\s+pickleball$', '', 'i')), ''), vendor), 60);
    bslug := left(btrim(regexp_replace(lower(bname), '[^a-z0-9]+', '-', 'g'), '-'), 60);
    if bslug = '' then
      return null;
    end if;
    insert into public.brands (slug, name) values (bslug, bname) on conflict (slug) do nothing;
    select b.id into bid from public.brands b where b.slug = bslug;
  end if;
  select b.name into bname from public.brands b where b.id = bid;

  pname := public.store_product_name(v_title, vendor, bname);
  res := public.create_product_from_raw(raw_id, bid, cat, pname, v_label, null);
  pid := (res ->> 'product_id')::uuid;
  update public.products set status = 'active' where id = pid;

  perform public.log_staff_action('raw_offer.auto_create', 'product', pid::text, null,
                                  jsonb_build_object('raw_id', raw_id, 'slug', res ->> 'slug', 'title', rec.title));
  -- Admins hear about it (Alerts › Activity, and a push) so they can rename or re-categorise.
  insert into public.notifications (user_id, type, title, body, route, data, dedupe_key)
  select ur.user_id, 'system', 'New product added',
         left(format('%s %s was added from %s. Check its name and category in the admin.', bname, pname,
                     (select rt.name from public.retailers rt where rt.id = rec.retailer_id)), 240),
         '/deals/product/' || (res ->> 'slug'), jsonb_build_object('product_id', pid), 'auto-product:' || pid
    from public.user_roles ur where ur.role = 'admin'
  on conflict on constraint notifications_dedupe do nothing;
  return (res ->> 'variant_id')::uuid;
end;
$$;

-- ingest_offers: as in 20261022000000, plus the auto_create hook (new records, and records already
-- waiting in the queue).
create or replace function public.ingest_offers(source text, records jsonb, dry_run boolean default true, automated boolean default false)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  src      public.ingestion_sources;
  run_id   uuid;
  rec      jsonb;
  r        public.retailers;
  raw_id   uuid;
  vid      uuid;
  method   text;
  applied  jsonb;
  learn    jsonb;
  idx      integer := 0;
  summary  jsonb := jsonb_build_object('matched', 0, 'unmatched', 0, 'offers_created', 0, 'offers_updated', 0);
  extra    jsonb := jsonb_build_object('already_queued', 0, 'learned', 0, 'identifier_conflicts', 0, 'auto_created', 0);
  auto     boolean;
  errors   jsonb := '[]'::jsonb;
  error_count integer := 0;
  queued   jsonb := '[]'::jsonb;
  price    integer;
  ref      text;
begin
  if not (current_user in ('postgres', 'service_role') or public.is_staff()) then
    raise exception 'ingest_offers requires an admin or editor' using errcode = '42501';
  end if;
  select * into src from public.ingestion_sources s where s.slug = ingest_offers.source and (s.is_active or automated);
  if src.id is null then
    raise exception 'unknown ingestion source "%"', ingest_offers.source using errcode = '22023';
  end if;
  -- config.auto_create: new in-stock items become catalog products without review (trusted stores only).
  auto := automated and coalesce((src.config ->> 'auto_create')::boolean, false);

  begin
    insert into public.ingestion_runs (source_id, created_by) values (src.id, auth.uid()) returning id into run_id;

    for rec in select * from jsonb_array_elements(coalesce(records, '[]')) loop
      idx := idx + 1;
      begin
        select * into r from public.retailers where slug = rec ->> 'retailer_slug';
        if r.id is null then
          raise exception 'unknown retailer "%"', rec ->> 'retailer_slug';
        end if;
        if coalesce(rec ->> 'url', '') = '' then
          raise exception 'url is required';
        end if;
        price := nullif(rec ->> 'price_cents', '')::int;
        if price is null and r.price_display_default = 'show' then
          raise exception '% shows prices, so price_cents is required', r.name;
        end if;
        ref := nullif(btrim(rec ->> 'external_ref'), '');

        -- 1. explicit variant
        vid := nullif(rec ->> 'variant_id', '')::uuid;
        method := 'manual';
        -- 2. product slug (+ label, else the default variant)
        if vid is null and nullif(rec ->> 'product_slug', '') is not null then
          select v.id into vid
            from public.product_variants v join public.products p on p.id = v.product_id
           where p.slug = rec ->> 'product_slug'
             and (case when nullif(rec ->> 'variant_label', '') is null then v.is_default else v.label = rec ->> 'variant_label' end);
          method := 'slug';
          if vid is null then
            raise exception 'no variant "%" for product "%"', coalesce(rec ->> 'variant_label', '(default)'), rec ->> 'product_slug';
          end if;
        end if;
        -- 3. exact identifier
        if vid is null then
          select i.variant_id into vid
            from public.product_identifiers i
           where (i.retailer_id is null and (i.kind::text, i.value) in (('gtin', rec ->> 'gtin'), ('upc', rec ->> 'upc'), ('ean', rec ->> 'ean'), ('mpn', rec ->> 'mpn')))
              or (i.retailer_id = r.id and (i.kind::text, i.value) in (('asin', rec ->> 'asin'), ('retailer_sku', rec ->> 'retailer_sku')))
           order by (i.retailer_id is null), i.created_at
           limit 1;
          method := 'identifier';
        end if;
        -- 4. automated: the same item from this source was matched before
        if vid is null and automated and ref is not null then
          select x.matched_variant_id into vid
            from public.raw_offer_records x join public.ingestion_runs ru on ru.id = x.run_id
           where ru.source_id = src.id and x.retailer_id = r.id and x.external_ref = ref
             and x.match_status = 'matched' and x.matched_variant_id is not null
           order by x.created_at desc
           limit 1;
          method := 'previous';
        end if;
        -- 5. automated: already waiting in (or rejected from) the review queue — refresh it, don't queue again
        if vid is null and automated and ref is not null then
          update public.raw_offer_records x
             set payload = rec, price_cents = price, last_seen_at = now(),
                 title = coalesce(rec ->> 'title', x.title), brand_text = coalesce(rec ->> 'brand', x.brand_text),
                 url = coalesce(nullif(rec ->> 'url', ''), x.url),
                 gtin = coalesce(nullif(rec ->> 'gtin', ''), x.gtin), upc = coalesce(nullif(rec ->> 'upc', ''), x.upc),
                 ean = coalesce(nullif(rec ->> 'ean', ''), x.ean), mpn = coalesce(nullif(rec ->> 'mpn', ''), x.mpn),
                 asin = coalesce(nullif(rec ->> 'asin', ''), x.asin),
                 retailer_sku = coalesce(nullif(rec ->> 'retailer_sku', ''), x.retailer_sku),
                 shipping_cents = coalesce(nullif(rec ->> 'shipping_cents', '')::int, x.shipping_cents),
                 in_stock = coalesce((rec ->> 'in_stock')::boolean, x.in_stock),
                 available_sizes = coalesce((select array_agg(z) from jsonb_array_elements_text(rec -> 'available_sizes') z), x.available_sizes)
            from public.ingestion_runs ru
           where ru.id = x.run_id and ru.source_id = src.id and x.retailer_id = r.id and x.external_ref = ref
             and x.match_status in ('unmatched', 'rejected');
          if found then
            -- A source that adds new items itself takes the waiting record out of the queue when it can.
            if auto then
              select x.id into raw_id
                from public.raw_offer_records x join public.ingestion_runs ru on ru.id = x.run_id
               where ru.source_id = src.id and x.retailer_id = r.id and x.external_ref = ref and x.match_status = 'unmatched'
               order by x.created_at desc
               limit 1;
              if raw_id is not null then
                if public.auto_create_from_raw(raw_id) is not null then
                  extra := jsonb_set(extra, '{auto_created}', to_jsonb((extra ->> 'auto_created')::int + 1));
                  continue;
                end if;
              end if;
            end if;
            extra := jsonb_set(extra, '{already_queued}', to_jsonb((extra ->> 'already_queued')::int + 1));
            continue;
          end if;
        end if;

        insert into public.raw_offer_records (run_id, payload, retailer_id, title, brand_text, gtin, upc, ean, asin, mpn,
                                              retailer_sku, external_ref, url, price_cents, shipping_cents, in_stock, available_sizes)
        values (run_id, rec, r.id, rec ->> 'title', rec ->> 'brand', nullif(rec ->> 'gtin', ''), nullif(rec ->> 'upc', ''),
                nullif(rec ->> 'ean', ''), nullif(rec ->> 'asin', ''), nullif(rec ->> 'mpn', ''), nullif(rec ->> 'retailer_sku', ''),
                ref, rec ->> 'url', price, nullif(rec ->> 'shipping_cents', '')::int,
                coalesce((rec ->> 'in_stock')::boolean, true),
                coalesce((select array_agg(x) from jsonb_array_elements_text(rec -> 'available_sizes') x), '{}'))
        returning id into raw_id;

        if vid is not null then
          update public.raw_offer_records set match_method = method, match_confidence = 1 where id = raw_id;
          applied := public.apply_raw_offer(raw_id, vid);
          summary := jsonb_set(summary, '{matched}', to_jsonb((summary ->> 'matched')::int + 1));
          summary := jsonb_set(summary, array[case when (applied ->> 'created')::boolean then 'offers_created' else 'offers_updated' end],
                              to_jsonb((summary ->> case when (applied ->> 'created')::boolean then 'offers_created' else 'offers_updated' end)::int + 1));
          if automated and method in ('identifier', 'previous') then
            learn := public.learn_identifiers(raw_id, vid);
            extra := jsonb_set(extra, '{learned}', to_jsonb((extra ->> 'learned')::int + (learn ->> 'learned')::int));
            extra := jsonb_set(extra, '{identifier_conflicts}', to_jsonb((extra ->> 'identifier_conflicts')::int + (learn ->> 'conflicts')::int));
          end if;
        else
          -- Review queue, with the closest catalog products as suggestions.
          update public.raw_offer_records x
             set match_status = 'unmatched',
                 suggestions = public.suggest_catalog_matches(x.title, x.brand_text)
           where x.id = raw_id;
          -- (Nested: SQL doesn't promise to skip the call when `auto` is false.)
          if auto then
            if public.auto_create_from_raw(raw_id) is not null then
              extra := jsonb_set(extra, '{auto_created}', to_jsonb((extra ->> 'auto_created')::int + 1));
              continue;
            end if;
          end if;
          summary := jsonb_set(summary, '{unmatched}', to_jsonb((summary ->> 'unmatched')::int + 1));
          if jsonb_array_length(queued) < 100 then
            queued := queued || jsonb_build_object('row', idx, 'raw_id', raw_id, 'title', rec ->> 'title');
          end if;
        end if;
      exception when others then
        error_count := error_count + 1;
        if error_count <= 50 then
          errors := errors || jsonb_build_object('row', idx, 'message', sqlerrm);
        end if;
      end;
    end loop;

    if automated then
      summary := summary || extra || jsonb_build_object('rows', idx, 'error_count', error_count);
    end if;
    update public.ingestion_runs set report = summary || jsonb_build_object('errors', errors) where id = run_id;

    if dry_run or (error_count > 0 and not automated) then
      raise exception using errcode = 'P0D01', message = 'rollback';
    end if;
  exception when sqlstate 'P0D01' then
    null;
  end;

  return summary || jsonb_build_object(
    'dry_run', dry_run,
    'applied', not dry_run and (automated or error_count = 0),
    'run_id', case when not dry_run and (automated or error_count = 0) then run_id end,
    'queued', queued,
    'errors', errors);
end;
$$;


revoke execute on function public.create_product_from_raw(uuid, uuid, uuid, text, text, integer),
                          public.auto_create_from_raw(uuid),
                          public.store_category_slug(text),
                          public.store_product_name(text, text, text)
  from public, anon, authenticated;

update public.ingestion_sources set config = config || '{"auto_create": true}'::jsonb where slug = 'shopify-gripdoctor';
