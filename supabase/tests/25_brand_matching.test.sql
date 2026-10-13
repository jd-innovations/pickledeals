begin;
select plan(10);

create function pg_temp.as_anon() returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
  set local role anon;
$$;

insert into auth.users (id, email) values ('25252525-0000-0000-0000-000000000001', 'brands@example.test');

create function pg_temp.custom_listing(brand text) returns uuid language sql as $$
  insert into public.listings (seller_id, category_id, custom_title, custom_brand_text, condition, price_cents, status, published_at)
  values ('25252525-0000-0000-0000-000000000001', (select id from public.categories where slug = 'paddles'),
          'Test paddle', brand, 'good', 5000, 'active', now())
  returning id;
$$;

-- Typed brands are tagged as the catalog brand when the letters and digits match.
create temp table t as select
  pg_temp.custom_listing('selkirk') as lower_case,
  pg_temp.custom_listing('Six-Zero') as punctuated,
  pg_temp.custom_listing('Waves') as unknown;

select is((select b.slug::text from public.listings l join public.brands b on b.id = l.brand_id where l.id = (select lower_case from t)),
          'selkirk', 'a lower-case typed brand is tagged as the catalog brand');
select is((select b.slug::text from public.listings l join public.brands b on b.id = l.brand_id where l.id = (select punctuated from t)),
          'six-zero', 'punctuation and spaces don''t matter');
select is((select brand_id from public.listings where id = (select unknown from t)), null, 'a brand not in the catalog stays untagged');

update public.listings set custom_brand_text = 'k swiss' where id = (select unknown from t);
select is((select b.slug::text from public.listings l join public.brands b on b.id = l.brand_id where l.id = (select unknown from t)),
          'k-swiss', 'editing the typed brand tags it too');
update public.listings set custom_brand_text = 'Waves', brand_id = null where id = (select unknown from t);

-- The brand filter: tagged listings match; untagged ones match a brand added to the catalog later.
select ok((select lower_case from t) in (select public.market_match(brand_slugs => array['selkirk'])),
          'the Selkirk filter finds the typed "selkirk" listing');
select ok((select unknown from t) not in (select public.market_match(brand_slugs => array['selkirk'])),
          'other brands don''t match');
select ok((select unknown from t) in (select public.market_match()), 'untagged listings show with no brand filter');

update public.listings set custom_brand_text = 'Wave-s' where id = (select unknown from t);
insert into public.brands (slug, name) values ('waves', 'Waves');
select ok((select unknown from t) in (select public.market_match(brand_slugs => array['waves'])),
          'a brand added later matches untagged listings by their typed text');

-- Counts per brand for the filter sheet, open to guests.
select pg_temp.as_anon();
select ok((select listings from public.market_brand_counts() where slug = 'selkirk') >= 1, 'guests get active listing counts per brand');
select throws_ok('select public.brand_for_text(''x'')', '42501', null, 'the matching helpers aren''t part of the public API');
reset role;
select * from finish();
rollback;
