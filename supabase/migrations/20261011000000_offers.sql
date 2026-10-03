-- Phase 9: structured offers (§4.6, §8). Offers are records with a state machine run entirely in
-- SECURITY DEFINER RPCs (one transaction each). Every transition writes an offer_event line into the
-- thread and a notification. Accepting writes an agreement (the future payments hook) but never
-- changes the listing status; the seller does that explicitly.
--
--   make_offer      → pending                               (buyer; listing active and accepts offers)
--   counter_offer   → parent countered + child pending      (the side that must respond; turns alternate)
--   accept_offer    → accepted + agreement                  (the side that must respond)
--   decline_offer   → declined                              (the side that must respond)
--   withdraw_offer  → withdrawn                             (the proposer, while pending)
--   expire_offers   → expired                               (cron, 48 h; reminder 6 h before)
--   listing sold/removed → open offers closed (expired)

create type public.marketplace_offer_status as enum ('pending', 'accepted', 'declined', 'countered', 'withdrawn', 'expired');

create table public.marketplace_offers (
  id              uuid primary key default gen_random_uuid(),
  listing_id      uuid not null references public.listings (id) on delete cascade,
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  buyer_id        uuid references auth.users (id) on delete set null,
  seller_id       uuid references auth.users (id) on delete set null,
  proposed_by     uuid references auth.users (id) on delete set null,
  parent_offer_id uuid references public.marketplace_offers (id) on delete set null,
  amount_cents    integer not null check (amount_cents between 100 and 1000000),
  message         text check (char_length(message) <= 280),
  status          public.marketplace_offer_status not null default 'pending',
  -- Below the seller's private floor (listing_private.hide_offers_below_cents): declined at once
  -- and never shown to the seller.
  auto_declined   boolean not null default false,
  expires_at      timestamptz not null default now() + interval '48 hours',
  reminded_at     timestamptz,
  responded_at    timestamptz,
  created_at      timestamptz not null default now()
);

create unique index marketplace_offers_one_pending on public.marketplace_offers (conversation_id) where status = 'pending';
create index marketplace_offers_expiring on public.marketplace_offers (expires_at) where status = 'pending';
create index marketplace_offers_thread on public.marketplace_offers (conversation_id, created_at);
create index marketplace_offers_listing on public.marketplace_offers (listing_id, status);
create index marketplace_offers_buyer on public.marketplace_offers (buyer_id, created_at desc);
create index marketplace_offers_seller on public.marketplace_offers (seller_id, created_at desc);

create table public.agreements (
  id           uuid primary key default gen_random_uuid(),
  offer_id     uuid not null unique references public.marketplace_offers (id) on delete cascade,
  listing_id   uuid not null references public.listings (id) on delete cascade,
  buyer_id     uuid references auth.users (id) on delete set null,
  seller_id    uuid references auth.users (id) on delete set null,
  amount_cents integer not null,
  created_at   timestamptz not null default now()
);

create index agreements_listing on public.agreements (listing_id);

alter table public.messages add constraint messages_offer_fk foreign key (offer_id) references public.marketplace_offers (id) on delete set null;

alter table public.notifications drop constraint notifications_type_check;
alter table public.notifications add constraint notifications_type_check
  check (type in ('price_alert', 'brand_deal', 'saved_search', 'system', 'new_message', 'offer'));

-- ---------------------------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------------------------

-- "$120" / "$119.50" (money is integer cents everywhere else).
create or replace function public.fmt_usd(cents integer)
returns text
language sql
immutable
set search_path = ''
as $$
  select '$' || case when cents % 100 = 0 then to_char(cents / 100, 'FM9,999,990') else to_char(cents / 100.0, 'FM9,999,990.00') end;
$$;

create or replace function public.first_name(uid uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(split_part((select display_name from public.profiles where id = uid), ' ', 1), 'Someone');
$$;

-- The thread line for a transition. sender_id stays null (a system line); meta.actor_id lets the
-- actor's own lines not count as unread.
create or replace function public.offer_event(o public.marketplace_offers, action text, actor uuid, body text, extra jsonb default '{}')
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.messages (conversation_id, sender_id, kind, body, offer_id, meta)
  values (o.conversation_id, null, 'offer_event', body, o.id,
          jsonb_build_object('action', action, 'actor_id', actor, 'amount_cents', o.amount_cents, 'message', o.message) || extra);
$$;

create or replace function public.offer_notify(o public.marketplace_offers, recipient uuid, title text, body text)
returns void
language sql
security definer
set search_path = ''
as $$
  select public.notify(recipient, 'offer', title, body, '/conversation/' || o.conversation_id::text,
                       'offer:' || o.id::text || ':' || o.status::text || ':' || recipient::text,
                       jsonb_build_object('offer_id', o.id, 'conversation_id', o.conversation_id))
   where recipient is not null;
$$;

-- Loads a pending offer for the caller to act on, locked. `as_role`: 'respondent' (the side that
-- didn't propose) or 'proposer'.
create or replace function public.offer_for_action(offer uuid, as_role text)
returns public.marketplace_offers
language plpgsql
security definer
set search_path = ''
as $$
declare
  o public.marketplace_offers;
  me uuid := auth.uid();
begin
  select * into o from public.marketplace_offers where id = offer for update;
  if o.id is null or me is null or me not in (o.buyer_id, o.seller_id) or (o.auto_declined and me = o.seller_id) then
    raise exception 'offer not found' using errcode = '42501';
  end if;
  if o.status <> 'pending' or o.expires_at <= now() then
    raise exception 'This offer is no longer open.' using errcode = '22023', hint = 'not_pending';
  end if;
  if as_role = 'respondent' and me = o.proposed_by then
    raise exception 'Waiting for the other person to respond.' using errcode = '42501', hint = 'not_your_turn';
  end if;
  if as_role = 'proposer' and me <> o.proposed_by then
    raise exception 'Only the person who made this offer can withdraw it.' using errcode = '42501';
  end if;
  return o;
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- Transitions
-- ---------------------------------------------------------------------------------------------

-- Returns {offer_id, conversation_id, status}. Below the seller's floor the offer is recorded as
-- declined (counts toward the rate limit) and nothing reaches the seller.
create or replace function public.make_offer(listing uuid, amount_cents integer, message text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  l public.listings;
  me uuid := auth.uid();
  cid uuid;
  floor_cents integer;
  o public.marketplace_offers;
begin
  if me is null then
    raise exception 'sign in required' using errcode = '42501';
  end if;
  select * into l from public.listings where id = make_offer.listing;
  if l.id is null or l.status <> 'active' then
    raise exception 'This listing isn’t taking offers right now.' using errcode = '22023';
  end if;
  if not l.accepts_offers then
    raise exception 'The seller isn’t taking offers on this listing.' using errcode = '22023';
  end if;
  if make_offer.amount_cents is null or make_offer.amount_cents < 100 then
    raise exception 'Enter an amount of at least $1.' using errcode = '22023';
  end if;
  if (select count(*) from public.marketplace_offers x where x.buyer_id = me and x.listing_id = l.id and x.created_at > now() - interval '1 hour') >= 10 then
    raise exception 'You’ve made a lot of offers on this listing. Try again later.' using errcode = '54000', hint = 'rate_limited';
  end if;
  cid := public.start_conversation(l.id);  -- checks seller ≠ buyer and blocks
  if exists (select 1 from public.marketplace_offers x where x.conversation_id = cid and x.status = 'pending') then
    raise exception 'There’s already an open offer in this chat.' using errcode = '22023', hint = 'pending_exists';
  end if;
  floor_cents := (select lp.hide_offers_below_cents from public.listing_private lp where lp.listing_id = l.id);

  insert into public.marketplace_offers (listing_id, conversation_id, buyer_id, seller_id, proposed_by, amount_cents, message, status, auto_declined, responded_at)
  values (l.id, cid, me, l.seller_id, me, make_offer.amount_cents, nullif(btrim(make_offer.message), ''),
          case when floor_cents is not null and make_offer.amount_cents < floor_cents then 'declined' else 'pending' end::public.marketplace_offer_status,
          floor_cents is not null and make_offer.amount_cents < floor_cents,
          case when floor_cents is not null and make_offer.amount_cents < floor_cents then now() end)
  returning * into o;

  if not o.auto_declined then
    perform public.offer_event(o, 'made', me, public.first_name(me) || ' offered ' || public.fmt_usd(o.amount_cents));
    perform public.offer_notify(o, l.seller_id, 'New offer: ' || public.fmt_usd(o.amount_cents),
      public.first_name(me) || ' offered ' || public.fmt_usd(o.amount_cents) || ' (you’re asking ' || public.fmt_usd(l.price_cents) || ').');
  end if;
  return jsonb_build_object('offer_id', o.id, 'conversation_id', cid, 'status', o.status);
end;
$$;

create or replace function public.counter_offer(offer uuid, amount_cents integer, message text default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  o public.marketplace_offers := public.offer_for_action(offer, 'respondent');
  me uuid := auth.uid();
  other uuid;
  l public.listings;
  c public.marketplace_offers;
begin
  select * into l from public.listings where id = o.listing_id;
  if l.status not in ('active', 'pending') then
    raise exception 'This listing is no longer available.' using errcode = '22023';
  end if;
  if counter_offer.amount_cents is null or counter_offer.amount_cents < 100 then
    raise exception 'Enter an amount of at least $1.' using errcode = '22023';
  end if;
  if counter_offer.amount_cents = o.amount_cents then
    raise exception 'That’s the same amount. Accept the offer instead.' using errcode = '22023';
  end if;
  other := case when me = o.buyer_id then o.seller_id else o.buyer_id end;
  if public.is_blocked_between(me, other) then
    raise exception 'You can’t respond to this person.' using errcode = '42501', hint = 'blocked';
  end if;
  update public.marketplace_offers set status = 'countered', responded_at = now() where id = o.id returning * into o;
  insert into public.marketplace_offers (listing_id, conversation_id, buyer_id, seller_id, proposed_by, parent_offer_id, amount_cents, message)
  values (o.listing_id, o.conversation_id, o.buyer_id, o.seller_id, me, o.id, counter_offer.amount_cents, nullif(btrim(counter_offer.message), ''))
  returning * into c;
  perform public.offer_event(c, 'countered', me, public.first_name(me) || ' countered at ' || public.fmt_usd(c.amount_cents),
                             jsonb_build_object('previous_cents', o.amount_cents));
  perform public.offer_notify(c, other, 'Counteroffer: ' || public.fmt_usd(c.amount_cents),
    public.first_name(me) || ' countered your ' || public.fmt_usd(o.amount_cents) || ' offer with ' || public.fmt_usd(c.amount_cents) || '.');
  return c.id;
end;
$$;

create or replace function public.accept_offer(offer uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  o public.marketplace_offers := public.offer_for_action(offer, 'respondent');
  me uuid := auth.uid();
  l public.listings;
  aid uuid;
begin
  select * into l from public.listings where id = o.listing_id;
  if l.status not in ('active', 'pending') then
    raise exception 'This listing is no longer available.' using errcode = '22023';
  end if;
  if public.is_blocked_between(o.buyer_id, o.seller_id) then
    raise exception 'You can’t respond to this person.' using errcode = '42501', hint = 'blocked';
  end if;
  update public.marketplace_offers set status = 'accepted', responded_at = now() where id = o.id returning * into o;
  insert into public.agreements (offer_id, listing_id, buyer_id, seller_id, amount_cents)
  values (o.id, o.listing_id, o.buyer_id, o.seller_id, o.amount_cents)
  returning id into aid;
  perform public.offer_event(o, 'accepted', me, 'Offer accepted · ' || public.fmt_usd(o.amount_cents));
  perform public.offer_notify(o, o.proposed_by, 'Offer accepted: ' || public.fmt_usd(o.amount_cents),
    public.first_name(me) || ' accepted ' || public.fmt_usd(o.amount_cents) || '. Agree on payment and pickup in chat.');
  return aid;
end;
$$;

create or replace function public.decline_offer(offer uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  o public.marketplace_offers := public.offer_for_action(offer, 'respondent');
  me uuid := auth.uid();
begin
  update public.marketplace_offers set status = 'declined', responded_at = now() where id = o.id returning * into o;
  perform public.offer_event(o, 'declined', me, public.first_name(me) || ' declined the ' || public.fmt_usd(o.amount_cents) || ' offer');
  perform public.offer_notify(o, o.proposed_by, 'Offer declined',
    public.first_name(me) || ' declined your ' || public.fmt_usd(o.amount_cents) || ' offer. You can still chat or make a new one.');
end;
$$;

create or replace function public.withdraw_offer(offer uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  o public.marketplace_offers := public.offer_for_action(offer, 'proposer');
  me uuid := auth.uid();
begin
  update public.marketplace_offers set status = 'withdrawn', responded_at = now() where id = o.id returning * into o;
  perform public.offer_event(o, 'withdrawn', me, public.first_name(me) || ' withdrew the ' || public.fmt_usd(o.amount_cents) || ' offer');
  perform public.offer_notify(o, case when me = o.buyer_id then o.seller_id else o.buyer_id end, 'Offer withdrawn',
    public.first_name(me) || ' withdrew the ' || public.fmt_usd(o.amount_cents) || ' offer.');
end;
$$;

-- Cron (every 5 min): reminders 6 h before expiry, then expiry at 48 h.
create or replace function public.expire_offers()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  o public.marketplace_offers;
  n integer := 0;
begin
  for o in
    update public.marketplace_offers set reminded_at = now()
     where status = 'pending' and reminded_at is null and expires_at > now() and expires_at <= now() + interval '6 hours'
    returning *
  loop
    perform public.notify(case when o.proposed_by = o.buyer_id then o.seller_id else o.buyer_id end, 'offer',
      'Offer expires soon', 'The ' || public.fmt_usd(o.amount_cents) || ' offer expires in a few hours. Accept, counter or decline.',
      '/conversation/' || o.conversation_id::text, 'offer:' || o.id::text || ':expiring', jsonb_build_object('offer_id', o.id));
  end loop;
  for o in
    update public.marketplace_offers set status = 'expired', responded_at = now()
     where status = 'pending' and expires_at <= now()
    returning *
  loop
    n := n + 1;
    perform public.offer_event(o, 'expired', null, 'The ' || public.fmt_usd(o.amount_cents) || ' offer expired');
    perform public.offer_notify(o, o.proposed_by, 'Offer expired', 'Your ' || public.fmt_usd(o.amount_cents) || ' offer expired without a reply.');
  end loop;
  return n;
end;
$$;

select cron.schedule('expire-offers', '*/5 * * * *', 'select public.expire_offers()');

-- ---------------------------------------------------------------------------------------------
-- Listing status: sold/removed closes open offers (in addition to the Phase 8 status lines).
-- ---------------------------------------------------------------------------------------------

create or replace function public.close_listing_offers()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  o public.marketplace_offers;
begin
  if new.status in ('sold', 'removed') and old.status not in ('sold', 'removed') then
    for o in
      update public.marketplace_offers set status = 'expired', responded_at = now()
       where listing_id = new.id and status = 'pending'
      returning *
    loop
      perform public.offer_event(o, 'closed', null, 'Offer closed: this listing is ' || case when new.status = 'sold' then 'sold' else 'no longer available' end);
    end loop;
  end if;
  return null;
end;
$$;

create trigger listings_close_offers after update of status on public.listings
  for each row execute function public.close_listing_offers();

-- ---------------------------------------------------------------------------------------------
-- Chat integration: system lines don't run client checks; an actor's own lines aren't unread.
-- ---------------------------------------------------------------------------------------------

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
  if new.sender_id is null or new.kind in ('status_event', 'offer_event') then
    return new;  -- system line from a definer RPC
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

-- Status lines record who changed the status too.
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
    seller_name := public.first_name(l.seller_id);
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

-- Inbox rows gain the thread's latest offer (tags "OFFER $120", "ACCEPTED $135") and whether it
-- awaits the caller. Unread ignores the caller's own system lines.
drop function public.unread_conversation_count();
drop function public.my_conversations(uuid);

create function public.my_conversations(only_id uuid default null)
returns table (
  id uuid, listing_id uuid, listing_title text, listing_status text, listing_price_cents integer, listing_image text,
  product_slug text, category_slug text, role text, other_id uuid, other_name text,
  last_message_id bigint, last_message_at timestamptz, last_message_preview text, last_message_mine boolean,
  unread integer, muted boolean, archived boolean, other_last_read_message_id bigint, other_last_read_at timestamptz,
  offer_id uuid, offer_status text, offer_amount_cents integer, offer_awaiting_me boolean, offer_mine boolean,
  accepts_offers boolean, variant_id uuid)
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
           where m.conversation_id = c.id and m.id > me.last_read_message_id and m.sender_id is distinct from auth.uid()
             and (m.meta ->> 'actor_id') is distinct from auth.uid()::text),
         me.muted, me.archived_at is not null, other.last_read_message_id, other.last_read_at,
         lo.id, lo.status::text, lo.amount_cents, lo.status = 'pending' and lo.proposed_by is distinct from auth.uid(), lo.proposed_by = auth.uid(),
         l.accepts_offers, l.variant_id
    from public.conversation_participants me
    join public.conversations c on c.id = me.conversation_id
    join public.listings l on l.id = c.listing_id
    join public.categories cat on cat.id = l.category_id
    left join public.products p on p.id = l.product_id
    left join public.product_variants v on v.id = l.variant_id
    left join public.brands b on b.id = coalesce(p.brand_id, l.brand_id)
    left join public.conversation_participants other on other.conversation_id = c.id and other.user_id <> me.user_id
    left join public.profiles pr on pr.id = other.user_id
    left join lateral (
      select o.* from public.marketplace_offers o
       where o.conversation_id = c.id and not (o.auto_declined and o.seller_id = auth.uid())
       order by o.created_at desc limit 1) lo on true
   where me.user_id = auth.uid()
     and (only_id is null or c.id = only_id)
     and (only_id is not null or c.last_message_id is not null)
     and (other.user_id is null or not public.is_blocked_between(auth.uid(), other.user_id))
   order by c.last_message_at desc nulls last;
$$;

create function public.unread_conversation_count()
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select count(*)::int from public.my_conversations() c where c.unread > 0 and not c.muted and not c.archived;
$$;

-- Profile → Offers: the caller's offers (latest per thread), newest first.
create or replace function public.my_offers()
returns table (
  id uuid, conversation_id uuid, listing_id uuid, listing_title text, listing_image text, product_slug text, category_slug text,
  role text, other_name text, amount_cents integer, status text, awaiting_me boolean, mine boolean, expires_at timestamptz, created_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select o.id, o.conversation_id, l.id,
         concat_ws(' ', coalesce(b.name, l.custom_brand_text), coalesce(p.name, l.custom_title)),
         (select i.storage_path from public.listing_images i where i.listing_id = l.id order by i.sort limit 1),
         p.slug, cat.slug,
         case when o.buyer_id = auth.uid() then 'buyer' else 'seller' end,
         coalesce(pr.display_name, 'Deleted user'),
         o.amount_cents, o.status::text, o.status = 'pending' and o.proposed_by is distinct from auth.uid(), o.proposed_by = auth.uid(),
         o.expires_at, o.created_at
    from (select distinct on (x.conversation_id) x.* from public.marketplace_offers x
           where auth.uid() in (x.buyer_id, x.seller_id) and not (x.auto_declined and x.seller_id = auth.uid())
           order by x.conversation_id, x.created_at desc) o
    join public.listings l on l.id = o.listing_id
    join public.categories cat on cat.id = l.category_id
    left join public.products p on p.id = l.product_id
    left join public.brands b on b.id = coalesce(p.brand_id, l.brand_id)
    left join public.profiles pr on pr.id = case when o.buyer_id = auth.uid() then o.seller_id else o.buyer_id end
   where o.buyer_id is null or o.seller_id is null or not public.is_blocked_between(o.buyer_id, o.seller_id)
   order by (o.status = 'pending' and o.proposed_by is distinct from auth.uid()) desc, o.created_at desc;
$$;

-- My listings: threads and open offers per listing (savers stay anonymous; so do buyers here).
create or replace function public.my_listing_activity()
returns table (listing_id uuid, chats integer, open_offers integer)
language sql
stable
security definer
set search_path = ''
as $$
  select l.id,
         (select count(*)::int from public.conversations c where c.listing_id = l.id and c.last_message_id is not null),
         (select count(*)::int from public.marketplace_offers o where o.listing_id = l.id and o.status = 'pending' and not o.auto_declined)
    from public.listings l
   where l.seller_id = auth.uid();
$$;

-- ---------------------------------------------------------------------------------------------
-- Grants and RLS
-- ---------------------------------------------------------------------------------------------

revoke execute on function public.first_name(uuid), public.offer_event(public.marketplace_offers, text, uuid, text, jsonb),
  public.offer_notify(public.marketplace_offers, uuid, text, text), public.offer_for_action(uuid, text),
  public.expire_offers(), public.close_listing_offers() from public, anon, authenticated;
revoke execute on function public.make_offer(uuid, integer, text), public.counter_offer(uuid, integer, text), public.accept_offer(uuid),
  public.decline_offer(uuid), public.withdraw_offer(uuid), public.my_conversations(uuid), public.unread_conversation_count(),
  public.my_offers(), public.my_listing_activity() from public, anon;
grant execute on function public.make_offer(uuid, integer, text), public.counter_offer(uuid, integer, text), public.accept_offer(uuid),
  public.decline_offer(uuid), public.withdraw_offer(uuid), public.my_conversations(uuid), public.unread_conversation_count(),
  public.my_offers(), public.my_listing_activity() to authenticated;

alter table public.marketplace_offers enable row level security;
alter table public.agreements enable row level security;

create policy "buyer and seller read offers" on public.marketplace_offers for select to authenticated
  using ((select auth.uid()) = buyer_id or ((select auth.uid()) = seller_id and not auto_declined));
create policy "buyer and seller read agreements" on public.agreements for select to authenticated
  using ((select auth.uid()) in (buyer_id, seller_id));

revoke all on public.marketplace_offers, public.agreements from anon, authenticated;
grant select on public.marketplace_offers, public.agreements to authenticated;
