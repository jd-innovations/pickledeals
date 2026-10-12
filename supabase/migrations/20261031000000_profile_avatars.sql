-- Profile photos (owner decisions Oct 11: optional, initials when missing, pulled from Google
-- automatically). `profiles.avatar_path` has existed since Phase 1 as an unused seam; this makes it real.
--   avatars/{uid}/{uuid}.jpg   public read; each person writes only their own folder; staff can delete
--   set_avatar(path, source)   points the profile at a photo the caller uploaded (returns the old path
--                              so the app deletes that file)
--   remove_avatar()            clears it and remembers the choice, so a Google photo isn't pulled again
--   staff_remove_avatar(...)   moderation (guideline 1.2): clears it and logs to staff_actions
-- Photos are square, at most 512 px and re-encoded to JPEG on the phone (EXIF and GPS stripped).

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', true, 2097152, array['image/jpeg'])
on conflict (id) do nothing;

create policy "people upload their own profile photo" on storage.objects for insert
  to authenticated with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "people replace their own profile photo" on storage.objects for update
  to authenticated using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "people and staff delete profile photos" on storage.objects for delete
  to authenticated using (bucket_id = 'avatars' and ((storage.foldername(name))[1] = (select auth.uid())::text or (select public.is_staff())));
create policy "people list their own profile photos" on storage.objects for select
  to authenticated using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);

-- Only paths in the owner's own folder; set through set_avatar, never written directly any more.
update public.profiles set avatar_path = null where avatar_path is not null and avatar_path !~ ('^' || id::text || '/[0-9a-f-]{36}\.jpg$');
alter table public.profiles add constraint profiles_avatar_path_own
  check (avatar_path is null or avatar_path ~ ('^' || id::text || '/[0-9a-f-]{36}\.jpg$'));
revoke update (avatar_path) on public.profiles from authenticated;

-- Where the photo came from, and whether the owner turned automatic photos off.
alter table public.profiles add column avatar_source text check (avatar_source in ('upload', 'google'));
alter table public.profiles_private add column avatar_auto_off boolean not null default false;
grant select (avatar_auto_off) on public.profiles_private to authenticated;

create or replace function public.set_avatar(path text, source text default 'upload')
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  me   uuid := auth.uid();
  prev text;
begin
  if me is null then
    raise exception 'sign in required' using errcode = '42501';
  end if;
  if source not in ('upload', 'google') then
    raise exception 'unknown source' using errcode = '22023';
  end if;
  if path !~ ('^' || me::text || '/[0-9a-f-]{36}\.jpg$') then
    raise exception 'photo must be in your own folder' using errcode = '42501';
  end if;
  if not exists (select 1 from storage.objects o where o.bucket_id = 'avatars' and o.name = path) then
    raise exception 'photo not uploaded' using errcode = 'P0002';
  end if;
  -- A Google photo never replaces one the person chose, and never comes back after they removed one.
  if source = 'google' and (
       exists (select 1 from public.profiles p where p.id = me and p.avatar_path is not null)
       or exists (select 1 from public.profiles_private pp where pp.user_id = me and pp.avatar_auto_off)) then
    return path;  -- the caller deletes the unused upload
  end if;
  select avatar_path into prev from public.profiles where id = me for update;
  update public.profiles set avatar_path = path, avatar_source = source, updated_at = now() where id = me;
  return prev;
end;
$$;

create or replace function public.remove_avatar()
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  me   uuid := auth.uid();
  prev text;
begin
  if me is null then
    raise exception 'sign in required' using errcode = '42501';
  end if;
  select avatar_path into prev from public.profiles where id = me for update;
  update public.profiles set avatar_path = null, avatar_source = null, updated_at = now() where id = me;
  update public.profiles_private set avatar_auto_off = true, updated_at = now() where user_id = me;
  return prev;
end;
$$;

create or replace function public.staff_remove_avatar(target uuid, reason text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  prev text;
begin
  if not public.is_staff() then
    raise exception 'staff only' using errcode = '42501';
  end if;
  if char_length(btrim(coalesce(reason, ''))) < 3 then
    raise exception 'give a reason' using errcode = '22023';
  end if;
  select avatar_path into prev from public.profiles where id = target for update;
  if not found then
    raise exception 'user not found' using errcode = 'P0002';
  end if;
  update public.profiles set avatar_path = null, avatar_source = null, updated_at = now() where id = target;
  update public.profiles_private set avatar_auto_off = true, updated_at = now() where user_id = target;
  perform public.log_staff_action('user.remove_avatar', 'user', target::text, reason, jsonb_build_object('path', prev));
  return prev;
end;
$$;

revoke execute on function public.set_avatar(text, text), public.remove_avatar(), public.staff_remove_avatar(uuid, text) from public, anon;
grant execute on function public.set_avatar(text, text), public.remove_avatar(), public.staff_remove_avatar(uuid, text) to authenticated;
