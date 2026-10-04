-- Fix: Phase 12 binds ASIN identifiers to the Amazon retailer (product_identifiers_normalize), so
-- import_catalog's "already belongs to another variant" check must look for the ASIN there, not
-- with a null retailer. Without this, adding an ASIN in the catalog import or product editor failed.

create or replace function public.import_catalog(payload jsonb, dry_run boolean default true)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  report  jsonb := jsonb_build_object(
    'brands', jsonb_build_object('created', 0, 'updated', 0),
    'categories', jsonb_build_object('created', 0, 'updated', 0),
    'products', jsonb_build_object('created', 0, 'updated', 0),
    'variants', jsonb_build_object('created', 0, 'updated', 0));
  errors  jsonb := '[]'::jsonb;
  rec     jsonb;
  v       jsonb;
  ident   jsonb;
  inserted boolean;
  pid     uuid;
  vid     uuid;
  has_default boolean;
  idx     integer;
begin
  if not (current_user in ('postgres', 'service_role') or public.is_staff()) then
    raise exception 'import_catalog requires an admin or editor' using errcode = '42501';
  end if;

  begin
    -- Brands
    for rec in select * from jsonb_array_elements(coalesce(payload -> 'brands', '[]')) loop
      begin
        insert into public.brands (slug, name, website_url, is_active)
        values (rec ->> 'slug', rec ->> 'name', nullif(rec ->> 'website_url', ''), coalesce((rec ->> 'is_active')::boolean, true))
        on conflict (slug) do update
          set name = excluded.name, website_url = excluded.website_url, is_active = excluded.is_active
        returning (xmax = 0) into inserted;
        report := jsonb_set(report, array['brands', case when inserted then 'created' else 'updated' end],
                            to_jsonb((report #>> array['brands', case when inserted then 'created' else 'updated' end])::int + 1));
      exception when others then
        errors := errors || jsonb_build_object('entity', 'brand', 'slug', rec ->> 'slug', 'message', sqlerrm);
      end;
    end loop;

    -- Categories (parents must precede children in the payload)
    for rec in select * from jsonb_array_elements(coalesce(payload -> 'categories', '[]')) loop
      begin
        insert into public.categories (slug, name, parent_id, sort, variant_axes, is_active)
        values (rec ->> 'slug', rec ->> 'name',
                (select id from public.categories where slug = nullif(rec ->> 'parent_slug', '')),
                coalesce((rec ->> 'sort')::int, 0),
                coalesce((select array_agg(x) from jsonb_array_elements_text(rec -> 'variant_axes') x), '{}'),
                coalesce((rec ->> 'is_active')::boolean, true))
        on conflict (slug) do update
          set name = excluded.name, parent_id = excluded.parent_id, sort = excluded.sort,
              variant_axes = excluded.variant_axes, is_active = excluded.is_active
        returning (xmax = 0) into inserted;
        if nullif(rec ->> 'parent_slug', '') is not null
           and not exists (select 1 from public.categories where slug = rec ->> 'parent_slug') then
          raise exception 'unknown parent category "%"', rec ->> 'parent_slug';
        end if;
        report := jsonb_set(report, array['categories', case when inserted then 'created' else 'updated' end],
                            to_jsonb((report #>> array['categories', case when inserted then 'created' else 'updated' end])::int + 1));
      exception when others then
        errors := errors || jsonb_build_object('entity', 'category', 'slug', rec ->> 'slug', 'message', sqlerrm);
      end;
    end loop;

    -- Products
    for rec in select * from jsonb_array_elements(coalesce(payload -> 'products', '[]')) loop
      begin
        if jsonb_array_length(coalesce(rec -> 'variants', '[]')) = 0 then
          raise exception 'a product needs at least one variant';
        end if;
        if not exists (select 1 from public.brands where slug = rec ->> 'brand_slug') then
          raise exception 'unknown brand "%"', rec ->> 'brand_slug';
        end if;
        if not exists (select 1 from public.categories where slug = rec ->> 'category_slug') then
          raise exception 'unknown category "%"', rec ->> 'category_slug';
        end if;

        -- (xmax-based detection needs table-level SELECT, which clients don't have on products.)
        inserted := not exists (select 1 from public.products where slug = rec ->> 'slug');
        insert into public.products (slug, name, brand_id, category_id, model_year, msrp_cents, specs, status)
        values (
          rec ->> 'slug', rec ->> 'name',
          (select id from public.brands where slug = rec ->> 'brand_slug'),
          (select id from public.categories where slug = rec ->> 'category_slug'),
          nullif(rec ->> 'model_year', '')::smallint,
          nullif(rec ->> 'msrp_cents', '')::int,
          coalesce(rec -> 'specs', '{}'),
          coalesce(nullif(rec ->> 'status', ''), 'active')::public.product_status)
        on conflict (slug) do update
          set name = excluded.name, brand_id = excluded.brand_id, category_id = excluded.category_id,
              model_year = excluded.model_year, msrp_cents = excluded.msrp_cents, specs = excluded.specs,
              status = excluded.status
        returning id into pid;
        report := jsonb_set(report, array['products', case when inserted then 'created' else 'updated' end],
                            to_jsonb((report #>> array['products', case when inserted then 'created' else 'updated' end])::int + 1));

        -- Aliases: the payload is the complete set.
        delete from public.product_aliases
         where product_id = pid
           and alias not in (select lower(btrim(a)) from jsonb_array_elements_text(coalesce(rec -> 'aliases', '[]')) a);
        insert into public.product_aliases (product_id, alias)
        select pid, lower(btrim(a)) from jsonb_array_elements_text(coalesce(rec -> 'aliases', '[]')) a
        on conflict do nothing;

        -- Variants: upsert by label; exactly one default (the first flagged, else the first listed).
        update public.product_variants set is_default = false where product_id = pid and is_default;
        has_default := exists (select 1 from jsonb_array_elements(rec -> 'variants') x where (x ->> 'is_default')::boolean);
        idx := 0;
        for v in select * from jsonb_array_elements(rec -> 'variants') loop
          insert into public.product_variants (product_id, label, attributes, msrp_cents, is_default, sort)
          values (pid, v ->> 'label', coalesce(v -> 'attributes', '{}'), nullif(v ->> 'msrp_cents', '')::int,
                  case when has_default then coalesce((v ->> 'is_default')::boolean, false) else idx = 0 end, idx)
          on conflict (product_id, label) do update
            set attributes = excluded.attributes, msrp_cents = excluded.msrp_cents,
                is_default = excluded.is_default, sort = excluded.sort
          returning id, (xmax = 0) into vid, inserted;
          report := jsonb_set(report, array['variants', case when inserted then 'created' else 'updated' end],
                              to_jsonb((report #>> array['variants', case when inserted then 'created' else 'updated' end])::int + 1));

          for ident in select * from jsonb_array_elements(coalesce(v -> 'identifiers', '[]')) loop
            insert into public.product_identifiers (variant_id, kind, value)
            values (vid, (ident ->> 'kind')::public.identifier_kind, btrim(ident ->> 'value'))
            on conflict on constraint product_identifiers_unique do nothing;
            if not exists (select 1 from public.product_identifiers
                            where kind = (ident ->> 'kind')::public.identifier_kind
                              and value = btrim(ident ->> 'value') and variant_id = vid
                              -- ASINs are bound to the Amazon retailer by product_identifiers_normalize (Phase 12).
                              and retailer_id is not distinct from (case when ident ->> 'kind' = 'asin'
                                then (select r.id from public.retailers r where r.slug = 'amazon') end)) then
              raise exception '% % already belongs to another variant', ident ->> 'kind', ident ->> 'value';
            end if;
          end loop;
          idx := idx + 1;
        end loop;
      exception when others then
        errors := errors || jsonb_build_object('entity', 'product', 'slug', rec ->> 'slug', 'message', sqlerrm);
      end;
    end loop;

    if dry_run or jsonb_array_length(errors) > 0 then
      raise exception using errcode = 'P0D01', message = 'rollback';
    end if;
  exception when sqlstate 'P0D01' then
    -- Dry run or errors: every write in this block is rolled back.
    null;
  end;

  return report || jsonb_build_object(
    'dry_run', dry_run,
    'applied', not dry_run and jsonb_array_length(errors) = 0,
    'errors', errors);
end;
$$;
