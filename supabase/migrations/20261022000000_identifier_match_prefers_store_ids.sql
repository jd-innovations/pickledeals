-- Exact-identifier matching now prefers the store's own IDs (retailer_sku, asin) over shared barcodes.
-- Stores reuse one barcode across items: Pickleball Grip Doctor's HEXXO 1- and 2-pack share a UPC, and
-- Thrive's Ignite swing weights share a GTIN. With `limit 1` and no order, a record could match the
-- sibling variant that first learned the barcode (Oct 7: Ignite 110–113 landed on 109). A store ID is
-- unique per item, so it wins; barcodes still match items the store hasn't been matched on yet.
-- Same function otherwise.

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
  extra    jsonb := jsonb_build_object('already_queued', 0, 'learned', 0, 'identifier_conflicts', 0);
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
