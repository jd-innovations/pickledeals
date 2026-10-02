-- Phase 0 foundation: extensions and shared conventions only.
-- Domain tables arrive with their phases (see docs/ARCHITECTURE_PLAN.md §4). RLS is enabled in the
-- same migration that creates each table.

create extension if not exists postgis with schema extensions;   -- approximate listing locations (D2)
create extension if not exists pg_trgm with schema extensions;   -- fuzzy catalog search / matching

-- Shared updated_at trigger used by every mutable table.
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

comment on function public.set_updated_at() is
  'Attach as BEFORE UPDATE trigger on tables with an updated_at column.';
