-- Terms acceptance (App Store Review Guideline 1.2): before a first listing, message or offer, the app
-- asks the user to agree to the Terms of Use (https://pickledeals.app/terms). We record which version
-- (the effective date, e.g. '2026-10-07') and when, owner-only, in profiles_private.

alter table public.profiles_private
  add column terms_version     text check (terms_version ~ '^\d{4}-\d{2}-\d{2}$'),
  add column terms_accepted_at timestamptz;

grant select (terms_version, terms_accepted_at) on public.profiles_private to authenticated;

create or replace function public.accept_terms(version text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'sign in first' using errcode = '42501';
  end if;
  if version is null or version !~ '^\d{4}-\d{2}-\d{2}$' then
    raise exception 'invalid terms version' using errcode = '22023';
  end if;
  insert into public.profiles_private (user_id, terms_version, terms_accepted_at)
  values (auth.uid(), version, now())
  on conflict (user_id) do update set terms_version = excluded.terms_version, terms_accepted_at = excluded.terms_accepted_at;
end;
$$;

revoke execute on function public.accept_terms(text) from public, anon;
grant execute on function public.accept_terms(text) to authenticated;
