begin;
select plan(6);

insert into auth.users (id, email) values
  ('19191919-0000-0000-0000-000000000001', 'a@example.test'),
  ('19191919-0000-0000-0000-000000000002', 'b@example.test');

create function pg_temp.act_as(uid uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  set local role authenticated;
$$;

select pg_temp.act_as('19191919-0000-0000-0000-000000000001');
select lives_ok($$select public.accept_terms('2026-10-07')$$, 'a signed-in user accepts the terms');
select is((select terms_version from public.profiles_private where user_id = '19191919-0000-0000-0000-000000000001'), '2026-10-07',
  'the version is recorded');
select isnt((select terms_accepted_at from public.profiles_private where user_id = '19191919-0000-0000-0000-000000000001'), null,
  'with the time');
select throws_ok($$select public.accept_terms('latest')$$, '22023', null, 'only date versions');
select is_empty($$select 1 from public.profiles_private where user_id = '19191919-0000-0000-0000-000000000002'$$,
  'nobody else''s acceptance is visible');
reset role;

select pg_temp.act_as(null);
select set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
set local role anon;
select throws_ok($$select public.accept_terms('2026-10-07')$$, '42501', null, 'guests can''t');
reset role;

select * from finish();
rollback;
