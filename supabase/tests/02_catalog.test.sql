begin;
select plan(43);

-- Fixtures: a regular user and an editor (staff). The seed catalog is already loaded.
insert into auth.users (id, email) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'user@example.test'),
  ('aaaaaaaa-0000-0000-0000-000000000002', 'editor@example.test');

create function pg_temp.act_as(uid uuid, app_role text) returns void language sql as $$
  select set_config('request.jwt.claims',
    json_build_object('sub', uid, 'role', 'authenticated', 'app_role', app_role)::text, true);
  set local role authenticated;
$$;

-- Hidden fixtures (as owner): a draft product, an inactive brand, images in each state.
insert into public.brands (id, slug, name, is_active) values
  ('bbbbbbbb-0000-0000-0000-000000000001', 'hidden-brand', 'Hidden Brand', false);
insert into public.products (id, slug, name, brand_id, category_id, status)
select 'cccccccc-0000-0000-0000-000000000001', 'joola-secret-prototype', 'Secret Prototype', b.id, c.id, 'draft'
  from public.brands b, public.categories c where b.slug = 'joola' and c.slug = 'paddles';
insert into public.product_variants (product_id, label, is_default)
values ('cccccccc-0000-0000-0000-000000000001', '16mm', true);
insert into public.product_images (product_id, storage_path, source, source_url, status, rights_expires_at)
select p.id, x.path, 'brand_supplied', 'https://joola.com/media', x.status::public.image_status, x.expires
  from public.products p,
       (values ('products/a/active.webp', 'active', null::timestamptz),
               ('products/a/pending.webp', 'pending_review', null),
               ('products/a/expired.webp', 'active', now() - interval '1 day')) as x(path, status, expires)
 where p.slug = 'joola-perseus-pro-iv';

-- Structure ---------------------------------------------------------------------------------------

select ok((select bool_and(relrowsecurity) from pg_class where oid in (
  'public.brands'::regclass, 'public.categories'::regclass, 'public.products'::regclass,
  'public.product_aliases'::regclass, 'public.product_variants'::regclass,
  'public.product_identifiers'::regclass, 'public.product_images'::regclass)), 'RLS is on for every catalog table');
select is((select count(*)::int from public.products where status = 'active'), 144, 'seed loads 144 active products');
select is((select count(*)::int from public.categories), 12, 'seed loads 12 categories');
select is((select count(*)::int from public.products p
            where not exists (select 1 from public.product_variants v where v.product_id = p.id and v.is_default)), 0,
          'every product has a default variant');
select ok((select bool_and(public) from storage.buckets where id in ('catalog', 'brand-logos'))
          and (select count(*) from storage.buckets where id in ('catalog', 'brand-logos')) = 2, 'catalog buckets exist and are public');

-- Constraints -------------------------------------------------------------------------------------

select throws_ok($$insert into public.brands (slug, name) values ('Not A Slug', 'x')$$, '23514', null, 'slugs are validated');
select throws_ok($$insert into public.products (slug, name, brand_id, category_id, msrp_cents)
  select 'neg-price', 'x', b.id, c.id, -100 from public.brands b, public.categories c where b.slug = 'joola' and c.slug = 'paddles'$$,
  '23514', null, 'MSRP must be positive cents');
select throws_ok($$insert into public.product_images (product_id, storage_path, source)
  select id, 'products/x/no-provenance.webp', 'retailer_feed' from public.products where slug = 'joola-perseus-cfs'$$,
  '23514', null, 'D8: non-owned images need a source URL or licence note');
select lives_ok($$insert into public.product_images (product_id, storage_path, source)
  select id, 'products/x/owned.webp', 'owned' from public.products where slug = 'joola-perseus-cfs'$$,
  'owned images need no external provenance');

savepoint no_variant;
insert into public.products (slug, name, brand_id, category_id)
select 'no-variant', 'No Variant', b.id, c.id from public.brands b, public.categories c where b.slug = 'joola' and c.slug = 'paddles';
select throws_ok('set constraints all immediate', '23514', null, 'a product without variants is rejected at commit');
rollback to savepoint no_variant;

select throws_ok($$insert into public.product_variants (product_id, label, is_default)
  select id, 'Second default', true from public.products where slug = 'joola-perseus-cfs'$$,
  '23505', null, 'only one default variant per product');

-- Search document maintenance ---------------------------------------------------------------------

insert into public.product_aliases (product_id, alias)
select id, 'zzspecialalias' from public.products where slug = 'crbn-3x-power-series';
select ok((select search_text like '%zzspecialalias%' from public.products where slug = 'crbn-3x-power-series'),
  'adding an alias refreshes the search document');

-- Anonymous reads ---------------------------------------------------------------------------------

set local role anon;
select ok((select count(*) from public.products) >= 144, 'anon reads active products');
select is((select count(*)::int from public.products where slug = 'joola-secret-prototype'), 0, 'anon cannot see draft products');
select is((select count(*)::int from public.brands where slug = 'hidden-brand'), 0, 'anon cannot see inactive brands');
select is((select count(*)::int from public.product_variants where product_id = 'cccccccc-0000-0000-0000-000000000001'), 0,
  'anon cannot see variants of hidden products');
select is((select array_agg(storage_path order by storage_path) from public.product_images
            where storage_path like 'products/a/%'), array['products/a/active.webp'],
  'anon sees only active, unexpired images');
select throws_ok('select search_text from public.products limit 1', '42501', null, 'the search document is not client-readable');
select throws_ok('select * from public.product_identifiers', '42501', null, 'anon cannot read identifiers');
select throws_ok($$insert into public.brands (slug, name) values ('anon-brand', 'Anon')$$, '42501', null, 'anon cannot write the catalog');
select ok((select product_count from public.category_summaries where slug = 'paddles') >= 50, 'category summaries count products');
select ok((select product_count from public.brand_summaries where slug = 'joola') > 0, 'brand summaries count products');

-- search_catalog (anon) ---------------------------------------------------------------------------

select is((select jsonb_array_length(public.search_catalog('perseus') -> 'products')), 2, 'search "perseus" finds the two Perseus models');
select is((public.search_catalog('perseus') -> 'brands' -> 0 ->> 'slug'), 'joola', 'search groups the matching brand');
select is((public.search_catalog('perseus') -> 'categories' -> 0 ->> 'slug'), 'paddles', 'search groups the matching category');
select is((public.search_catalog('perseous') -> 'products' -> 0 -> 'brand' ->> 'slug'), 'joola', 'search tolerates typos');
select is((public.search_catalog('joola pers') ->> 'total_products')::int, 2, 'multi-word prefix search is precise');
select is((public.search_catalog('secret prototype') ->> 'total_products')::int, 0, 'search never returns draft products');
select is((public.search_catalog('x') ->> 'total_products')::int, 0, 'one-character queries return nothing');
select ok(not (public.search_catalog('perseus') -> 'products' -> 0 ? 'search_text'), 'search returns public fields only');
select throws_ok($$select public.import_catalog('{}'::jsonb)$$, '42501', null, 'anon cannot run the importer');
reset role;

-- Regular user ------------------------------------------------------------------------------------

select pg_temp.act_as('aaaaaaaa-0000-0000-0000-000000000001', 'user');
select throws_ok($$insert into public.brands (slug, name) values ('user-brand', 'User')$$, '42501', null, 'users cannot write the catalog');
select is_empty($$update public.products set name = 'Hacked' where slug = 'joola-perseus-cfs' returning 1$$, 'users cannot edit products');
select is((select count(*)::int from public.product_identifiers), 0, 'users see no identifiers');
select throws_ok($$select public.import_catalog('{}'::jsonb)$$, '42501', null, 'users cannot run the importer');
reset role;

-- Editor (staff) ----------------------------------------------------------------------------------

select pg_temp.act_as('aaaaaaaa-0000-0000-0000-000000000002', 'editor');
select is((select count(*)::int from public.products where slug = 'joola-secret-prototype'), 1, 'staff see draft products');
select lives_ok($$insert into public.brands (slug, name) values ('editor-brand', 'Editor Brand')$$, 'staff can create brands');

select is(
  public.import_catalog('{"products":[{"slug":"dry-run-paddle","name":"Dry Run","brand_slug":"joola","category_slug":"paddles","variants":[{"label":"16mm"}]}]}'::jsonb, true)
    #>> '{products,created}', '1', 'dry run reports what would be created');
select is((select count(*)::int from public.products where slug = 'dry-run-paddle'), 0, 'dry run writes nothing');

select is(
  public.import_catalog('{"products":[
     {"slug":"good-paddle","name":"Good","brand_slug":"joola","category_slug":"paddles","variants":[{"label":"16mm"}]},
     {"slug":"bad-paddle","name":"Bad","brand_slug":"no-such-brand","category_slug":"paddles","variants":[{"label":"16mm"}]}]}'::jsonb, false)
    -> 'errors' -> 0 ->> 'slug', 'bad-paddle', 'import reports the failing row');
select is((select count(*)::int from public.products where slug = 'good-paddle'), 0, 'any error rolls back the whole import');

select is(
  public.import_catalog('{"products":[{"slug":"good-paddle","name":"Good","brand_slug":"joola","category_slug":"paddles","aliases":["Goodie"],"variants":[{"label":"14mm"},{"label":"16mm","is_default":true}]}]}'::jsonb, false)
    ->> 'applied', 'true', 'a clean import applies');
reset role;

select is((select array_agg(label || ':' || is_default order by sort) from public.product_variants v
             join public.products p on p.id = v.product_id where p.slug = 'good-paddle'),
          array['14mm:false', '16mm:true'], 'imported variants keep order and the flagged default');

select * from finish();
rollback;
