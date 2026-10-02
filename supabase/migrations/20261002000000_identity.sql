-- Phase 1: identity. Public profiles, owner-only private profile data, staff roles and the
-- app_role JWT claim (ARCHITECTURE_PLAN §4.1, §5). Deferred under the scope guard:
-- home_area (Phase 6/7, with a snapping RPC per D2), notification columns (Phase 10),
-- user_blocks / reports (Phase 8).

-- ---------------------------------------------------------------------------------------------
-- Types
-- ---------------------------------------------------------------------------------------------

create type public.app_role as enum ('admin', 'editor');

-- 'generated' = auto-assigned "Player 1234"; 'provided' = chosen by the user (or taken from Apple).
-- Marketplace intents (list, message, offer) require 'provided'.
create type public.display_name_source as enum ('generated', 'provided');

-- ---------------------------------------------------------------------------------------------
-- profiles: public, safe columns only
-- ---------------------------------------------------------------------------------------------

create table public.profiles (
  id                  uuid primary key references auth.users (id) on delete cascade,
  display_name        text not null,
  display_name_source public.display_name_source not null default 'generated',
  avatar_path         text,
  area_label          text,
  member_since        timestamptz not null default now(),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  constraint profiles_display_name_length
    check (char_length(btrim(display_name)) between 2 and 40 and display_name = btrim(display_name)),
  constraint profiles_display_name_printable
    check (display_name !~ '[[:cntrl:]]')
);

comment on table public.profiles is
  'Public profile. Readable by everyone (D6). Created by trigger on auth.users; never insert from clients.';

alter table public.profiles enable row level security;

create policy "profiles are public"
  on public.profiles for select
  to anon, authenticated
  using (true);

create policy "owners update their profile"
  on public.profiles for update
  to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

-- Column privileges: clients may only change what the user controls. area_label is set by the
-- location RPC in a later phase; display_name_source by the trigger below.
revoke all on public.profiles from anon, authenticated;
grant select on public.profiles to anon, authenticated;
grant update (display_name, avatar_path) on public.profiles to authenticated;

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

-- Changing the name marks it as user-provided, which unlocks marketplace intents.
create or replace function public.mark_display_name_provided()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.display_name is distinct from old.display_name then
    new.display_name_source := 'provided';
  end if;
  return new;
end;
$$;

create trigger profiles_mark_display_name_provided
  before update of display_name on public.profiles
  for each row execute function public.mark_display_name_provided();

-- ---------------------------------------------------------------------------------------------
-- profiles_private: owner only
-- ---------------------------------------------------------------------------------------------

create table public.profiles_private (
  user_id         uuid primary key references auth.users (id) on delete cascade,
  search_radius_m integer not null default 40000
    constraint profiles_private_search_radius_range check (search_radius_m between 1000 and 160000),
  -- Seam only: appearance is device-local in V1 and is not synced.
  appearance      text constraint profiles_private_appearance_values
    check (appearance in ('system', 'light', 'dark')),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

comment on table public.profiles_private is
  'Owner-only profile settings. Never joined into public views.';

alter table public.profiles_private enable row level security;

create policy "owners read their private profile"
  on public.profiles_private for select
  to authenticated
  using ((select auth.uid()) = user_id);

create policy "owners update their private profile"
  on public.profiles_private for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

revoke all on public.profiles_private from anon, authenticated;
grant select on public.profiles_private to authenticated;
grant update (search_radius_m) on public.profiles_private to authenticated;

create trigger profiles_private_set_updated_at
  before update on public.profiles_private
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------------------------
-- Profile bootstrap
-- ---------------------------------------------------------------------------------------------

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, 'Player ' || (1000 + floor(random() * 9000))::int);

  insert into public.profiles_private (user_id)
  values (new.id);

  return new;
end;
$$;

revoke execute on function public.handle_new_user() from public, anon, authenticated;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------------------------
-- user_roles: staff roles, exposed only through the access token hook
-- ---------------------------------------------------------------------------------------------

create table public.user_roles (
  user_id    uuid not null references auth.users (id) on delete cascade,
  role       public.app_role not null,
  granted_at timestamptz not null default now(),
  granted_by uuid references auth.users (id) on delete set null,
  primary key (user_id, role)
);

comment on table public.user_roles is
  'Staff roles. No client access; read by custom_access_token_hook to set the app_role claim.';

alter table public.user_roles enable row level security;

revoke all on public.user_roles from anon, authenticated, public;
grant select on public.user_roles to supabase_auth_admin;

create policy "auth admin reads roles"
  on public.user_roles for select
  to supabase_auth_admin
  using (true);

-- ---------------------------------------------------------------------------------------------
-- Custom access token hook → app_role claim ('admin' | 'editor' | 'user')
-- ---------------------------------------------------------------------------------------------

create or replace function public.custom_access_token_hook(event jsonb)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  role_name text;
begin
  select ur.role::text
    into role_name
    from public.user_roles ur
   where ur.user_id = (event ->> 'user_id')::uuid
   order by (ur.role = 'admin') desc
   limit 1;

  return jsonb_set(
    event,
    '{claims,app_role}',
    to_jsonb(coalesce(role_name, 'user'))
  );
end;
$$;

grant usage on schema public to supabase_auth_admin;
grant execute on function public.custom_access_token_hook(jsonb) to supabase_auth_admin;
revoke execute on function public.custom_access_token_hook(jsonb) from public, anon, authenticated;

-- ---------------------------------------------------------------------------------------------
-- Role helpers for policies in later phases
-- ---------------------------------------------------------------------------------------------

create or replace function public.is_admin()
returns boolean
language sql
stable
set search_path = ''
as $$
  select coalesce(auth.jwt() ->> 'app_role', '') = 'admin';
$$;

create or replace function public.is_staff()
returns boolean
language sql
stable
set search_path = ''
as $$
  select coalesce(auth.jwt() ->> 'app_role', '') in ('admin', 'editor');
$$;
