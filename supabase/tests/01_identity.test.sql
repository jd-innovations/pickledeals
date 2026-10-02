begin;
select plan(38);

-- Fixtures --------------------------------------------------------------------------------------

insert into auth.users (id, email)
values
  ('11111111-1111-1111-1111-111111111111', 'alice@example.test'),
  ('22222222-2222-2222-2222-222222222222', 'bob@example.test');

create function pg_temp.act_as(uid uuid, app_role text default 'user')
returns void language sql as $$
  select set_config(
    'request.jwt.claims',
    json_build_object('sub', uid, 'role', 'authenticated', 'app_role', app_role)::text,
    true
  );
  set local role authenticated;
$$;

-- Structure and RLS -----------------------------------------------------------------------------

select has_table('public', 'profiles', 'profiles exists');
select has_table('public', 'profiles_private', 'profiles_private exists');
select has_table('public', 'user_roles', 'user_roles exists');
select ok((select relrowsecurity from pg_class where oid = 'public.profiles'::regclass), 'RLS on profiles');
select ok((select relrowsecurity from pg_class where oid = 'public.profiles_private'::regclass), 'RLS on profiles_private');
select ok((select relrowsecurity from pg_class where oid = 'public.user_roles'::regclass), 'RLS on user_roles');

-- Bootstrap trigger -----------------------------------------------------------------------------

select is((select count(*)::int from public.profiles where id in
  ('11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222')), 2,
  'signup creates a profile per user');
select is((select count(*)::int from public.profiles_private where user_id in
  ('11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222')), 2,
  'signup creates a private profile per user');
select matches((select display_name from public.profiles where id = '11111111-1111-1111-1111-111111111111'),
  '^Player [1-9][0-9]{3}$', 'default display name is "Player NNNN"');
select is((select display_name_source::text from public.profiles where id = '11111111-1111-1111-1111-111111111111'),
  'generated', 'default display name is marked generated');
select is((select search_radius_m from public.profiles_private where user_id = '11111111-1111-1111-1111-111111111111'),
  40000, 'default search radius is 40 km');

-- Anonymous access ------------------------------------------------------------------------------

set local role anon;
select ok((select count(*) from public.profiles) >= 2, 'anon can read public profiles');
select throws_ok('select * from public.profiles_private', '42501', null, 'anon cannot read private profiles');
select throws_ok('select * from public.user_roles', '42501', null, 'anon cannot read roles');
select throws_ok($$update public.profiles set display_name = 'Hacker' where true$$, '42501', null,
  'anon cannot update profiles');
reset role;

-- Authenticated owner ---------------------------------------------------------------------------

select pg_temp.act_as('11111111-1111-1111-1111-111111111111');

select is((select count(*)::int from public.profiles_private), 1, 'user sees only their own private profile');
select is((select user_id from public.profiles_private),
  '11111111-1111-1111-1111-111111111111'::uuid, 'the visible private profile is their own');

select lives_ok($$update public.profiles set display_name = 'Alice B.' where id = '11111111-1111-1111-1111-111111111111'$$,
  'owner can rename themselves');
select lives_ok($$update public.profiles_private set search_radius_m = 25000 where user_id = '11111111-1111-1111-1111-111111111111'$$,
  'owner can change search radius');

select is_empty($$update public.profiles set display_name = 'Pwned' where id = '22222222-2222-2222-2222-222222222222' returning 1$$,
  'user cannot rename someone else');
select is_empty($$update public.profiles_private set search_radius_m = 1000 where user_id = '22222222-2222-2222-2222-222222222222' returning 1$$,
  'user cannot change someone else''s private profile');

select throws_ok($$update public.profiles set member_since = now() - interval '10 years' where id = '11111111-1111-1111-1111-111111111111'$$,
  '42501', null, 'member_since is not client-writable');
select throws_ok($$update public.profiles set display_name_source = 'provided' where id = '11111111-1111-1111-1111-111111111111'$$,
  '42501', null, 'display_name_source is not client-writable');
select throws_ok($$update public.profiles set area_label = 'Exact Street 1' where id = '11111111-1111-1111-1111-111111111111'$$,
  '42501', null, 'area_label is not client-writable');
select throws_ok($$insert into public.profiles (id, display_name) values (gen_random_uuid(), 'Ghost')$$,
  '42501', null, 'clients cannot insert profiles');
select throws_ok($$delete from public.profiles where id = '11111111-1111-1111-1111-111111111111'$$,
  '42501', null, 'clients cannot delete profiles');
select throws_ok($$update public.profiles set display_name = ' ' where id = '11111111-1111-1111-1111-111111111111'$$,
  '23514', null, 'blank display names are rejected');

select throws_ok('select * from public.user_roles', '42501', null, 'users cannot read roles');
select throws_ok($$insert into public.user_roles (user_id, role) values ('11111111-1111-1111-1111-111111111111', 'admin')$$,
  '42501', null, 'users cannot grant themselves a role');
select throws_ok($$select public.custom_access_token_hook('{"user_id":"11111111-1111-1111-1111-111111111111","claims":{}}')$$,
  '42501', null, 'users cannot execute the access token hook');
select ok(not public.is_admin(), 'is_admin() is false for a regular user');

reset role;

select is((select display_name_source::text from public.profiles where id = '11111111-1111-1111-1111-111111111111'),
  'provided', 'renaming marks the display name as provided');

-- Access token hook -----------------------------------------------------------------------------

insert into public.user_roles (user_id, role) values ('11111111-1111-1111-1111-111111111111', 'admin');

select ok(has_function_privilege('supabase_auth_admin', 'public.custom_access_token_hook(jsonb)', 'execute'),
  'Supabase Auth can execute the hook');
select ok(has_table_privilege('supabase_auth_admin', 'public.user_roles', 'select'),
  'Supabase Auth can read roles');
select is(
  public.custom_access_token_hook('{"user_id":"11111111-1111-1111-1111-111111111111","claims":{"role":"authenticated"}}') #>> '{claims,app_role}',
  'admin', 'hook sets app_role = admin for admins');
select is(
  public.custom_access_token_hook('{"user_id":"22222222-2222-2222-2222-222222222222","claims":{"role":"authenticated"}}') #>> '{claims,app_role}',
  'user', 'hook sets app_role = user for everyone else');

select pg_temp.act_as('11111111-1111-1111-1111-111111111111', 'admin');
select ok(public.is_admin(), 'is_admin() reads the app_role claim');
reset role;

-- Deletion cascades -----------------------------------------------------------------------------

delete from auth.users where id = '11111111-1111-1111-1111-111111111111';
select is(
  (select count(*)::int from public.profiles where id = '11111111-1111-1111-1111-111111111111')
  + (select count(*)::int from public.profiles_private where user_id = '11111111-1111-1111-1111-111111111111')
  + (select count(*)::int from public.user_roles where user_id = '11111111-1111-1111-1111-111111111111'),
  0, 'deleting the auth user removes profile, private profile and roles');

select * from finish();
rollback;
