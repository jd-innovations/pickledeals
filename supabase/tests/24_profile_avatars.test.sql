begin;
select plan(16);

insert into auth.users (id, email) values
  ('24242424-0000-0000-0000-000000000001', 'avatar-a@example.test'),
  ('24242424-0000-0000-0000-000000000002', 'avatar-b@example.test'),
  ('24242424-0000-0000-0000-000000000003', 'avatar-staff@example.test');
insert into public.user_roles (user_id, role) values ('24242424-0000-0000-0000-000000000003', 'editor');

create function pg_temp.act_as(uid uuid, app_role text default null) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated', 'app_role', app_role)::text, true);
  set local role authenticated;
$$;

-- Uploaded files (the app uploads through the Storage API; here they're inserted directly).
insert into storage.objects (bucket_id, name, owner) values
  ('avatars', '24242424-0000-0000-0000-000000000001/aaaaaaaa-0000-0000-0000-000000000001.jpg', '24242424-0000-0000-0000-000000000001'),
  ('avatars', '24242424-0000-0000-0000-000000000001/aaaaaaaa-0000-0000-0000-000000000002.jpg', '24242424-0000-0000-0000-000000000001'),
  ('avatars', '24242424-0000-0000-0000-000000000001/aaaaaaaa-0000-0000-0000-000000000003.jpg', '24242424-0000-0000-0000-000000000001'),
  ('avatars', '24242424-0000-0000-0000-000000000002/bbbbbbbb-0000-0000-0000-000000000001.jpg', '24242424-0000-0000-0000-000000000002');

select is((select public from storage.buckets where id = 'avatars'), true, 'profile photos are public to read');

select pg_temp.act_as('24242424-0000-0000-0000-000000000001');
select throws_ok($$update public.profiles set avatar_path = '24242424-0000-0000-0000-000000000002/bbbbbbbb-0000-0000-0000-000000000001.jpg' where id = auth.uid()$$,
  '42501', null, 'the photo field can’t be written directly');
select throws_ok($$select public.set_avatar('24242424-0000-0000-0000-000000000002/bbbbbbbb-0000-0000-0000-000000000001.jpg')$$,
  '42501', 'photo must be in your own folder', 'nobody can use someone else’s photo');
select throws_ok($$select public.set_avatar('24242424-0000-0000-0000-000000000001/cccccccc-0000-0000-0000-000000000009.jpg')$$,
  'P0002', 'photo not uploaded', 'the photo has to exist');
select is(public.set_avatar('24242424-0000-0000-0000-000000000001/aaaaaaaa-0000-0000-0000-000000000001.jpg', 'google'), null, 'a first photo has nothing to replace');
select is((select avatar_source from public.profiles where id = auth.uid()), 'google', 'a Google photo is recorded as one');
select is(public.set_avatar('24242424-0000-0000-0000-000000000001/aaaaaaaa-0000-0000-0000-000000000002.jpg'),
  '24242424-0000-0000-0000-000000000001/aaaaaaaa-0000-0000-0000-000000000001.jpg', 'an upload replaces it and returns the old file to delete');
select is(public.set_avatar('24242424-0000-0000-0000-000000000001/aaaaaaaa-0000-0000-0000-000000000003.jpg', 'google'),
  '24242424-0000-0000-0000-000000000001/aaaaaaaa-0000-0000-0000-000000000003.jpg', 'a Google photo never replaces a chosen one (its file is returned to delete)');
select is((select avatar_path from public.profiles where id = auth.uid()), '24242424-0000-0000-0000-000000000001/aaaaaaaa-0000-0000-0000-000000000002.jpg', 'the chosen photo stays');
select is(public.remove_avatar(), '24242424-0000-0000-0000-000000000001/aaaaaaaa-0000-0000-0000-000000000002.jpg', 'removing returns the file to delete');
select is((select avatar_auto_off from public.profiles_private where user_id = auth.uid()), true, 'removing turns automatic photos off');
select is(public.set_avatar('24242424-0000-0000-0000-000000000001/aaaaaaaa-0000-0000-0000-000000000001.jpg', 'google'),
  '24242424-0000-0000-0000-000000000001/aaaaaaaa-0000-0000-0000-000000000001.jpg', 'after removing, a Google photo isn’t applied again');
select is((select avatar_path from public.profiles where id = auth.uid()), null, 'and the profile stays without a photo');
select throws_ok($$select public.staff_remove_avatar('24242424-0000-0000-0000-000000000002', 'Offensive photo')$$, '42501', 'staff only', 'only staff remove other people’s photos');
reset role;

select pg_temp.act_as('24242424-0000-0000-0000-000000000002');
select public.set_avatar('24242424-0000-0000-0000-000000000002/bbbbbbbb-0000-0000-0000-000000000001.jpg');
reset role;
select pg_temp.act_as('24242424-0000-0000-0000-000000000003', 'editor');
select is(public.staff_remove_avatar('24242424-0000-0000-0000-000000000002', 'Offensive photo'), '24242424-0000-0000-0000-000000000002/bbbbbbbb-0000-0000-0000-000000000001.jpg',
  'staff remove a reported photo');
reset role;
select is((select action || ' ' || note from public.staff_actions where target_type = 'user' and target_id = '24242424-0000-0000-0000-000000000002'), 'user.remove_avatar Offensive photo',
  'and it’s in the audit log');

select * from finish();
rollback;
