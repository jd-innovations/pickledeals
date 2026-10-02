-- Phase 3: ingestion pipeline (§9). Every offer source — admin form, CSV, later feeds and APIs —
-- writes raw_offer_records and goes through one matcher:
--   1. explicit variant (admin picked it)   2. product slug (+ variant label)
--   3. exact identifier (GTIN/UPC/EAN/MPN, or ASIN/SKU at that retailer)
--   otherwise → review queue with fuzzy suggestions (never auto-matched).
-- Matched records upsert retailer_offers; triggers append price points and refresh stats.

-- Phase 2 left this as a seam.
alter table public.product_identifiers
  add constraint product_identifiers_retailer_fk foreign key (retailer_id) references public.retailers (id) on delete cascade;

-- Closest catalog products for a retailer title: how much of the product's name (or an alias)
-- appears in the title, blended with whole-document similarity. Suggestions only, never
-- auto-matched. SECURITY DEFINER because the search document isn't client-readable; returns
-- public fields only.
create or replace function public.suggest_catalog_matches(title text, brand text default null, max_rows integer default 3)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with needle as (select lower(concat_ws(' ', brand, title)) as n)
  select coalesce(jsonb_agg(s order by s.score desc), '[]')
    from (select c.product_slug, c.brand, c.name, c.variant_id, round(c.score::numeric, 3) as score
            from (select p.slug as product_slug, b.name as brand, p.name,
                         (select v.id from public.product_variants v where v.product_id = p.id and v.is_default) as variant_id,
                         0.6 * greatest(
                                 extensions.word_similarity(lower(b.name || ' ' || p.name), needle.n),
                                 coalesce((select max(extensions.word_similarity(a.alias, needle.n))
                                             from public.product_aliases a where a.product_id = p.id), 0))
                         + 0.4 * extensions.word_similarity(needle.n, p.search_text) as score
                    from public.products p join public.brands b on b.id = p.brand_id, needle) c
           where c.score > 0.45
           order by c.score desc
           limit least(greatest(max_rows, 1), 10)) s;
$$;

revoke execute on function public.suggest_catalog_matches(text, text, integer) from public, anon;
grant execute on function public.suggest_catalog_matches(text, text, integer) to authenticated;

-- Upserts the offer for a raw record matched to a variant. Returns {offer_id, created}.
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
begin
  select * into rec from public.raw_offer_records where id = raw_id;
  select s.kind into src from public.ingestion_runs r join public.ingestion_sources s on s.id = r.source_id where r.id = rec.run_id;

  insert into public.retailer_offers as o (variant_id, retailer_id, source_id, external_ref, url, price_cents, shipping_cents,
                                           in_stock, available_sizes, status, price_source, price_display)
  values (vid, rec.retailer_id, (select source_id from public.ingestion_runs where id = rec.run_id), rec.external_ref,
          rec.url, rec.price_cents, coalesce(rec.shipping_cents, 0), coalesce(rec.in_stock, true),
          coalesce(rec.available_sizes, '{}'), 'active',
          case src when 'api' then 'api' when 'feed' then 'feed' else 'manual' end::public.price_source, null)
  on conflict on constraint retailer_offers_unique do update set
    url = excluded.url, price_cents = excluded.price_cents, shipping_cents = excluded.shipping_cents,
    in_stock = excluded.in_stock, available_sizes = excluded.available_sizes, status = 'active',
    source_id = excluded.source_id, price_source = excluded.price_source, last_checked_at = now()
  returning o.id, (o.xmax = 0) into oid, created;

  update public.raw_offer_records
     set match_status = 'matched', matched_variant_id = vid, offer_id = oid
   where id = raw_id;
  return jsonb_build_object('offer_id', oid, 'created', created);
end;
$$;

create or replace function public.ingest_offers(source text, records jsonb, dry_run boolean default true)
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
  idx      integer := 0;
  summary   jsonb := jsonb_build_object('matched', 0, 'unmatched', 0, 'offers_created', 0, 'offers_updated', 0);
  errors   jsonb := '[]'::jsonb;
  queued   jsonb := '[]'::jsonb;
  price    integer;
begin
  if not (current_user in ('postgres', 'service_role') or public.is_staff()) then
    raise exception 'ingest_offers requires an admin or editor' using errcode = '42501';
  end if;
  select * into src from public.ingestion_sources where slug = source and is_active;
  if src.id is null then
    raise exception 'unknown ingestion source "%"', source using errcode = '22023';
  end if;

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

        insert into public.raw_offer_records (run_id, payload, retailer_id, title, brand_text, gtin, upc, ean, asin, mpn,
                                              retailer_sku, external_ref, url, price_cents, shipping_cents, in_stock, available_sizes)
        values (run_id, rec, r.id, rec ->> 'title', rec ->> 'brand', nullif(rec ->> 'gtin', ''), nullif(rec ->> 'upc', ''),
                nullif(rec ->> 'ean', ''), nullif(rec ->> 'asin', ''), nullif(rec ->> 'mpn', ''), nullif(rec ->> 'retailer_sku', ''),
                nullif(rec ->> 'external_ref', ''), rec ->> 'url', price, nullif(rec ->> 'shipping_cents', '')::int,
                coalesce((rec ->> 'in_stock')::boolean, true),
                coalesce((select array_agg(x) from jsonb_array_elements_text(rec -> 'available_sizes') x), '{}'))
        returning id into raw_id;

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
            from public.product_identifiers i, public.raw_offer_records x
           where x.id = raw_id
             and ((i.retailer_id is null and (i.kind, i.value) in (('gtin', x.gtin), ('upc', x.upc), ('ean', x.ean), ('mpn', x.mpn)))
               or (i.retailer_id = r.id and (i.kind, i.value) in (('asin', x.asin), ('retailer_sku', x.retailer_sku))))
           limit 1;
          method := 'identifier';
        end if;

        if vid is not null then
          update public.raw_offer_records set match_method = method, match_confidence = 1 where id = raw_id;
          applied := public.apply_raw_offer(raw_id, vid);
          summary := jsonb_set(summary, '{matched}', to_jsonb((summary ->> 'matched')::int + 1));
          summary := jsonb_set(summary, array[case when (applied ->> 'created')::boolean then 'offers_created' else 'offers_updated' end],
                              to_jsonb((summary ->> case when (applied ->> 'created')::boolean then 'offers_created' else 'offers_updated' end)::int + 1));
        else
          -- Review queue, with the closest catalog products as suggestions.
          update public.raw_offer_records x
             set match_status = 'unmatched',
                 suggestions = public.suggest_catalog_matches(x.title, x.brand_text)
           where x.id = raw_id;
          summary := jsonb_set(summary, '{unmatched}', to_jsonb((summary ->> 'unmatched')::int + 1));
          queued := queued || jsonb_build_object('row', idx, 'raw_id', raw_id, 'title', rec ->> 'title');
        end if;
      exception when others then
        errors := errors || jsonb_build_object('row', idx, 'message', sqlerrm);
      end;
    end loop;

    update public.ingestion_runs set report = summary || jsonb_build_object('errors', errors) where id = run_id;

    if dry_run or jsonb_array_length(errors) > 0 then
      raise exception using errcode = 'P0D01', message = 'rollback';
    end if;
  exception when sqlstate 'P0D01' then
    null;
  end;

  return summary || jsonb_build_object(
    'dry_run', dry_run,
    'applied', not dry_run and jsonb_array_length(errors) = 0,
    'run_id', case when not dry_run and jsonb_array_length(errors) = 0 then run_id end,
    'queued', queued,
    'errors', errors);
end;
$$;

-- Review queue: match an unmatched record to a variant, optionally remembering its identifiers so
-- the next import matches automatically.
create or replace function public.resolve_raw_offer(raw_id uuid, variant uuid, remember boolean default true)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  rec     public.raw_offer_records;
  applied jsonb;
begin
  if not (current_user in ('postgres', 'service_role') or public.is_staff()) then
    raise exception 'resolve_raw_offer requires an admin or editor' using errcode = '42501';
  end if;
  select * into rec from public.raw_offer_records where id = raw_id for update;
  if rec.id is null then
    raise exception 'record not found' using errcode = 'P0002';
  end if;
  if rec.match_status <> 'unmatched' then
    raise exception 'record is already %', rec.match_status using errcode = '22023';
  end if;

  update public.raw_offer_records
     set match_method = 'review', match_confidence = 1, resolved_at = now(), resolved_by = auth.uid()
   where id = raw_id;
  applied := public.apply_raw_offer(raw_id, variant);

  if remember then
    insert into public.product_identifiers (variant_id, kind, value, retailer_id)
    select variant, k.kind::public.identifier_kind, k.value, k.retailer_id
      from (values ('gtin', rec.gtin, null::uuid), ('upc', rec.upc, null), ('ean', rec.ean, null), ('mpn', rec.mpn, null),
                   ('asin', rec.asin, rec.retailer_id), ('retailer_sku', rec.retailer_sku, rec.retailer_id)) k(kind, value, retailer_id)
     where k.value is not null
    on conflict on constraint product_identifiers_unique do nothing;
  end if;
  return applied;
end;
$$;

create or replace function public.reject_raw_offer(raw_id uuid)
returns void
language plpgsql
set search_path = ''
as $$
begin
  if not (current_user in ('postgres', 'service_role') or public.is_staff()) then
    raise exception 'reject_raw_offer requires an admin or editor' using errcode = '42501';
  end if;
  update public.raw_offer_records
     set match_status = 'rejected', resolved_at = now(), resolved_by = auth.uid()
   where id = raw_id and match_status = 'unmatched';
end;
$$;

revoke execute on function public.apply_raw_offer(uuid, uuid), public.ingest_offers(text, jsonb, boolean),
  public.resolve_raw_offer(uuid, uuid, boolean), public.reject_raw_offer(uuid) from public, anon;
grant execute on function public.apply_raw_offer(uuid, uuid), public.ingest_offers(text, jsonb, boolean),
  public.resolve_raw_offer(uuid, uuid, boolean), public.reject_raw_offer(uuid) to authenticated, service_role;
