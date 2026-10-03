-- Phase 8: chat (§4.6, §7, §10). Conversations are always about one listing, between its seller
-- and one buyer. Messages are persisted; delivery fans out over private Realtime topics
-- (conversation:{id} for the thread, user:{id} for the inbox). Typing is client Broadcast only and
-- never touches a table. Blocks and reports (App Store Guideline 1.2) arrive here too.

create type public.message_kind as enum ('text', 'image', 'offer_event', 'status_event', 'location_share');
create type public.report_status as enum ('open', 'actioned', 'dismissed');

-- Safe uuid parse (topics, storage paths); null on garbage.
create or replace function public.try_uuid(v text)
returns uuid
language plpgsql
immutable
set search_path = ''
as $$
begin
  return v::uuid;
exception when others then
  return null;
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------------------------

create table public.conversations (
  id                   uuid primary key default gen_random_uuid(),
  listing_id           uuid not null references public.listings (id) on delete cascade,
  -- Set null when an account is deleted: the other party keeps the thread ("Deleted user").
  buyer_id             uuid references auth.users (id) on delete set null,
  seller_id            uuid references auth.users (id) on delete set null,
  last_message_id      bigint,
  last_message_at      timestamptz,
  last_message_preview text,
  last_message_sender  uuid,
  created_at           timestamptz not null default now(),
  constraint conversations_one_per_buyer unique (listing_id, buyer_id),
  constraint conversations_two_people check (buyer_id is distinct from seller_id or buyer_id is null)
);

create index conversations_buyer on public.conversations (buyer_id);
create index conversations_seller on public.conversations (seller_id);

-- Per-user thread state. Read receipts compare the other side's last_read_message_id.
create table public.conversation_participants (
  conversation_id      uuid not null references public.conversations (id) on delete cascade,
  user_id              uuid not null references auth.users (id) on delete cascade,
  role                 text not null check (role in ('buyer', 'seller')),
  last_read_message_id bigint not null default 0,
  last_read_at         timestamptz,
  muted                boolean not null default false,
  archived_at          timestamptz,
  primary key (conversation_id, user_id)
);

create index conversation_participants_user on public.conversation_participants (user_id, conversation_id);

create table public.messages (
  id              bigint generated always as identity primary key,
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  -- null = system message (status_event/offer_event) or a deleted account.
  sender_id       uuid default auth.uid() references auth.users (id) on delete set null,
  kind            public.message_kind not null default 'text',
  body            text check (char_length(body) <= 2000),
  image_path      text,
  offer_id        uuid,  -- Phase 9 adds the foreign key to marketplace_offers.
  meta            jsonb not null default '{}',
  client_id       uuid,
  created_at      timestamptz not null default now(),
  constraint messages_idempotent unique (conversation_id, client_id),
  constraint messages_shape check (
    (kind = 'text' and char_length(btrim(body)) between 1 and 2000 and image_path is null)
    or (kind = 'image' and image_path is not null)
    or (kind = 'location_share' and jsonb_typeof(meta -> 'lat') = 'number' and jsonb_typeof(meta -> 'lng') = 'number')
    or (kind in ('status_event', 'offer_event')))
);

create index messages_thread on public.messages (conversation_id, id desc);
create index messages_sender_recent on public.messages (sender_id, created_at desc);

create table public.user_blocks (
  blocker_id uuid not null references auth.users (id) on delete cascade,
  blocked_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  constraint user_blocks_not_self check (blocker_id <> blocked_id)
);

create index user_blocks_blocked on public.user_blocks (blocked_id);

create table public.reports (
  id              uuid primary key default gen_random_uuid(),
  reporter_id     uuid references auth.users (id) on delete set null,
  target_type     text not null check (target_type in ('listing', 'user', 'conversation')),
  target_id       uuid not null,
  reason          text not null check (reason in ('prohibited', 'scam', 'offensive', 'spam', 'counterfeit', 'other')),
  details         text check (char_length(details) <= 500),
  status          public.report_status not null default 'open',
  resolution_note text check (char_length(resolution_note) <= 500),
  resolved_by     uuid references auth.users (id) on delete set null,
  resolved_at     timestamptz,
  created_at      timestamptz not null default now()
);

create index reports_open on public.reports (created_at desc) where status = 'open';
create unique index reports_one_open_per_reporter on public.reports (reporter_id, target_type, target_id) where status = 'open';

-- Notifications learn a new type (messages bypass the Activity feed; see the app).
alter table public.notifications drop constraint notifications_type_check;
alter table public.notifications add constraint notifications_type_check
  check (type in ('price_alert', 'brand_deal', 'saved_search', 'system', 'new_message'));

-- ---------------------------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------------------------

-- SECURITY DEFINER so policies on participants/messages don't recurse through each other's RLS.
create or replace function public.is_participant(conversation uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.conversation_participants p where p.conversation_id = conversation and p.user_id = auth.uid());
$$;

-- Either side blocked the other.
create or replace function public.is_blocked_between(a uuid, b uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.user_blocks ub where (ub.blocker_id = a and ub.blocked_id = b) or (ub.blocker_id = b and ub.blocked_id = a));
$$;

-- Realtime authorization (§7): conversation:{id} for participants, user:{id} for that user only.
create or replace function public.can_use_topic(topic text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when auth.uid() is null then false
    when topic = 'user:' || auth.uid()::text then true
    when topic like 'conversation:%' then public.is_participant(public.try_uuid(substr(topic, 14)))
    else false
  end;
$$;

-- ---------------------------------------------------------------------------------------------
-- Message triggers
-- ---------------------------------------------------------------------------------------------

-- Client-sent messages: server time, blocks, rate limit (30/min), shape of attachments.
create or replace function public.messages_before_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  c public.conversations;
  other uuid;
begin
  new.created_at := now();
  if new.sender_id is null then
    return new;  -- system message from a definer RPC
  end if;
  select * into c from public.conversations where id = new.conversation_id;
  other := case when new.sender_id = c.buyer_id then c.seller_id else c.buyer_id end;
  if other is null then
    raise exception 'This person has deleted their account.' using errcode = '22023';
  end if;
  if public.is_blocked_between(new.sender_id, other) then
    raise exception 'You can’t message this person.' using errcode = '42501', hint = 'blocked';
  end if;
  if (select count(*) from public.messages m where m.sender_id = new.sender_id and m.created_at > now() - interval '1 minute') >= 30 then
    raise exception 'You’re sending messages too quickly. Try again in a minute.' using errcode = '54000', hint = 'rate_limited';
  end if;
  if new.kind = 'image' and (new.image_path is null or split_part(new.image_path, '/', 1) <> new.conversation_id::text) then
    raise exception 'invalid image path' using errcode = '22023';
  end if;
  if new.kind = 'location_share' then
    if (new.meta ->> 'lat')::float8 not between -90 and 90 or (new.meta ->> 'lng')::float8 not between -180 and 180 then
      raise exception 'invalid location' using errcode = '22023';
    end if;
    new.meta := jsonb_build_object('lat', (new.meta ->> 'lat')::float8, 'lng', (new.meta ->> 'lng')::float8,
                                   'label', left(nullif(btrim(new.meta ->> 'label'), ''), 80));
  elsif new.kind = 'image' then
    new.meta := jsonb_build_object('width', (new.meta ->> 'width')::int, 'height', (new.meta ->> 'height')::int);
  else
    new.meta := '{}';
  end if;
  new.body := nullif(btrim(new.body), '');
  return new;
end;
$$;

-- Thread summary, sender's own read state, Realtime fan-out and the push notification.
create or replace function public.messages_after_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  preview text := case new.kind
    when 'text' then left(new.body, 140)
    when 'image' then 'Photo'
    when 'location_share' then 'Shared a meet-up spot'
    else left(coalesce(new.body, ''), 140)
  end;
  payload jsonb := jsonb_build_object(
    'id', new.id, 'conversation_id', new.conversation_id, 'sender_id', new.sender_id, 'kind', new.kind,
    'body', new.body, 'image_path', new.image_path, 'offer_id', new.offer_id, 'meta', new.meta,
    'client_id', new.client_id, 'created_at', new.created_at);
  p record;
  sender_name text := (select display_name from public.profiles where id = new.sender_id);
begin
  update public.conversations
     set last_message_id = new.id, last_message_at = new.created_at, last_message_preview = preview, last_message_sender = new.sender_id
   where id = new.conversation_id;
  -- A new message brings an archived thread back; you've read what you sent.
  update public.conversation_participants
     set archived_at = null,
         last_read_message_id = case when user_id = new.sender_id then new.id else last_read_message_id end,
         last_read_at = case when user_id = new.sender_id then new.created_at else last_read_at end
   where conversation_id = new.conversation_id;

  perform realtime.send(payload, 'message', 'conversation:' || new.conversation_id::text, true);

  for p in select cp.user_id, cp.muted, cp.last_read_message_id from public.conversation_participants cp where cp.conversation_id = new.conversation_id loop
    perform realtime.send(jsonb_build_object('conversation_id', new.conversation_id, 'message_id', new.id), 'inbox', 'user:' || p.user_id::text, true);
    -- Push: people only (not system lines), not to the sender, not when muted. One push per
    -- unread streak: the dedupe key changes once the recipient reads the thread.
    if new.sender_id is not null and p.user_id <> new.sender_id and not p.muted and new.kind in ('text', 'image', 'location_share') then
      perform public.notify(p.user_id, 'new_message', coalesce(sender_name, 'New message'),
        case when new.kind = 'text' then left(new.body, 200) else preview end,
        '/conversation/' || new.conversation_id::text,
        'msg:' || new.conversation_id::text || ':' || p.last_read_message_id::text,
        jsonb_build_object('conversation_id', new.conversation_id));
    end if;
  end loop;
  return null;
end;
$$;

create trigger messages_before_insert before insert on public.messages for each row execute function public.messages_before_insert();
create trigger messages_after_insert after insert on public.messages for each row execute function public.messages_after_insert();

revoke execute on function public.messages_before_insert(), public.messages_after_insert() from public, anon, authenticated;

-- ---------------------------------------------------------------------------------------------
-- RPCs
-- ---------------------------------------------------------------------------------------------

-- Opens (or returns) the caller's thread about a listing. Idempotent; capped at 20 new threads a day.
create or replace function public.start_conversation(listing uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  l public.listings;
  cid uuid;
  me uuid := auth.uid();
begin
  if me is null then
    raise exception 'sign in required' using errcode = '42501';
  end if;
  select id into cid from public.conversations c where c.listing_id = start_conversation.listing and c.buyer_id = me;
  if cid is not null then
    return cid;
  end if;
  select * into l from public.listings where id = start_conversation.listing;
  if l.id is null or l.status not in ('active', 'pending') then
    raise exception 'This listing isn’t available.' using errcode = '22023';
  end if;
  if l.seller_id = me then
    raise exception 'This is your listing.' using errcode = '22023';
  end if;
  if public.is_blocked_between(me, l.seller_id) then
    raise exception 'You can’t message this seller.' using errcode = '42501', hint = 'blocked';
  end if;
  if (select count(*) from public.conversations c where c.buyer_id = me and c.created_at > now() - interval '1 day') >= 20 then
    raise exception 'You’ve started a lot of conversations today. Try again tomorrow.' using errcode = '54000', hint = 'rate_limited';
  end if;
  insert into public.conversations (listing_id, buyer_id, seller_id) values (l.id, me, l.seller_id)
  on conflict on constraint conversations_one_per_buyer do nothing
  returning id into cid;
  if cid is null then
    select id into cid from public.conversations c where c.listing_id = l.id and c.buyer_id = me;
    return cid;
  end if;
  insert into public.conversation_participants (conversation_id, user_id, role)
  values (cid, me, 'buyer'), (cid, l.seller_id, 'seller');
  return cid;
end;
$$;

-- Marks the thread read up to a message and tells the other side ("Read 6:44 PM").
create or replace function public.mark_conversation_read(conversation uuid, up_to bigint)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  newest bigint := (select max(m.id) from public.messages m where m.conversation_id = conversation and m.id <= up_to);
  changed public.conversation_participants;
begin
  update public.conversation_participants cp
     set last_read_message_id = newest, last_read_at = now()
   where cp.conversation_id = conversation and cp.user_id = auth.uid() and newest is not null and cp.last_read_message_id < newest
  returning * into changed;
  if changed.user_id is not null then
    perform realtime.send(jsonb_build_object('user_id', changed.user_id, 'last_read_message_id', changed.last_read_message_id, 'last_read_at', changed.last_read_at),
                          'read', 'conversation:' || conversation::text, true);
    perform realtime.send(jsonb_build_object('conversation_id', conversation), 'inbox', 'user:' || changed.user_id::text, true);
  end if;
end;
$$;

-- Mute / archive (own state only).
create or replace function public.set_conversation_state(conversation uuid, muted boolean default null, archived boolean default null)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.conversation_participants cp
     set muted = coalesce(set_conversation_state.muted, cp.muted),
         archived_at = case when set_conversation_state.archived is null then cp.archived_at
                            when set_conversation_state.archived then now() else null end
   where cp.conversation_id = conversation and cp.user_id = auth.uid();
$$;

-- The caller's threads for the inbox (or one thread's header): only threads with messages,
-- never threads with someone either side has blocked.
create or replace function public.my_conversations(only_id uuid default null)
returns table (
  id uuid, listing_id uuid, listing_title text, listing_status text, listing_price_cents integer, listing_image text,
  product_slug text, category_slug text, role text, other_id uuid, other_name text,
  last_message_id bigint, last_message_at timestamptz, last_message_preview text, last_message_mine boolean,
  unread integer, muted boolean, archived boolean, other_last_read_message_id bigint, other_last_read_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select c.id, l.id,
         -- "JOOLA Perseus Pro IV 16mm": brand, name and the variant when the product has several.
         concat_ws(' ', coalesce(b.name, l.custom_brand_text), coalesce(p.name, l.custom_title),
                   case when (select count(*) from public.product_variants x where x.product_id = l.product_id) > 1 then v.label end),
         l.status::text, l.price_cents,
         (select i.storage_path from public.listing_images i where i.listing_id = l.id order by i.sort limit 1),
         p.slug, cat.slug, me.role, other.user_id, coalesce(pr.display_name, 'Deleted user'),
         c.last_message_id, c.last_message_at, c.last_message_preview, c.last_message_sender = auth.uid(),
         (select count(*)::int from public.messages m
           where m.conversation_id = c.id and m.id > me.last_read_message_id and m.sender_id is distinct from auth.uid()),
         me.muted, me.archived_at is not null, other.last_read_message_id, other.last_read_at
    from public.conversation_participants me
    join public.conversations c on c.id = me.conversation_id
    join public.listings l on l.id = c.listing_id
    join public.categories cat on cat.id = l.category_id
    left join public.products p on p.id = l.product_id
    left join public.product_variants v on v.id = l.variant_id
    left join public.brands b on b.id = coalesce(p.brand_id, l.brand_id)
    left join public.conversation_participants other on other.conversation_id = c.id and other.user_id <> me.user_id
    left join public.profiles pr on pr.id = other.user_id
   where me.user_id = auth.uid()
     and (only_id is null or c.id = only_id)
     and (only_id is not null or c.last_message_id is not null)
     and (other.user_id is null or not public.is_blocked_between(auth.uid(), other.user_id))
   order by c.last_message_at desc nulls last;
$$;

-- Badge: threads with unread messages (muted and archived ones don't count).
create or replace function public.unread_conversation_count()
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select count(*)::int from public.my_conversations() c where c.unread > 0 and not c.muted and not c.archived;
$$;

create or replace function public.block_user(target uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null or target = auth.uid() then
    raise exception 'invalid block' using errcode = '22023';
  end if;
  insert into public.user_blocks (blocker_id, blocked_id) values (auth.uid(), target) on conflict do nothing;
end;
$$;

create or replace function public.unblock_user(target uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  delete from public.user_blocks where blocker_id = auth.uid() and blocked_id = target;
$$;

-- Files a report. The reporter must be able to see what they report (listings are public; a
-- conversation only to its participants). One open report per reporter and target.
create or replace function public.file_report(target_type text, target_id uuid, reason text, details text default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  rid uuid;
  visible boolean;
begin
  if auth.uid() is null then
    raise exception 'sign in required' using errcode = '42501';
  end if;
  visible := case file_report.target_type
      when 'listing' then public.listing_is_public(file_report.target_id)
      when 'user' then exists (select 1 from public.profiles pr where pr.id = file_report.target_id) and file_report.target_id <> auth.uid()
      when 'conversation' then public.is_participant(file_report.target_id)
      else false end;
  if not coalesce(visible, false) then
    raise exception 'Nothing to report.' using errcode = '22023';
  end if;
  if (select count(*) from public.reports r where r.reporter_id = auth.uid() and r.created_at > now() - interval '1 day') >= 20 then
    raise exception 'You’ve sent a lot of reports today. We’re reviewing them.' using errcode = '54000', hint = 'rate_limited';
  end if;
  update public.reports r
     set reason = file_report.reason, details = coalesce(nullif(btrim(file_report.details), ''), r.details)
   where r.reporter_id = auth.uid() and r.target_type = file_report.target_type and r.target_id = file_report.target_id and r.status = 'open'
  returning r.id into rid;
  if rid is null then
    insert into public.reports (reporter_id, target_type, target_id, reason, details)
    values (auth.uid(), file_report.target_type, file_report.target_id, file_report.reason, nullif(btrim(file_report.details), ''))
    returning reports.id into rid;
  end if;
  return rid;
end;
$$;

-- Staff: reports with enough context to act on them. Conversation reports include the thread's
-- recent messages, and only for staff.
create or replace function public.staff_reports(include_closed boolean default false)
returns table (
  id uuid, target_type text, target_id uuid, reason text, details text, status text, created_at timestamptz,
  reporter_name text, open_reports integer, target_label text, target_owner uuid, target_owner_name text,
  listing_status text, transcript jsonb)
language sql
stable
security definer
set search_path = ''
as $$
  select r.id, r.target_type, r.target_id, r.reason, r.details, r.status::text, r.created_at,
         rp.display_name,
         (select count(*)::int from public.reports x where x.target_type = r.target_type and x.target_id = r.target_id and x.status = 'open'),
         case r.target_type
           when 'listing' then (select coalesce(p.name, l.custom_title) from public.listings l left join public.products p on p.id = l.product_id where l.id = r.target_id)
           when 'user' then (select pr.display_name from public.profiles pr where pr.id = r.target_id)
           when 'conversation' then (select coalesce(p.name, l.custom_title) from public.conversations c join public.listings l on l.id = c.listing_id left join public.products p on p.id = l.product_id where c.id = r.target_id)
         end,
         tgt.id, tgt.display_name,
         case when r.target_type = 'listing' then (select l.status::text from public.listings l where l.id = r.target_id) end,
         case when r.target_type = 'conversation' then (
           select coalesce(jsonb_agg(jsonb_build_object('at', m.created_at, 'from', coalesce(sp.display_name, 'System'), 'kind', m.kind, 'body', m.body) order by m.id), '[]')
             from (select * from public.messages m2 where m2.conversation_id = r.target_id order by m2.id desc limit 50) m
             left join public.profiles sp on sp.id = m.sender_id)
         end
    from public.reports r
    left join public.profiles rp on rp.id = r.reporter_id
    left join lateral (
      select pr.id, pr.display_name from public.profiles pr
       where pr.id = case r.target_type
                       when 'listing' then (select l.seller_id from public.listings l where l.id = r.target_id)
                       when 'user' then r.target_id
                       when 'conversation' then (select case when c.buyer_id = r.reporter_id then c.seller_id else c.buyer_id end from public.conversations c where c.id = r.target_id)
                     end) tgt on true
   where public.is_staff() and (include_closed or r.status = 'open')
   order by r.created_at desc
   limit 200;
$$;

-- Staff: close every open report on a target; optionally remove the listing.
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
    update public.listings set status = 'removed', removed_reason = coalesce(nullif(btrim(note), ''), 'Removed after a report')
     where id = r.target_id and status not in ('sold', 'removed');
  end if;
end;
$$;

-- Status changes now leave a line in every thread about the listing ("Marcus marked this listing Pending").
create or replace function public.set_listing_status(listing uuid, status text, buyer uuid default null, sold_price integer default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  l public.listings;
  seller_name text;
begin
  select * into l from public.listings where id = listing for update;
  if l.id is null or l.seller_id <> auth.uid() then
    raise exception 'listing not found' using errcode = '42501';
  end if;
  if l.status in ('sold', 'removed') then
    raise exception 'This listing is already %.', l.status using errcode = '22023';
  end if;
  if status not in ('active', 'pending', 'sold', 'removed') then
    raise exception 'unknown status %', status using errcode = '22023';
  end if;
  update public.listings
     set status = set_listing_status.status::public.listing_status,
         sold_to_user_id = case when set_listing_status.status = 'sold' then buyer end,
         sold_price_cents = case when set_listing_status.status = 'sold' then coalesce(sold_price, l.price_cents) end,
         sold_at = case when set_listing_status.status = 'sold' then now() end
   where id = listing;
  if set_listing_status.status <> l.status::text then
    seller_name := (select split_part(display_name, ' ', 1) from public.profiles where id = l.seller_id);
    insert into public.messages (conversation_id, sender_id, kind, body, meta)
    select c.id, null, 'status_event',
           seller_name || case set_listing_status.status
             when 'active' then ' marked this listing available again'
             when 'removed' then ' removed this listing'
             else ' marked this listing ' || initcap(set_listing_status.status) end,
           jsonb_build_object('status', set_listing_status.status, 'actor_id', l.seller_id)
      from public.conversations c
     where c.listing_id = listing and c.last_message_id is not null;
  end if;
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------------------------

revoke execute on function public.is_blocked_between(uuid, uuid) from public, anon;
grant execute on function public.is_blocked_between(uuid, uuid) to authenticated;
revoke execute on function public.is_participant(uuid), public.can_use_topic(text) from public, anon;
grant execute on function public.is_participant(uuid), public.can_use_topic(text) to authenticated;
revoke execute on function public.start_conversation(uuid), public.mark_conversation_read(uuid, bigint), public.set_conversation_state(uuid, boolean, boolean),
  public.my_conversations(uuid), public.unread_conversation_count(), public.block_user(uuid), public.unblock_user(uuid),
  public.file_report(text, uuid, text, text), public.staff_reports(boolean), public.resolve_report(uuid, text, text, boolean) from public, anon;
grant execute on function public.start_conversation(uuid), public.mark_conversation_read(uuid, bigint), public.set_conversation_state(uuid, boolean, boolean),
  public.my_conversations(uuid), public.unread_conversation_count(), public.block_user(uuid), public.unblock_user(uuid),
  public.file_report(text, uuid, text, text), public.staff_reports(boolean), public.resolve_report(uuid, text, text, boolean) to authenticated;

-- ---------------------------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------------------------

alter table public.conversations enable row level security;
alter table public.conversation_participants enable row level security;
alter table public.messages enable row level security;
alter table public.user_blocks enable row level security;
alter table public.reports enable row level security;

create policy "participants read their conversations" on public.conversations for select to authenticated
  using (public.is_participant(id));
create policy "participants read thread membership" on public.conversation_participants for select to authenticated
  using (public.is_participant(conversation_id));
create policy "participants read messages" on public.messages for select to authenticated
  using (public.is_participant(conversation_id));
-- People send text, photos and meet-up spots as themselves; status/offer lines come from RPCs only.
create policy "participants send messages" on public.messages for insert to authenticated
  with check (sender_id = (select auth.uid()) and kind in ('text', 'image', 'location_share') and public.is_participant(conversation_id));
create policy "owners read their blocks" on public.user_blocks for select to authenticated
  using ((select auth.uid()) = blocker_id);
create policy "reporters read their reports" on public.reports for select to authenticated
  using ((select auth.uid()) = reporter_id or public.is_staff());

revoke all on public.conversations, public.conversation_participants, public.messages, public.user_blocks, public.reports from anon, authenticated;
grant select on public.conversations, public.conversation_participants, public.messages, public.user_blocks, public.reports to authenticated;
grant insert (conversation_id, sender_id, kind, body, image_path, meta, client_id) on public.messages to authenticated;

-- Realtime topics (§7). Typing is a client Broadcast on the conversation topic.
create policy "chat topics are private to their members" on realtime.messages for select to authenticated
  using (public.can_use_topic(realtime.topic()));
create policy "members broadcast typing in their threads" on realtime.messages for insert to authenticated
  with check (realtime.topic() like 'conversation:%' and public.can_use_topic(realtime.topic()));

-- ---------------------------------------------------------------------------------------------
-- Storage: chat-images/{conversation_id}/{uuid}.jpg — private, participants only (signed URLs).
-- ---------------------------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('chat-images', 'chat-images', false, 5242880, array['image/jpeg'])
on conflict (id) do nothing;

create policy "participants upload chat photos" on storage.objects for insert to authenticated
  with check (bucket_id = 'chat-images' and public.is_participant(public.try_uuid((storage.foldername(name))[1])));
create policy "participants view chat photos" on storage.objects for select to authenticated
  using (bucket_id = 'chat-images' and public.is_participant(public.try_uuid((storage.foldername(name))[1])));
