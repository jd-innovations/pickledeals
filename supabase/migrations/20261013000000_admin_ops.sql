-- Phase 11: admin and deal operations (§13). Operations run without SQL:
--   staff_actions        audit log of every staff write (RPCs log explicitly; table edits via trigger)
--   listing moderation   staff_listings search, takedown/restore with a reason the seller sees
--   user_suspensions     admins suspend repeat offenders; suspended users can't sell, message or offer
--   review queues        reopen rejected raw offers; promote a custom listing into a draft product (D3)
--   promos               verified_by is recorded whenever a code is verified
--   metrics              queue sizes for staff, daily operating numbers for admins
-- D2: nothing here returns a location beyond the public area label.

-- ---------------------------------------------------------------------------------------------
-- staff_actions — append-only audit log (staff read; written by definer code only)
-- ---------------------------------------------------------------------------------------------

create table public.staff_actions (
  id          bigint generated always as identity primary key,
  actor_id    uuid references auth.users (id) on delete set null,
  action      text not null check (char_length(action) between 3 and 40),
  target_type text not null check (char_length(target_type) between 3 and 40),
  target_id   text not null,
  note        text check (char_length(note) <= 500),
  data        jsonb not null default '{}',
  created_at  timestamptz not null default now()
);

create index staff_actions_recent on public.staff_actions (created_at desc);
create index staff_actions_target on public.staff_actions (target_type, target_id, created_at desc);

alter table public.staff_actions enable row level security;
revoke all on public.staff_actions from anon, authenticated, public;
grant select on public.staff_actions to authenticated;
create policy "staff read the audit log" on public.staff_actions for select to authenticated using ((select public.is_staff()));

create or replace function public.log_staff_action(action text, target_type text, target_id text, note text default null, data jsonb default '{}')
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.staff_actions (actor_id, action, target_type, target_id, note, data)
  values (auth.uid(), action, target_type, target_id, left(nullif(btrim(note), ''), 500), coalesce(data, '{}'));
$$;

-- Staff edit some tables directly (RLS: staff only); this records who changed what.
create or replace function public.log_staff_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  rec     jsonb := case tg_op when 'DELETE' then to_jsonb(old) else to_jsonb(new) end;
  changed jsonb;
begin
  if not public.is_staff() then
    return null;
  end if;
  if tg_op = 'UPDATE' then
    select coalesce(jsonb_object_agg(n.key, n.value), '{}') into changed
      from jsonb_each(to_jsonb(new)) n
     where n.key not in ('updated_at', 'search', 'search_text') and n.value is distinct from (to_jsonb(old) -> n.key);
    if changed = '{}' then
      return null;
    end if;
  end if;
  insert into public.staff_actions (actor_id, action, target_type, target_id, data)
  values (auth.uid(), lower(tg_op), tg_table_name, coalesce(rec ->> 'id', rec ->> 'term', '?'),
          case tg_op when 'UPDATE' then changed else rec - 'search' - 'search_text' end);
  return null;
end;
$$;

do $$
declare
  t text;
begin
  foreach t in array array['promo_codes', 'promo_code_targets', 'collections', 'collection_items', 'placements', 'prohibited_terms'] loop
    execute format('create trigger %1$s_audit after insert or update or delete on public.%1$I for each row execute function public.log_staff_change()', t);
  end loop;
end;
$$;

create trigger raw_offer_records_audit after update of match_status on public.raw_offer_records
  for each row execute function public.log_staff_change();
create trigger listing_catalog_reviews_audit after update of decision on public.listing_catalog_reviews
  for each row execute function public.log_staff_change();

-- Recent staff actions with the actor's name, newest first.
create or replace function public.staff_activity(for_type text default null, for_id text default null, max_rows integer default 50)
returns table (id bigint, actor_name text, action text, target_type text, target_id text, note text, data jsonb, created_at timestamptz)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_staff() then
    raise exception 'staff only' using errcode = '42501';
  end if;
  return query
  select a.id, coalesce(p.display_name, 'System'), a.action, a.target_type, a.target_id, a.note, a.data, a.created_at
    from public.staff_actions a
    left join public.profiles p on p.id = a.actor_id
   where (for_type is null or a.target_type = for_type)
     and (for_id is null or a.target_id = for_id)
   order by a.created_at desc, a.id desc
   limit least(greatest(max_rows, 1), 200);
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- Listing moderation
-- ---------------------------------------------------------------------------------------------

alter table public.listings
  add column removed_by_staff boolean not null default false,
  add column removed_at timestamptz;

update public.listings set removed_at = updated_at where status = 'removed';

-- Removal bookkeeping for every path (seller, staff, report): leaving 'removed' clears it.
create or replace function public.listings_track_removal()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status = 'removed' and old.status <> 'removed' then
    new.removed_at := now();
  elsif new.status <> 'removed' then
    new.removed_at := null;
    new.removed_by_staff := false;
    new.removed_reason := null;
  end if;
  return new;
end;
$$;

create trigger listings_track_removal before update of status on public.listings
  for each row execute function public.listings_track_removal();

-- Status now changes only through RPCs, staff included (so every takedown is logged and the seller told).
revoke update (status, removed_reason) on public.listings from authenticated;
-- The seller sees why staff removed their listing (removed rows are visible to the owner and staff only).
grant select (removed_reason, removed_by_staff) on public.listings to anon, authenticated;

create or replace function public.listing_label(lid uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select concat_ws(' ', coalesce(b.name, l.custom_brand_text), coalesce(p.name, l.custom_title))
    from public.listings l
    left join public.products p on p.id = l.product_id
    left join public.brands b on b.id = coalesce(p.brand_id, l.brand_id)
   where l.id = lid;
$$;

-- Internal: takes a listing down, leaves a line in its threads and (optionally) tells the seller.
create or replace function public.takedown_listing(lid uuid, reason text, tell_seller boolean default true)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  l public.listings;
begin
  select * into l from public.listings where id = lid for update;
  if l.id is null or l.status in ('draft', 'removed') then
    return false;
  end if;
  update public.listings set status = 'removed', removed_reason = left(btrim(reason), 300), removed_by_staff = true where id = lid;
  insert into public.messages (conversation_id, sender_id, kind, body, meta)
  select c.id, null, 'status_event', 'PickleDeals removed this listing', jsonb_build_object('status', 'removed', 'actor_id', null, 'by', 'staff')
    from public.conversations c
   where c.listing_id = lid and c.last_message_id is not null;
  if tell_seller then
    perform public.notify(l.seller_id, 'system', 'Your listing was removed', format('%s: %s', public.listing_label(lid), btrim(reason)),
      '/market/listing/' || lid, format('takedown:%s:%s', lid, extract(epoch from now())::bigint), jsonb_build_object('listing_id', lid));
  end if;
  return true;
end;
$$;

-- Internal: undoes a staff takedown (never a seller's own removal). The listing goes back to active.
create or replace function public.restore_listing(lid uuid, tell_seller boolean default true)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  l public.listings;
begin
  select * into l from public.listings where id = lid for update;
  if l.id is null or l.status <> 'removed' or not l.removed_by_staff then
    return false;
  end if;
  update public.listings set status = 'active' where id = lid;
  insert into public.messages (conversation_id, sender_id, kind, body, meta)
  select c.id, null, 'status_event', 'PickleDeals restored this listing', jsonb_build_object('status', 'active', 'actor_id', null, 'by', 'staff')
    from public.conversations c
   where c.listing_id = lid and c.last_message_id is not null;
  if tell_seller then
    perform public.notify(l.seller_id, 'system', 'Your listing is back', format('%s is live in the marketplace again.', public.listing_label(lid)),
      '/market/listing/' || lid, format('restore:%s:%s', lid, extract(epoch from now())::bigint), jsonb_build_object('listing_id', lid));
  end if;
  return true;
end;
$$;

create or replace function public.staff_set_listing_status(listing uuid, action text, reason text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_staff() then
    raise exception 'staff only' using errcode = '42501';
  end if;
  if action = 'remove' then
    if char_length(btrim(coalesce(reason, ''))) < 3 then
      raise exception 'Give a reason. The seller sees it.' using errcode = '22023';
    end if;
    if not public.takedown_listing(listing, reason) then
      raise exception 'This listing can’t be removed (it’s a draft or already removed).' using errcode = '22023';
    end if;
  elsif action = 'restore' then
    if not public.restore_listing(listing) then
      raise exception 'Only listings removed by staff can be restored.' using errcode = '22023';
    end if;
  else
    raise exception 'action must be remove or restore' using errcode = '22023';
  end if;
  perform public.log_staff_action('listing.' || action, 'listing', listing::text, reason);
end;
$$;

-- Reports now take listings down through the same path (logged, seller told).
create or replace function public.resolve_report(report uuid, decision text, note text default null, remove_listing boolean default false)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  r public.reports;
begin
  if not public.is_staff() then
    raise exception 'staff only' using errcode = '42501';
  end if;
  if decision not in ('actioned', 'dismissed') then
    raise exception 'unknown decision' using errcode = '22023';
  end if;
  select * into r from public.reports where id = report;
  if r.id is null then
    raise exception 'report not found' using errcode = '22023';
  end if;
  update public.reports
     set status = decision::public.report_status, resolution_note = nullif(btrim(note), ''), resolved_by = auth.uid(), resolved_at = now()
   where target_type = r.target_type and target_id = r.target_id and status = 'open';
  if remove_listing and r.target_type = 'listing' then
    perform public.takedown_listing(r.target_id, coalesce(nullif(btrim(note), ''), 'Removed after a report'));
  end if;
  perform public.log_staff_action('report.' || decision, 'report', r.id::text, note,
    jsonb_build_object('target_type', r.target_type, 'target_id', r.target_id, 'remove_listing', remove_listing));
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- user_suspensions — admins only; at most one active suspension per user
-- ---------------------------------------------------------------------------------------------

create table public.user_suspensions (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null references auth.users (id) on delete cascade,
  reason             text not null check (char_length(btrim(reason)) between 3 and 500),
  -- Listings hidden by this suspension, restored when it's lifted (if still removed for that reason).
  hidden_listing_ids uuid[] not null default '{}',
  created_by         uuid references auth.users (id) on delete set null,
  created_at         timestamptz not null default now(),
  lifted_at          timestamptz,
  lifted_by          uuid references auth.users (id) on delete set null
);

create unique index user_suspensions_one_active on public.user_suspensions (user_id) where lifted_at is null;

alter table public.user_suspensions enable row level security;
revoke all on public.user_suspensions from anon, authenticated, public;
grant select on public.user_suspensions to authenticated;
create policy "staff read suspensions" on public.user_suspensions for select to authenticated using ((select public.is_staff()));
create policy "users read their own suspension" on public.user_suspensions for select to authenticated using ((select auth.uid()) = user_id);

create or replace function public.is_suspended(uid uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.user_suspensions s where s.user_id = uid and s.lifted_at is null);
$$;

-- Blocks the signed-in user's own actions while suspended. Staff and server jobs are never blocked,
-- and sellers can still mark things sold or remove them.
create or replace function public.guard_suspended()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is not null and not public.is_staff() and public.is_suspended(auth.uid()) then
    raise exception 'Your account is suspended. Contact PickleDeals support if you think this is a mistake.'
      using errcode = '42501', hint = 'suspended';
  end if;
  return new;
end;
$$;

create trigger listings_guard_suspended_insert before insert on public.listings
  for each row execute function public.guard_suspended();
create trigger listings_guard_suspended_update before update on public.listings
  for each row when (new.status in ('draft', 'active', 'pending')) execute function public.guard_suspended();
create trigger conversations_guard_suspended before insert on public.conversations
  for each row execute function public.guard_suspended();
create trigger messages_guard_suspended before insert on public.messages
  for each row when (new.kind in ('text', 'image', 'location_share')) execute function public.guard_suspended();
create trigger marketplace_offers_guard_suspended_insert before insert on public.marketplace_offers
  for each row execute function public.guard_suspended();
create trigger marketplace_offers_guard_suspended_accept before update on public.marketplace_offers
  for each row when (new.status = 'accepted' and old.status <> 'accepted') execute function public.guard_suspended();

create or replace function public.staff_suspend_user(target uuid, reason text, hide_listings boolean default true)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  hidden uuid[] := '{}';
  lid    uuid;
  sid    uuid;
begin
  if not public.is_admin() then
    raise exception 'admins only' using errcode = '42501';
  end if;
  if not exists (select 1 from auth.users where id = target) then
    raise exception 'user not found' using errcode = '22023';
  end if;
  if target = auth.uid() or exists (select 1 from public.user_roles where user_id = target) then
    raise exception 'Staff accounts can’t be suspended.' using errcode = '22023';
  end if;
  if public.is_suspended(target) then
    raise exception 'This account is already suspended.' using errcode = '22023';
  end if;
  if char_length(btrim(coalesce(reason, ''))) < 3 then
    raise exception 'Give a reason.' using errcode = '22023';
  end if;
  if hide_listings then
    for lid in select id from public.listings where seller_id = target and status in ('active', 'pending') loop
      if public.takedown_listing(lid, 'Seller account suspended', false) then
        hidden := hidden || lid;
      end if;
    end loop;
  end if;
  insert into public.user_suspensions (user_id, reason, hidden_listing_ids, created_by)
  values (target, btrim(reason), hidden, auth.uid())
  returning id into sid;
  perform public.notify(target, 'system', 'Your account is suspended',
    'You can’t list, message or make offers right now. Contact PickleDeals support if you think this is a mistake.',
    '/profile', 'suspended:' || sid, '{}');
  perform public.log_staff_action('user.suspend', 'user', target::text, reason, jsonb_build_object('hidden_listings', cardinality(hidden)));
  return cardinality(hidden);
end;
$$;

create or replace function public.staff_unsuspend_user(target uuid, restore_listings boolean default true)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  s        public.user_suspensions;
  lid      uuid;
  restored integer := 0;
begin
  if not public.is_admin() then
    raise exception 'admins only' using errcode = '42501';
  end if;
  update public.user_suspensions set lifted_at = now(), lifted_by = auth.uid()
   where user_id = target and lifted_at is null
  returning * into s;
  if s.id is null then
    raise exception 'This account isn’t suspended.' using errcode = '22023';
  end if;
  if restore_listings then
    for lid in select l.id from public.listings l
                where l.id = any (s.hidden_listing_ids) and l.status = 'removed' and l.removed_by_staff
                  and l.removed_reason = 'Seller account suspended' loop
      if public.restore_listing(lid, false) then
        restored := restored + 1;
      end if;
    end loop;
  end if;
  perform public.notify(target, 'system', 'Your account is active again', 'You can list, message and make offers again.',
    '/profile', 'unsuspended:' || s.id, '{}');
  perform public.log_staff_action('user.unsuspend', 'user', target::text, null, jsonb_build_object('restored_listings', restored));
  return restored;
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- Staff search: listings and users
-- ---------------------------------------------------------------------------------------------

create or replace function public.staff_listings(q text default null, with_status text default null, by_seller uuid default null,
                                                 max_rows integer default 50, skip integer default 0)
returns table (id uuid, title text, condition text, price_cents integer, status text, seller_id uuid, seller_name text,
               seller_suspended boolean, area_label text, image_path text, published_at timestamptz, created_at timestamptz,
               removed_reason text, removed_by_staff boolean, removed_at timestamptz, open_reports integer, total_reports integer,
               total bigint)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  term text := nullif(btrim(q), '');
begin
  if not public.is_staff() then
    raise exception 'staff only' using errcode = '42501';
  end if;
  return query
  with base as (
    select l.*, public.listing_label(l.id) as label, pr.display_name
      from public.listings l
      join public.profiles pr on pr.id = l.seller_id
     where (with_status is null or l.status::text = with_status)
       and (by_seller is null or l.seller_id = by_seller)
  )
  select b.id, b.label, b.condition::text, b.price_cents, b.status::text, b.seller_id, b.display_name,
         public.is_suspended(b.seller_id),
         (select ll.area_label from public.listing_locations ll where ll.listing_id = b.id),
         (select i.storage_path from public.listing_images i where i.listing_id = b.id order by i.sort limit 1),
         b.published_at, b.created_at, b.removed_reason, b.removed_by_staff, b.removed_at,
         (select count(*)::int from public.reports r where r.target_type = 'listing' and r.target_id = b.id and r.status = 'open'),
         (select count(*)::int from public.reports r where r.target_type = 'listing' and r.target_id = b.id),
         count(*) over ()
    from base b
   where term is null or b.id::text = term or b.label ilike '%' || term || '%' or b.display_name ilike '%' || term || '%'
   order by coalesce(b.published_at, b.created_at) desc
   limit least(greatest(max_rows, 1), 100) offset greatest(skip, 0);
end;
$$;

-- Emails are shown to (and searchable by) admins only.
create or replace function public.staff_users(q text default null, only_suspended boolean default false,
                                              max_rows integer default 50, skip integer default 0)
returns table (id uuid, display_name text, email text, joined_at timestamptz, last_sign_in_at timestamptz, role text,
               suspended boolean, suspension_reason text, suspended_at timestamptz, active_listings integer, total_listings integer,
               open_reports integer, filed_reports integer, blocked_by integer, total bigint)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  term  text := nullif(btrim(q), '');
  admin boolean := public.is_admin();
begin
  if not public.is_staff() then
    raise exception 'staff only' using errcode = '42501';
  end if;
  return query
  select u.id, p.display_name, case when admin then u.email::text end, u.created_at, u.last_sign_in_at,
         (select min(r.role::text) from public.user_roles r where r.user_id = u.id),
         s.id is not null, s.reason, s.created_at,
         (select count(*)::int from public.listings l where l.seller_id = u.id and l.status in ('active', 'pending')),
         (select count(*)::int from public.listings l where l.seller_id = u.id and l.status <> 'draft'),
         (select count(*)::int from public.reports r
           where r.status = 'open'
             and ((r.target_type = 'user' and r.target_id = u.id)
               or (r.target_type = 'listing' and exists (select 1 from public.listings l where l.id = r.target_id and l.seller_id = u.id)))),
         (select count(*)::int from public.reports r where r.reporter_id = u.id),
         (select count(*)::int from public.user_blocks b where b.blocked_id = u.id),
         count(*) over ()
    from auth.users u
    join public.profiles p on p.id = u.id
    left join public.user_suspensions s on s.user_id = u.id and s.lifted_at is null
   where (not only_suspended or s.id is not null)
     and (term is null or u.id::text = term or p.display_name ilike '%' || term || '%' or (admin and u.email ilike '%' || term || '%'))
   order by u.created_at desc
   limit least(greatest(max_rows, 1), 100) offset greatest(skip, 0);
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- Review queues
-- ---------------------------------------------------------------------------------------------

-- A rejected import record goes back into the queue.
create or replace function public.reopen_raw_offer(raw_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_staff() then
    raise exception 'staff only' using errcode = '42501';
  end if;
  update public.raw_offer_records set match_status = 'unmatched', resolved_at = null, resolved_by = null
   where id = raw_id and match_status = 'rejected';
  if not found then
    raise exception 'Only rejected records can be reopened.' using errcode = '22023';
  end if;
end;
$$;

-- D3: promote a custom listing into a new draft product. The listing links to it once staff
-- publish the product (status → active), so it never points at an unpublished product.
create or replace function public.promote_listing_review(review uuid, brand uuid, name text, variant_label text default 'Standard')
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  r    public.listing_catalog_reviews;
  l    public.listings;
  base text;
  new_slug text;
  n    integer := 1;
  pid  uuid;
begin
  if not public.is_staff() then
    raise exception 'staff only' using errcode = '42501';
  end if;
  select * into r from public.listing_catalog_reviews where id = review and decision = 'pending' for update;
  if r.id is null then
    raise exception 'review not found or already resolved' using errcode = 'P0002';
  end if;
  select * into l from public.listings where id = r.listing_id;
  if char_length(btrim(coalesce(name, ''))) < 2 then
    raise exception 'Give the product a name.' using errcode = '22023';
  end if;
  base := left(trim(both '-' from regexp_replace(lower(
            (select b.slug from public.brands b where b.id = brand) || '-' || btrim(name)), '[^a-z0-9]+', '-', 'g')), 70);
  if base is null then
    raise exception 'choose a brand' using errcode = '22023';
  end if;
  new_slug := base;
  while exists (select 1 from public.products p where p.slug = new_slug) loop
    n := n + 1;
    new_slug := base || '-' || n;
  end loop;
  insert into public.products (brand_id, category_id, slug, name, status)
  values (brand, l.category_id, new_slug, btrim(name), 'draft')
  returning id into pid;
  insert into public.product_variants (product_id, label, is_default) values (pid, coalesce(nullif(btrim(variant_label), ''), 'Standard'), true);
  update public.listing_catalog_reviews
     set decision = 'promoted', suggested_product_id = pid, reviewed_by = auth.uid(), reviewed_at = now()
   where id = review;
  perform public.log_staff_action('listing_review.promote', 'product', pid::text, null, jsonb_build_object('listing_id', l.id, 'slug', new_slug));
  return new_slug;
end;
$$;

create or replace function public.products_link_promoted_listings()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.listings l
     set product_id = new.id,
         variant_id = (select v.id from public.product_variants v where v.product_id = new.id order by v.is_default desc, v.sort limit 1)
    from public.listing_catalog_reviews r
   where r.suggested_product_id = new.id and r.decision = 'promoted' and l.id = r.listing_id and l.product_id is null;
  return null;
end;
$$;

create trigger products_link_promoted_listings after update of status on public.products
  for each row when (new.status = 'active' and old.status <> 'active') execute function public.products_link_promoted_listings();

-- ---------------------------------------------------------------------------------------------
-- Promo verification: who verified a code, recorded on every verification
-- ---------------------------------------------------------------------------------------------

alter table public.promo_codes add column verified_by uuid references auth.users (id) on delete set null;

create or replace function public.promo_codes_track_verification()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.verified_at is not null and (tg_op = 'INSERT' or new.verified_at is distinct from old.verified_at) then
    new.verified_by := auth.uid();
  elsif new.verified_at is null then
    new.verified_by := null;
  end if;
  return new;
end;
$$;

create trigger promo_codes_track_verification before insert or update of verified_at on public.promo_codes
  for each row execute function public.promo_codes_track_verification();

-- ---------------------------------------------------------------------------------------------
-- Metrics
-- ---------------------------------------------------------------------------------------------

-- What's waiting for staff right now (Dashboard; every staff member).
create or replace function public.staff_queue_counts()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_staff() then
    raise exception 'staff only' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'unmatched_offers', (select count(*) from public.raw_offer_records where match_status = 'unmatched'),
    'custom_listings', (select count(*) from public.listing_catalog_reviews where decision = 'pending'),
    'open_reports', (select count(distinct (target_type, target_id)) from public.reports where status = 'open'),
    'oldest_report_at', (select min(created_at) from public.reports where status = 'open'),
    -- Hidden now (never verified or past 14 days), or hidden within 3 days.
    'promos_stale', (select count(*) from public.promo_codes p
                      where p.status = 'active' and (p.ends_at is null or p.ends_at > now())
                        and (p.verified_at is null or p.verified_at <= now() - interval '14 days')),
    'promos_due', (select count(*) from public.promo_codes p
                    where p.status = 'active' and (p.ends_at is null or p.ends_at > now())
                      and p.verified_at > now() - interval '14 days' and p.verified_at <= now() - interval '11 days'),
    'placements_ending', (select count(*) from public.placements pl
                           where pl.is_active and pl.ends_at > now() and pl.ends_at <= now() + interval '3 days'),
    'suspended_users', (select count(*) from public.user_suspensions where lifted_at is null));
end;
$$;

-- Daily operating numbers (UTC days) for admins.
create or replace function public.staff_metrics(days integer default 30)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  d     integer := least(greatest(days, 1), 180);
  since timestamptz := (current_date - (least(greatest(days, 1), 180) - 1))::timestamptz;
begin
  if not public.is_admin() then
    raise exception 'admins only' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'days', d,
    'since', since,
    'now', jsonb_build_object(
      'live_deals', (select count(*) from public.deal_feed),
      'active_listings', (select count(*) from public.listings where status in ('active', 'pending')),
      'users', (select count(*) from auth.users),
      'live_promos', (select count(*) from public.promo_codes p where public.promo_is_live(p))),
    'totals', jsonb_build_object(
      'clicks', (select count(*) from public.outbound_clicks where created_at >= since),
      'new_users', (select count(*) from auth.users where created_at >= since),
      'listings_published', (select count(*) from public.listings where published_at >= since),
      'listings_sold', (select count(*) from public.listings where sold_at >= since),
      'listings_removed_by_staff', (select count(*) from public.listings where removed_at >= since and removed_by_staff),
      'messages', (select count(*) from public.messages where created_at >= since and kind in ('text', 'image', 'location_share')),
      'offers', (select count(*) from public.marketplace_offers where created_at >= since),
      'reports_opened', (select count(*) from public.reports where created_at >= since),
      'reports_resolved', (select count(*) from public.reports where resolved_at >= since),
      'report_median_hours', (select round((percentile_cont(0.5) within group (order by extract(epoch from resolved_at - created_at)) / 3600)::numeric, 1)
                                from public.reports where resolved_at >= since)),
    'daily', (
      select jsonb_agg(jsonb_build_object(
               'day', s.day,
               'clicks', (select count(*) from public.outbound_clicks c where c.created_at >= s.day and c.created_at < s.day + 1),
               'new_users', (select count(*) from auth.users u where u.created_at >= s.day and u.created_at < s.day + 1),
               'listings_published', (select count(*) from public.listings l where l.published_at >= s.day and l.published_at < s.day + 1),
               'listings_sold', (select count(*) from public.listings l where l.sold_at >= s.day and l.sold_at < s.day + 1),
               'messages', (select count(*) from public.messages m where m.created_at >= s.day and m.created_at < s.day + 1
                              and m.kind in ('text', 'image', 'location_share')),
               'offers', (select count(*) from public.marketplace_offers o where o.created_at >= s.day and o.created_at < s.day + 1),
               'reports_opened', (select count(*) from public.reports r where r.created_at >= s.day and r.created_at < s.day + 1))
             order by s.day)
        from (select g::date as day from generate_series(since, current_date::timestamptz, interval '1 day') g) s),
    'clicks_by_retailer', coalesce((
      select jsonb_agg(jsonb_build_object('name', x.name, 'clicks', x.n) order by x.n desc)
        from (select coalesce(r.name, 'Unknown') as name, count(*) as n
                from public.outbound_clicks c
                left join public.retailer_offers o on o.id = c.offer_id
                left join public.retailers r on r.id = o.retailer_id
               where c.created_at >= since group by 1) x), '[]'),
    'clicks_by_placement', coalesce((
      select jsonb_agg(jsonb_build_object('placement', x.placement, 'clicks', x.n) order by x.n desc)
        from (select coalesce(c.placement, 'unknown') as placement, count(*) as n
                from public.outbound_clicks c where c.created_at >= since group by 1) x), '[]'),
    'top_products', coalesce((
      select jsonb_agg(jsonb_build_object('name', x.name, 'clicks', x.n) order by x.n desc)
        from (select b.name || ' ' || p.name as name, count(*) as n
                from public.outbound_clicks c
                join public.retailer_offers o on o.id = c.offer_id
                join public.product_variants v on v.id = o.variant_id
                join public.products p on p.id = v.product_id
                join public.brands b on b.id = p.brand_id
               where c.created_at >= since group by 1 order by 2 desc limit 10) x), '[]'),
    -- Sponsored placements: clicks on any offer of the promoted variant while the placement ran.
    'placements', coalesce((
      select jsonb_agg(jsonb_build_object('id', pl.id, 'clicks',
               (select count(*) from public.outbound_clicks c
                  join public.retailer_offers o on o.id = c.offer_id
                 where o.variant_id = dl.variant_id and c.created_at >= pl.starts_at and (pl.ends_at is null or c.created_at < pl.ends_at))))
        from public.placements pl
        join public.deals dl on dl.id = pl.deal_id), '[]'));
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------------------------

revoke execute on function public.log_staff_action(text, text, text, text, jsonb), public.log_staff_change(), public.listing_label(uuid),
  public.takedown_listing(uuid, text, boolean), public.restore_listing(uuid, boolean), public.is_suspended(uuid), public.guard_suspended(),
  public.listings_track_removal(), public.products_link_promoted_listings(), public.promo_codes_track_verification()
  from public, anon, authenticated;

revoke execute on function public.staff_activity(text, text, integer), public.staff_set_listing_status(uuid, text, text),
  public.staff_suspend_user(uuid, text, boolean), public.staff_unsuspend_user(uuid, boolean),
  public.staff_listings(text, text, uuid, integer, integer), public.staff_users(text, boolean, integer, integer),
  public.reopen_raw_offer(uuid), public.promote_listing_review(uuid, uuid, text, text),
  public.staff_queue_counts(), public.staff_metrics(integer) from public, anon;
grant execute on function public.staff_activity(text, text, integer), public.staff_set_listing_status(uuid, text, text),
  public.staff_suspend_user(uuid, text, boolean), public.staff_unsuspend_user(uuid, boolean),
  public.staff_listings(text, text, uuid, integer, integer), public.staff_users(text, boolean, integer, integer),
  public.reopen_raw_offer(uuid), public.promote_listing_review(uuid, uuid, text, text),
  public.staff_queue_counts(), public.staff_metrics(integer) to authenticated;
