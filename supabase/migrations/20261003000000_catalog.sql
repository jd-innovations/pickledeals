-- Phase 2: canonical catalog (ARCHITECTURE_PLAN §4.2, D3, D8). The catalog is the hub every offer,
-- deal, alert and listing resolves to. Public read for visible rows (D6); writes are staff-only
-- (is_staff(): admin or editor) or service role. Retail tables (retailers, offers) arrive in Phase 3.

-- ---------------------------------------------------------------------------------------------
-- Types
-- ---------------------------------------------------------------------------------------------

create type public.product_status as enum ('draft', 'active', 'discontinued');
create type public.image_source as enum ('brand_supplied', 'manufacturer_site', 'retailer_feed', 'affiliate_feed', 'owned');
create type public.image_status as enum ('active', 'pending_review', 'removed');
create type public.identifier_kind as enum ('gtin', 'upc', 'ean', 'asin', 'mpn', 'retailer_sku');

-- Shared slug rule: lowercase words joined by single hyphens.
create domain public.slug as text
  check (value ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(value) <= 80);

-- ---------------------------------------------------------------------------------------------
-- brands
-- ---------------------------------------------------------------------------------------------

create table public.brands (
  id          uuid primary key default gen_random_uuid(),
  slug        public.slug not null unique,
  name        text not null check (char_length(btrim(name)) between 1 and 60),
  logo_path   text,
  website_url text check (website_url ~ '^https://'),
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index brands_name_trgm on public.brands using gin (name extensions.gin_trgm_ops);

create trigger brands_set_updated_at before update on public.brands
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------------------------
-- categories (tree; variant_axes declares which attributes create variants)
-- ---------------------------------------------------------------------------------------------

create table public.categories (
  id           uuid primary key default gen_random_uuid(),
  slug         public.slug not null unique,
  name         text not null check (char_length(btrim(name)) between 1 and 60),
  parent_id    uuid references public.categories (id) on delete restrict,
  sort         integer not null default 0,
  variant_axes text[] not null default '{}',
  is_active    boolean not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  constraint categories_not_own_parent check (parent_id is distinct from id)
);

create index categories_parent on public.categories (parent_id);

create trigger categories_set_updated_at before update on public.categories
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------------------------
-- products (one row per model) + search document
-- ---------------------------------------------------------------------------------------------

create table public.products (
  id          uuid primary key default gen_random_uuid(),
  brand_id    uuid not null references public.brands (id) on delete restrict,
  category_id uuid not null references public.categories (id) on delete restrict,
  slug        public.slug not null unique,
  name        text not null check (char_length(btrim(name)) between 1 and 120),
  model_year  smallint check (model_year between 2000 and 2100),
  msrp_cents  integer check (msrp_cents > 0),
  specs       jsonb not null default '{}' check (jsonb_typeof(specs) = 'object'),
  status      public.product_status not null default 'draft',
  -- Maintained by trigger: brand name + product name + aliases. Never written by clients.
  search_text text not null default '',
  search      tsvector not null default ''::tsvector,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

comment on column public.products.msrp_cents is 'Manufacturer list price in cents. Integer money only.';

create index products_brand on public.products (brand_id);
create index products_category_status on public.products (category_id, status);
create index products_search on public.products using gin (search);
create index products_search_trgm on public.products using gin (search_text extensions.gin_trgm_ops);

create trigger products_set_updated_at before update on public.products
  for each row execute function public.set_updated_at();

create table public.product_aliases (
  id         uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products (id) on delete cascade,
  alias      text not null check (char_length(btrim(alias)) between 2 and 80),
  created_at timestamptz not null default now(),
  unique (product_id, alias)
);

create index product_aliases_trgm on public.product_aliases using gin (alias extensions.gin_trgm_ops);

-- Rebuilds a product's search document from its brand, name, aliases, category and variant labels.
create or replace function public.products_build_search()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  brand_name    text;
  category_name text;
  aliases       text;
  variants      text;
begin
  select b.name into brand_name from public.brands b where b.id = new.brand_id;
  select c.name into category_name from public.categories c where c.id = new.category_id;
  select coalesce(string_agg(a.alias, ' '), '') into aliases
    from public.product_aliases a where a.product_id = new.id;
  select coalesce(string_agg(v.label, ' '), '') into variants
    from public.product_variants v where v.product_id = new.id;

  new.search_text := lower(btrim(concat_ws(' ', brand_name, new.name, aliases, category_name, variants)));
  new.search :=
    setweight(to_tsvector('simple', coalesce(new.name, '')), 'A') ||
    setweight(to_tsvector('simple', coalesce(brand_name, '')), 'B') ||
    setweight(to_tsvector('simple', aliases), 'C') ||
    setweight(to_tsvector('simple', coalesce(category_name, '') || ' ' || variants), 'D');
  return new;
end;
$$;

create trigger products_build_search
  before insert or update of name, brand_id, category_id, search_text on public.products
  for each row execute function public.products_build_search();

-- Alias, variant, brand-name and category-name changes refresh the affected search documents.
create or replace function public.touch_product_search()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_table_name in ('product_aliases', 'product_variants') then
    if tg_op in ('INSERT', 'UPDATE') then
      update public.products set search_text = search_text where id = new.product_id;
    end if;
    if tg_op in ('UPDATE', 'DELETE') then
      update public.products set search_text = search_text where id = old.product_id;
    end if;
  elsif tg_table_name = 'brands' and new.name is distinct from old.name then
    update public.products set search_text = search_text where brand_id = new.id;
  elsif tg_table_name = 'categories' and new.name is distinct from old.name then
    update public.products set search_text = search_text where category_id = new.id;
  end if;
  return null;
end;
$$;

revoke execute on function public.touch_product_search() from public, anon, authenticated;

create trigger product_aliases_touch_search
  after insert or update or delete on public.product_aliases
  for each row execute function public.touch_product_search();

create trigger brands_touch_search
  after update of name on public.brands
  for each row execute function public.touch_product_search();

create trigger categories_touch_search
  after update of name on public.categories
  for each row execute function public.touch_product_search();

-- ---------------------------------------------------------------------------------------------
-- product_variants — every product has ≥ 1; offers bind to variants (Phase 3)
-- ---------------------------------------------------------------------------------------------

create table public.product_variants (
  id         uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products (id) on delete cascade,
  label      text not null check (char_length(btrim(label)) between 1 and 60),
  attributes jsonb not null default '{}' check (jsonb_typeof(attributes) = 'object'),
  msrp_cents integer check (msrp_cents > 0),
  is_default boolean not null default false,
  sort       integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (product_id, label)
);

create unique index product_variants_one_default on public.product_variants (product_id) where is_default;

create trigger product_variants_set_updated_at before update on public.product_variants
  for each row execute function public.set_updated_at();

create trigger product_variants_touch_search
  after insert or update of label or delete on public.product_variants
  for each row execute function public.touch_product_search();

-- Checked at commit, so a product and its variants can be created in one transaction.
create or replace function public.assert_product_has_variant()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  pid uuid;
begin
  if tg_table_name = 'products' then
    pid := new.id;
  else
    pid := old.product_id;
  end if;
  if exists (select 1 from public.products where id = pid)
     and not exists (select 1 from public.product_variants where product_id = pid) then
    raise exception 'product % must have at least one variant', pid using errcode = '23514';
  end if;
  return null;
end;
$$;

create constraint trigger products_require_variant
  after insert on public.products
  deferrable initially deferred
  for each row execute function public.assert_product_has_variant();

create constraint trigger product_variants_keep_one
  after delete on public.product_variants
  deferrable initially deferred
  for each row execute function public.assert_product_has_variant();

-- ---------------------------------------------------------------------------------------------
-- product_identifiers — ingestion matching keys (staff only)
-- ---------------------------------------------------------------------------------------------

create table public.product_identifiers (
  id          uuid primary key default gen_random_uuid(),
  variant_id  uuid not null references public.product_variants (id) on delete cascade,
  kind        public.identifier_kind not null,
  value       text not null check (char_length(btrim(value)) between 3 and 64),
  -- Phase 3 adds the foreign key to retailers; null = retailer-independent (GTIN/UPC/EAN/MPN).
  retailer_id uuid,
  created_at  timestamptz not null default now(),
  constraint product_identifiers_unique unique nulls not distinct (kind, value, retailer_id)
);

create index product_identifiers_variant on public.product_identifiers (variant_id);

-- ---------------------------------------------------------------------------------------------
-- product_images — D8 provenance is first-class; catalog images ≠ listing images
-- ---------------------------------------------------------------------------------------------

create table public.product_images (
  id                uuid primary key default gen_random_uuid(),
  product_id        uuid not null references public.products (id) on delete cascade,
  variant_id        uuid references public.product_variants (id) on delete set null,
  storage_path      text not null unique,
  sort              integer not null default 0,
  width             integer check (width > 0),
  height            integer check (height > 0),
  blurhash          text,
  is_cutout         boolean not null default false,
  source            public.image_source not null,
  source_url        text,
  license_note      text,
  rights_expires_at timestamptz,
  added_by          uuid references auth.users (id) on delete set null,
  status            public.image_status not null default 'pending_review',
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  constraint product_images_provenance check (source = 'owned' or source_url is not null or license_note is not null)
);

comment on constraint product_images_provenance on public.product_images is
  'D8: every non-owned image records where it came from or under what terms it is used.';

create index product_images_product on public.product_images (product_id, sort);

create trigger product_images_set_updated_at before update on public.product_images
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------------------------
-- Visibility helpers
-- ---------------------------------------------------------------------------------------------

-- Discontinued products stay visible: they still have a used market and price history.
create or replace function public.product_is_public(pid uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
      from public.products p
      join public.brands b on b.id = p.brand_id and b.is_active
      join public.categories c on c.id = p.category_id and c.is_active
     where p.id = pid and p.status in ('active', 'discontinued')
  );
$$;

-- ---------------------------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------------------------

alter table public.brands enable row level security;
alter table public.categories enable row level security;
alter table public.products enable row level security;
alter table public.product_aliases enable row level security;
alter table public.product_variants enable row level security;
alter table public.product_identifiers enable row level security;
alter table public.product_images enable row level security;

-- Public reads
create policy "active brands are public" on public.brands for select
  to anon, authenticated using (is_active or (select public.is_staff()));
create policy "active categories are public" on public.categories for select
  to anon, authenticated using (is_active or (select public.is_staff()));
create policy "visible products are public" on public.products for select
  to anon, authenticated using (public.product_is_public(id) or (select public.is_staff()));
create policy "aliases of visible products are public" on public.product_aliases for select
  to anon, authenticated using (public.product_is_public(product_id) or (select public.is_staff()));
create policy "variants of visible products are public" on public.product_variants for select
  to anon, authenticated using (public.product_is_public(product_id) or (select public.is_staff()));
create policy "licensed images of visible products are public" on public.product_images for select
  to anon, authenticated using (
    (status = 'active' and (rights_expires_at is null or rights_expires_at > now()) and public.product_is_public(product_id))
    or (select public.is_staff())
  );
create policy "staff read identifiers" on public.product_identifiers for select
  to authenticated using ((select public.is_staff()));

-- Staff writes (one policy per table and operation)
do $$
declare
  t text;
begin
  foreach t in array array['brands', 'categories', 'products', 'product_aliases', 'product_variants', 'product_identifiers', 'product_images'] loop
    execute format('create policy "staff insert %1$s" on public.%1$I for insert to authenticated with check ((select public.is_staff()))', t);
    execute format('create policy "staff update %1$s" on public.%1$I for update to authenticated using ((select public.is_staff())) with check ((select public.is_staff()))', t);
    execute format('create policy "staff delete %1$s" on public.%1$I for delete to authenticated using ((select public.is_staff()))', t);
  end loop;
end;
$$;

-- Privileges. Row visibility is RLS; columns: the maintained search document is internal (search
-- goes through search_catalog). Image provenance is licensing metadata and readable with the row.
revoke all on public.brands, public.categories, public.products, public.product_aliases,
  public.product_variants, public.product_identifiers, public.product_images from anon, authenticated;

grant select on public.brands, public.categories, public.product_aliases, public.product_variants,
  public.product_images to anon, authenticated;
grant select (id, brand_id, category_id, slug, name, model_year, msrp_cents, specs, status, created_at, updated_at)
  on public.products to anon, authenticated;
grant select on public.product_identifiers to authenticated;  -- RLS: staff only

grant insert, update, delete on public.brands, public.categories, public.product_aliases,
  public.product_variants, public.product_identifiers, public.product_images to authenticated;
grant insert (brand_id, category_id, slug, name, model_year, msrp_cents, specs, status),
  update (brand_id, category_id, slug, name, model_year, msrp_cents, specs, status),
  delete on public.products to authenticated;

-- ---------------------------------------------------------------------------------------------
-- Storage: catalog images and brand logos (public read, staff write)
-- ---------------------------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('catalog', 'catalog', true, 10485760, array['image/webp', 'image/png', 'image/jpeg']),
  ('brand-logos', 'brand-logos', true, 2097152, array['image/svg+xml', 'image/png', 'image/webp'])
on conflict (id) do nothing;

create policy "staff list catalog media" on storage.objects for select
  to authenticated using (bucket_id in ('catalog', 'brand-logos') and (select public.is_staff()));
create policy "staff upload catalog media" on storage.objects for insert
  to authenticated with check (bucket_id in ('catalog', 'brand-logos') and (select public.is_staff()));
create policy "staff update catalog media" on storage.objects for update
  to authenticated using (bucket_id in ('catalog', 'brand-logos') and (select public.is_staff()));
create policy "staff delete catalog media" on storage.objects for delete
  to authenticated using (bucket_id in ('catalog', 'brand-logos') and (select public.is_staff()));

-- ---------------------------------------------------------------------------------------------
-- Browse summaries (security_invoker: counts respect the caller's RLS)
-- ---------------------------------------------------------------------------------------------

create view public.category_summaries with (security_invoker = true) as
select c.id, c.slug, c.name, c.parent_id, c.sort,
       count(p.id) filter (where p.status = 'active')::int as product_count
  from public.categories c
  left join public.products p on p.category_id = c.id
 where c.is_active
 group by c.id;

create view public.brand_summaries with (security_invoker = true) as
select b.id, b.slug, b.name, b.logo_path,
       count(p.id) filter (where p.status = 'active')::int as product_count
  from public.brands b
  left join public.products p on p.brand_id = b.id
 where b.is_active
 group by b.id;

grant select on public.category_summaries, public.brand_summaries to anon, authenticated;
