-- Phase 12: affiliate and API integrations (§9, §13). Automated sources feed the same pipeline
-- as the admin form and CSV import:
--   ingest edge function ─ adapters (Amazon Creators API, affiliate product datafeeds)
--     → ingest_offers(…, automated => true) → matcher → retailer_offers (+ identifier learning)
--   pg_cron: schedule_ingestion (due sources) · enforce_offer_freshness · purge_api_payloads
-- Amazon (D1 + Associates policy): prices only from the API; displayed prices are never older than
-- 60 minutes (read-time guard + freshness job), API prices are never kept as price history, and raw
-- API payloads are purged after 24 hours.
-- Secrets (API keys, feed URLs with credentials) live only in Edge Function env, never in the database.

-- ---------------------------------------------------------------------------------------------
-- Sources: schedule, freshness window and run state
-- ---------------------------------------------------------------------------------------------

alter table public.ingestion_sources
  add column config               jsonb not null default '{}' check (jsonb_typeof(config) = 'object'),
  -- How often the scheduler runs this source; null = manual runs only.
  add column interval_minutes     integer check (interval_minutes between 5 and 10080),
  -- Offers from this source not refreshed within this window stop showing a price (api) or go inactive (feed).
  add column max_age_minutes      integer check (max_age_minutes between 15 and 20160),
  add column next_run_at          timestamptz,
  add column running_since        timestamptz,
  add column last_started_at      timestamptz,
  add column last_finished_at     timestamptz,
  add column last_success_at      timestamptz,
  add column last_error           text,
  add column consecutive_failures integer not null default 0,
  add column updated_at           timestamptz not null default now(),
  -- Amazon policy: API prices refreshed less often than hourly need a timestamp on every display.
  -- Holding API offers to 60 minutes lets compact cards show them without one.
  add constraint ingestion_sources_api_hourly check (kind <> 'api' or max_age_minutes is null or max_age_minutes <= 60),
  -- Function config may name an env var for a feed URL; only FEED_URL_* names are ever read.
  add constraint ingestion_sources_url_env check (config ->> 'url_env' is null or config ->> 'url_env' ~ '^FEED_URL_[A-Z0-9_]{1,60}$');

create trigger ingestion_sources_set_updated_at before update on public.ingestion_sources
  for each row execute function public.set_updated_at();
create trigger ingestion_sources_audit after insert or update or delete on public.ingestion_sources
  for each row execute function public.log_staff_change();

-- Off until credentials are configured and an admin turns them on.
insert into public.ingestion_sources (slug, name, kind, retailer_id, is_active, interval_minutes, max_age_minutes, config)
values
  ('amazon-creators', 'Amazon Creators API', 'api', (select id from public.retailers where slug = 'amazon'), false, 30, 60,
   jsonb_build_object('adapter', 'amazon-creators', 'retailer_slug', 'amazon', 'marketplace', 'www.amazon.com', 'max_requests', 60)),
  ('avantlink-selkirk', 'Selkirk.com (AvantLink datafeed)', 'feed', (select id from public.retailers where slug = 'selkirk-com'), false, 360, 2880,
   jsonb_build_object('adapter', 'delimited-feed', 'network', 'avantlink', 'retailer_slug', 'selkirk-com',
                      'url_env', 'FEED_URL_AVANTLINK_SELKIRK', 'complete', true, 'max_records', 20000,
                      -- Candidate column names per field (case-insensitive); edit in the admin to match the real feed.
                      'columns', jsonb_build_object(
                        'external_ref', jsonb_build_array('SKU', 'Product SKU', 'Merchant SKU'),
                        'title', jsonb_build_array('Product Name', 'Name'),
                        'brand', jsonb_build_array('Brand Name', 'Brand', 'Manufacturer'),
                        'upc', jsonb_build_array('UPC', 'Product UPC'),
                        'gtin', jsonb_build_array('GTIN', 'EAN'),
                        'mpn', jsonb_build_array('Manufacturer Id', 'Manufacturer Part Number', 'MPN'),
                        'price', jsonb_build_array('Retail Price', 'Price'),
                        'sale_price', jsonb_build_array('Sale Price'),
                        'url', jsonb_build_array('Product URL', 'Product Page URL'),
                        'buy_link', jsonb_build_array('Buy Link'),
                        'in_stock', jsonb_build_array('In Stock', 'Availability', 'Inventory'),
                        'shipping', jsonb_build_array('Shipping', 'Shipping Cost'))))
on conflict (slug) do nothing;

-- Raw records: last time an automated source saw an already-queued item.
alter table public.raw_offer_records add column last_seen_at timestamptz;
create index raw_offer_records_ref on public.raw_offer_records (retailer_id, external_ref) where external_ref is not null;
create index raw_offer_records_run_offer on public.raw_offer_records (run_id) where offer_id is not null;
create index retailer_offers_source on public.retailer_offers (source_id) where status = 'active';

-- ---------------------------------------------------------------------------------------------
-- Identifiers: provenance + automatic learning
-- ---------------------------------------------------------------------------------------------

alter table public.product_identifiers
  add column source       text not null default 'catalog' check (source in ('catalog', 'review', 'learned')),
  add column learned_from uuid references public.raw_offer_records (id) on delete set null;

-- ASINs are Amazon's identifiers: bind them to the Amazon retailer so the matcher finds them.
create or replace function public.product_identifiers_normalize()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.kind = 'asin' and new.retailer_id is null then
    new.retailer_id := (select id from public.retailers where slug = 'amazon');
  end if;
  new.value := btrim(new.value);
  return new;
end;
$$;

create trigger product_identifiers_normalize before insert or update on public.product_identifiers
  for each row execute function public.product_identifiers_normalize();

-- After an exact match, remember the record's other identifiers for the variant. Never overwrites:
-- an identifier already pointing at another variant is counted as a conflict and left alone.
create or replace function public.learn_identifiers(raw_id uuid, vid uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  rec       public.raw_offer_records;
  k         record;
  existing  uuid;
  learned   integer := 0;
  conflicts integer := 0;
begin
  select * into rec from public.raw_offer_records where id = raw_id;
  for k in
    select v.kind, btrim(v.value) as value, v.retailer_id
      from (values ('gtin', rec.gtin, null::uuid), ('upc', rec.upc, null), ('ean', rec.ean, null), ('mpn', rec.mpn, null),
                   ('asin', rec.asin, rec.retailer_id), ('retailer_sku', rec.retailer_sku, rec.retailer_id)) v(kind, value, retailer_id)
     where v.value is not null
       and case when v.kind in ('gtin', 'upc', 'ean') then btrim(v.value) ~ '^[0-9]{8,14}$'
                else btrim(v.value) ~ '^[A-Za-z0-9._/-]{3,64}$' end
  loop
    select i.variant_id into existing
      from public.product_identifiers i
     where i.kind = k.kind::public.identifier_kind and i.value = k.value and i.retailer_id is not distinct from k.retailer_id;
    if existing is null then
      insert into public.product_identifiers (variant_id, kind, value, retailer_id, source, learned_from)
      values (vid, k.kind::public.identifier_kind, k.value, k.retailer_id, 'learned', raw_id)
      on conflict on constraint product_identifiers_unique do nothing;
      learned := learned + 1;
    elsif existing <> vid then
      conflicts := conflicts + 1;
    end if;
  end loop;
  return jsonb_build_object('learned', learned, 'conflicts', conflicts);
end;
$$;

-- Review-queue matches are remembered with their provenance.
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
    insert into public.product_identifiers (variant_id, kind, value, retailer_id, source, learned_from)
    select variant, k.kind::public.identifier_kind, k.value, k.retailer_id, 'review', raw_id
      from (values ('gtin', rec.gtin, null::uuid), ('upc', rec.upc, null), ('ean', rec.ean, null), ('mpn', rec.mpn, null),
                   ('asin', rec.asin, rec.retailer_id), ('retailer_sku', rec.retailer_sku, rec.retailer_id)) k(kind, value, retailer_id)
     where k.value is not null
    on conflict on constraint product_identifiers_unique do nothing;
  end if;
  return applied;
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- Matching + offers
-- ---------------------------------------------------------------------------------------------

-- API offers show the API price (D1: only an approved API may show Amazon prices). A feed or API
-- record for an existing manual offer (same variant and retailer, no external ref) adopts it
-- instead of creating a duplicate.
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

  if rec.external_ref is not null then
    update public.retailer_offers o set external_ref = rec.external_ref
     where o.variant_id = vid and o.retailer_id = rec.retailer_id and o.external_ref is null and o.price_source = 'manual'
       and not exists (select 1 from public.retailer_offers x
                        where x.variant_id = vid and x.retailer_id = rec.retailer_id and x.external_ref = rec.external_ref);
  end if;

  insert into public.retailer_offers as o (variant_id, retailer_id, source_id, external_ref, url, price_cents, shipping_cents,
                                           in_stock, available_sizes, status, price_source, price_display)
  values (vid, rec.retailer_id, (select source_id from public.ingestion_runs where id = rec.run_id), rec.external_ref,
          rec.url, rec.price_cents, coalesce(rec.shipping_cents, 0), coalesce(rec.in_stock, true),
          coalesce(rec.available_sizes, '{}'), 'active',
          case src when 'api' then 'api' when 'feed' then 'feed' else 'manual' end::public.price_source,
          case when src = 'api' then case when rec.price_cents is null then 'check_price' else 'show' end::public.price_display end)
  on conflict on constraint retailer_offers_unique do update set
    url = excluded.url, price_cents = excluded.price_cents, shipping_cents = excluded.shipping_cents,
    in_stock = excluded.in_stock, available_sizes = excluded.available_sizes, status = 'active',
    source_id = excluded.source_id, price_source = excluded.price_source,
    price_display = coalesce(excluded.price_display, (select r.price_display_default from public.retailers r where r.id = excluded.retailer_id)),
    last_checked_at = now()
  returning o.id, (o.xmax = 0) into oid, created;

  update public.raw_offer_records
     set match_status = 'matched', matched_variant_id = vid, offer_id = oid
   where id = raw_id;
  return jsonb_build_object('offer_id', oid, 'created', created);
end;
$$;

drop function public.ingest_offers(text, jsonb, boolean);

-- automated => true (scheduled sources): rows fail independently instead of rolling back the run;
-- items already waiting in (or rejected from) the review queue aren't queued again; items matched
-- once before keep that match; exact matches teach the catalog their other identifiers.
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
             set payload = rec, price_cents = price, last_seen_at = now()
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

revoke execute on function public.ingest_offers(text, jsonb, boolean, boolean) from public, anon;
grant execute on function public.ingest_offers(text, jsonb, boolean, boolean) to authenticated, service_role;
revoke execute on function public.learn_identifiers(uuid, uuid), public.product_identifiers_normalize() from public, anon, authenticated;

-- ---------------------------------------------------------------------------------------------
-- Amazon compliance: no stored price history for API prices; displayed API prices ≤ 60 minutes old
-- ---------------------------------------------------------------------------------------------

create or replace function public.retailer_offers_record_point()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- API prices (Amazon) may be cached for 24 hours at most, so they never become history.
  if new.price_source = 'api' then
    return null;
  end if;
  if tg_op = 'INSERT' or (new.price_cents, new.shipping_cents, new.in_stock, new.price_display, new.status)
       is distinct from (old.price_cents, old.shipping_cents, old.in_stock, old.price_display, old.status) then
    insert into public.price_points (offer_id, price_cents, shipping_cents, in_stock, price_display, active)
    values (new.id, new.price_cents, new.shipping_cents, new.in_stock, new.price_display, new.status = 'active');
  end if;
  return null;
end;
$$;

-- Same view, plus a read-time guard: an API price older than 60 minutes is shown as "Check price"
-- even if the freshness job hasn't run yet. Appends price_source for the app's "as of" line.
create or replace view public.variant_offer_ranking with (security_barrier = true) as
with live as (
  select o.*, r.slug as retailer_slug, r.name as retailer_name, r.kind as retailer_kind, v.product_id,
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
                            order by price_cents + shipping_cents - promo_discount_cents, in_stock desc, last_checked_at desc)
       end as rank,
       last_checked_at,
       price_source
  from priced;

comment on view public.variant_offer_ranking is
  'Best-price ranking (§4.3). Uses consumer-facing price data only; never reads affiliate_programs. API prices older than 60 minutes show as check_price.';

-- Offers past their source's freshness window: API prices stop showing; feed offers go inactive.
create or replace function public.enforce_offer_freshness()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  n integer := 0;
  c integer;
begin
  update public.retailer_offers o
     set price_display = 'check_price', price_cents = null
    from public.ingestion_sources s
   where s.id = o.source_id and s.kind = 'api' and s.max_age_minutes is not null
     and o.status = 'active' and o.price_source = 'api' and o.price_cents is not null
     and o.last_checked_at < now() - make_interval(mins => s.max_age_minutes);
  get diagnostics c = row_count;
  n := n + c;
  update public.retailer_offers o
     set status = 'inactive'
    from public.ingestion_sources s
   where s.id = o.source_id and s.kind = 'feed' and s.max_age_minutes is not null
     and o.status = 'active' and o.last_checked_at < now() - make_interval(mins => s.max_age_minutes);
  get diagnostics c = row_count;
  return n + c;
end;
$$;

-- Product Advertising Content may be cached for 24 hours at most.
create or replace function public.purge_api_payloads()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  n integer;
begin
  delete from public.raw_offer_records x
   using public.ingestion_runs ru, public.ingestion_sources s
   where ru.id = x.run_id and s.id = ru.source_id and s.kind = 'api' and x.created_at < now() - interval '24 hours';
  get diagnostics n = row_count;
  return n;
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- Scheduler: pg_cron → ingest edge function (claims due sources) → finish_ingestion_run
-- ---------------------------------------------------------------------------------------------

-- Marks due sources as running and returns them. A run stuck for 30 minutes can be reclaimed.
create or replace function public.claim_ingestion_runs(only_source text default null)
returns table (slug text, name text, kind text, retailer_slug text, config jsonb)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not (current_user in ('postgres', 'service_role')) then
    raise exception 'service only' using errcode = '42501';
  end if;
  return query
  with due as (
    select s.id from public.ingestion_sources s
     where s.is_active and s.kind in ('feed', 'api')
       and (s.slug = only_source or (only_source is null and s.interval_minutes is not null and coalesce(s.next_run_at, '-infinity') <= now()))
       and (s.running_since is null or s.running_since < now() - interval '30 minutes')
     for update skip locked
  )
  update public.ingestion_sources s
     set running_since = now(), last_started_at = now()
    from due
   where s.id = due.id
  returning s.slug::text, s.name, s.kind::text, (select r.slug::text from public.retailers r where r.id = s.retailer_id), s.config;
end;
$$;

-- Records the outcome. A successful complete-feed run deactivates this source's offers the feed no
-- longer lists, unless the feed looks truncated (fewer than half the offers it had).
create or replace function public.finish_ingestion_run(source_slug text, run uuid, ok boolean, message text default null, complete boolean default false)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  s           public.ingestion_sources;
  touched     integer := 0;
  active      integer := 0;
  deactivated integer := 0;
  note        text := nullif(btrim(message), '');
begin
  if not (current_user in ('postgres', 'service_role')) then
    raise exception 'service only' using errcode = '42501';
  end if;
  select * into s from public.ingestion_sources where slug = source_slug for update;
  if s.id is null then
    raise exception 'unknown source %', source_slug using errcode = '22023';
  end if;

  if ok and complete and run is not null then
    select count(distinct x.offer_id) into touched from public.raw_offer_records x where x.run_id = run and x.offer_id is not null;
    select count(*) into active from public.retailer_offers o where o.source_id = s.id and o.status = 'active';
    if touched >= ceil(active * 0.5) then
      update public.retailer_offers o set status = 'inactive'
       where o.source_id = s.id and o.status = 'active'
         and not exists (select 1 from public.raw_offer_records x where x.run_id = run and x.offer_id = o.id);
      get diagnostics deactivated = row_count;
    else
      note := concat_ws(' ', note, format('The feed listed %s of %s known offers, so nothing was deactivated.', touched, active));
    end if;
  end if;

  update public.ingestion_sources
     set running_since = null,
         last_finished_at = now(),
         last_success_at = case when ok then now() else last_success_at end,
         last_error = case when ok then note else coalesce(note, 'Run failed') end,
         consecutive_failures = case when ok then 0 else consecutive_failures + 1 end,
         -- Failures back off: interval × 2^(failures − 1), capped at a day.
         next_run_at = case when interval_minutes is null then null
                            when ok then now() + make_interval(mins => interval_minutes)
                            else now() + make_interval(mins => least(interval_minutes * (2 ^ least(consecutive_failures, 10))::int, 1440)) end
   where id = s.id;

  if run is not null then
    update public.ingestion_runs
       set report = report || jsonb_build_object('ok', ok, 'message', note, 'deactivated', deactivated, 'finished_at', now())
     where id = run;
  end if;
  return jsonb_build_object('deactivated', deactivated, 'touched', touched, 'active', active);
end;
$$;

-- Pokes the ingest function when a source is due (or for one named source).
create or replace function public.schedule_ingestion(only_source text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  url text := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url');
  key text := (select decrypted_secret from vault.decrypted_secrets where name = 'dispatch_key');
begin
  if url is null or key is null then
    return;
  end if;
  if only_source is not null or exists (
       select 1 from public.ingestion_sources s
        where s.is_active and s.kind in ('feed', 'api') and s.interval_minutes is not null
          and coalesce(s.next_run_at, '-infinity') <= now()
          and (s.running_since is null or s.running_since < now() - interval '30 minutes')) then
    perform net.http_post(url || '/functions/v1/ingest',
                          headers => jsonb_build_object('Authorization', 'Bearer ' || key, 'Content-Type', 'application/json'),
                          body => jsonb_build_object('source', only_source),
                          timeout_milliseconds => 5000);
  end if;
end;
$$;

-- Admin "Run now".
create or replace function public.request_ingestion_run(source_slug text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  s public.ingestion_sources;
begin
  if not public.is_staff() then
    raise exception 'staff only' using errcode = '42501';
  end if;
  select * into s from public.ingestion_sources where slug = source_slug;
  if s.id is null or s.kind not in ('feed', 'api') then
    raise exception 'Only feed and API sources run automatically.' using errcode = '22023';
  end if;
  if not s.is_active then
    raise exception 'Turn the source on first.' using errcode = '22023';
  end if;
  if s.running_since is not null and s.running_since > now() - interval '30 minutes' then
    raise exception 'A run is already in progress.' using errcode = '22023';
  end if;
  perform public.schedule_ingestion(source_slug);
  perform public.log_staff_action('integration.run', 'ingestion_source', s.id::text, null, jsonb_build_object('slug', s.slug));
end;
$$;

-- Health and freshness per source (admin Integrations page).
create or replace function public.staff_integrations()
returns table (slug text, name text, kind text, retailer_name text, is_active boolean, interval_minutes integer, max_age_minutes integer,
               config jsonb, next_run_at timestamptz, running_since timestamptz, last_started_at timestamptz, last_success_at timestamptz,
               last_error text, consecutive_failures integer, active_offers integer, priced_offers integer, stale_offers integer,
               last_run jsonb)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_staff() then
    raise exception 'staff only' using errcode = '42501';
  end if;
  return query
  select s.slug::text, s.name, s.kind::text, r.name, s.is_active, s.interval_minutes, s.max_age_minutes, s.config,
         s.next_run_at, s.running_since, s.last_started_at, s.last_success_at, s.last_error, s.consecutive_failures,
         (select count(*)::int from public.retailer_offers o where o.source_id = s.id and o.status = 'active'),
         (select count(*)::int from public.retailer_offers o where o.source_id = s.id and o.status = 'active' and o.price_cents is not null),
         (select count(*)::int from public.retailer_offers o
           where o.source_id = s.id and o.status = 'active' and s.max_age_minutes is not null
             and o.last_checked_at < now() - make_interval(mins => s.max_age_minutes)),
         (select jsonb_build_object('id', ru.id, 'created_at', ru.created_at, 'report', ru.report)
            from public.ingestion_runs ru where ru.source_id = s.id order by ru.created_at desc limit 1)
    from public.ingestion_sources s
    left join public.retailers r on r.id = coalesce(s.retailer_id, (select x.id from public.retailers x where x.slug = s.config ->> 'retailer_slug'))
   order by s.kind desc, s.name;
end;
$$;

-- Identifiers learned automatically (newest first), so staff can spot and forget bad ones.
create or replace function public.staff_learned_identifiers(max_rows integer default 50)
returns table (id uuid, kind text, value text, retailer_name text, product_name text, product_slug text, variant_label text,
               source text, created_at timestamptz)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_staff() then
    raise exception 'staff only' using errcode = '42501';
  end if;
  return query
  select i.id, i.kind::text, i.value, r.name, b.name || ' ' || p.name, p.slug::text, v.label, i.source, i.created_at
    from public.product_identifiers i
    join public.product_variants v on v.id = i.variant_id
    join public.products p on p.id = v.product_id
    join public.brands b on b.id = p.brand_id
    left join public.retailers r on r.id = i.retailer_id
   where i.source in ('learned', 'review')
   order by i.created_at desc
   limit least(greatest(max_rows, 1), 200);
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- Affiliate deeplinks: networks like AvantLink wrap the product URL in a click URL
-- ---------------------------------------------------------------------------------------------

alter table public.affiliate_programs
  alter column tag_template drop not null,
  -- e.g. https://www.avantlink.com/click.php?tt=cl&mi=10060&pw=123456&url={url} — {url} is the encoded product URL.
  add column link_template text check (link_template ~ '^https://[a-z0-9.-]+\.[a-z]{2,}/[^\s]*\{url\}[^\s]*$'),
  add constraint affiliate_programs_has_link check (tag_template is not null or link_template is not null);

create trigger affiliate_programs_audit after insert or update or delete on public.affiliate_programs
  for each row execute function public.log_staff_change();

-- ---------------------------------------------------------------------------------------------
-- Dashboard: failing integrations join the queues
-- ---------------------------------------------------------------------------------------------

create or replace function public.staff_queue_counts()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_staff() then
    raise exception 'staff only' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'unmatched_offers', (select count(*) from public.raw_offer_records where match_status = 'unmatched'),
    'custom_listings', (select count(*) from public.listing_catalog_reviews where decision = 'pending'),
    'open_reports', (select count(distinct (target_type, target_id)) from public.reports where status = 'open'),
    'oldest_report_at', (select min(created_at) from public.reports where status = 'open'),
    'promos_stale', (select count(*) from public.promo_codes p
                      where p.status = 'active' and (p.ends_at is null or p.ends_at > now())
                        and (p.verified_at is null or p.verified_at <= now() - interval '14 days')),
    'promos_due', (select count(*) from public.promo_codes p
                    where p.status = 'active' and (p.ends_at is null or p.ends_at > now())
                      and p.verified_at > now() - interval '14 days' and p.verified_at <= now() - interval '11 days'),
    'placements_ending', (select count(*) from public.placements pl
                           where pl.is_active and pl.ends_at > now() and pl.ends_at <= now() + interval '3 days'),
    'suspended_users', (select count(*) from public.user_suspensions where lifted_at is null),
    'integrations_failing', (select count(*) from public.ingestion_sources where is_active and consecutive_failures > 0));
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- Grants + cron
-- ---------------------------------------------------------------------------------------------

revoke execute on function public.enforce_offer_freshness(), public.purge_api_payloads(), public.schedule_ingestion(text),
  public.claim_ingestion_runs(text), public.finish_ingestion_run(text, uuid, boolean, text, boolean) from public, anon, authenticated;
grant execute on function public.claim_ingestion_runs(text), public.finish_ingestion_run(text, uuid, boolean, text, boolean) to service_role;
revoke execute on function public.request_ingestion_run(text), public.staff_integrations(), public.staff_learned_identifiers(integer) from public, anon;
grant execute on function public.request_ingestion_run(text), public.staff_integrations(), public.staff_learned_identifiers(integer) to authenticated;

select cron.schedule('schedule-ingestion', '*/5 * * * *', 'select public.schedule_ingestion()');
select cron.schedule('offer-freshness', '*/5 * * * *', 'select public.enforce_offer_freshness()');
select cron.schedule('purge-api-payloads', '17 * * * *', 'select public.purge_api_payloads()');
