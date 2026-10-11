-- Partner applications from the website's "Partner with PickleDeals" page (approved mockup:
-- preview/WebPartners.dc.html). Shopify stores only: the partner-apply edge function checks the
-- store before saving, applies the spam checks (hidden field, a few submissions per hour per visitor)
-- and emails the team. Rows are written by that function only (service role); staff read them and
-- move them through a status in the admin app. Every staff change is logged in staff_actions.

create table public.partner_inquiries (
  id               uuid primary key default gen_random_uuid(),
  company          text not null check (char_length(btrim(company)) between 1 and 120),
  contact_name     text not null check (char_length(btrim(contact_name)) between 1 and 120),
  email            text not null check (char_length(email) <= 200 and email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  -- The address they typed, as a bare lower-case host (courtgear.com).
  store_host       text not null check (store_host = lower(store_host) and store_host ~ '^[a-z0-9.-]+\.[a-z]{2,}$' and char_length(store_host) <= 253),
  -- From the store itself when the Shopify check succeeded (courtgear.myshopify.com, "CourtGear").
  myshopify_domain text check (myshopify_domain ~ '^[a-z0-9-]+\.myshopify\.com$'),
  shop_name        text check (char_length(shop_name) <= 200),
  interests        text[] not null default '{}' check (interests <@ array['store', 'promo_code', 'sponsored']::text[]),
  message          text check (char_length(message) <= 2000),
  status           text not null default 'new' check (status in ('new', 'contacted', 'connected', 'declined')),
  staff_note       text check (char_length(staff_note) <= 500),
  -- Salted hash of the visitor's IP, only for the per-hour limit; never shown.
  client_hash      text not null check (char_length(client_hash) between 16 and 128),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index partner_inquiries_recent on public.partner_inquiries (created_at desc);
create index partner_inquiries_client on public.partner_inquiries (client_hash, created_at desc);

create trigger partner_inquiries_set_updated_at before update on public.partner_inquiries
  for each row execute function public.set_updated_at();

-- Staff move an application along (new → contacted → connected / declined) with an optional note.
create or replace function public.staff_set_partner_status(inquiry uuid, new_status text, note text default null)
returns void
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
  if new_status not in ('new', 'contacted', 'connected', 'declined') then
    raise exception 'unknown status' using errcode = '22023';
  end if;
  select status into prev from public.partner_inquiries where id = inquiry for update;
  if not found then
    raise exception 'application not found' using errcode = 'P0002';
  end if;
  update public.partner_inquiries
     set status = new_status, staff_note = coalesce(left(nullif(btrim(note), ''), 500), staff_note)
   where id = inquiry;
  perform public.log_staff_action('partner.status', 'partner_inquiry', inquiry::text, note,
    jsonb_build_object('from', prev, 'to', new_status));
end;
$$;

revoke execute on function public.staff_set_partner_status(uuid, text, text) from public, anon;
grant execute on function public.staff_set_partner_status(uuid, text, text) to authenticated;

-- RLS: staff read; nobody writes through the API except the service role (edge function) and the RPC.
alter table public.partner_inquiries enable row level security;
revoke all on public.partner_inquiries from anon, authenticated, public;
grant select on public.partner_inquiries to authenticated;
create policy "staff read partner applications" on public.partner_inquiries for select to authenticated using ((select public.is_staff()));
