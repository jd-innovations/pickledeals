-- Phase 10: notifications complete (§4.7, §11).
-- One vocabulary: a notification's `type` is also its preference category.
--   Deals & prices: price_drop, target_price, brand_deal, saved_search, weekly_digest
--   Pre-owned:      offer, new_message, nearby_listing, listing_update
--   Always on:      summary (morning summary after quiet hours), system
-- Turning a category off means it's never created (no Activity row, no push). Push delivery rules
-- live in claim_pending_notifications so they're testable in SQL:
--   quiet hours  → offers/messages are held and summarized when quiet hours end; others skip push
--   daily cap    → price_drop, brand_deal, saved_search, nearby_listing beyond N/day skip push
--   viewing      → no message notification while the recipient has the thread open
-- No promotional pushes, by policy.

-- ---------------------------------------------------------------------------------------------
-- Types and preferences
-- ---------------------------------------------------------------------------------------------

alter table public.notifications drop constraint notifications_type_check;
update public.notifications set type = 'target_price' where type = 'price_alert';
update public.notifications set type = 'listing_update' where type = 'system' and data ? 'listing_id';
alter table public.notifications add constraint notifications_type_check check (type in (
  'price_drop', 'target_price', 'brand_deal', 'saved_search', 'weekly_digest',
  'offer', 'new_message', 'nearby_listing', 'listing_update', 'summary', 'system'));

-- Offers and messages held through quiet hours wait here; the morning summary replaces them.
alter table public.notifications add column held_until timestamptz;

create table public.notification_preferences (
  user_id    uuid not null references auth.users (id) on delete cascade,
  category   text not null check (category in (
               'price_drop', 'target_price', 'brand_deal', 'saved_search', 'weekly_digest',
               'offer', 'new_message', 'nearby_listing', 'listing_update')),
  push       boolean not null default true,
  in_app     boolean not null default true,
  updated_at timestamptz not null default now(),
  primary key (user_id, category)
);

alter table public.profiles_private
  add column quiet_enabled  boolean not null default true,
  add column quiet_start    time not null default '22:00',
  add column quiet_end      time not null default '08:00',
  add column tz             text not null default 'America/New_York',
  -- null = no limit
  add column daily_deal_cap integer default 3 check (daily_deal_cap between 1 and 20);

-- While a thread is on screen the app renews this every 30 s; message pushes are skipped meanwhile.
alter table public.conversation_participants add column viewing_until timestamptz;

-- Expo push tickets awaiting a receipt check (§11: revoke DeviceNotRegistered tokens).
create table public.push_receipts (
  ticket_id  text primary key,
  expo_token text not null,
  created_at timestamptz not null default now()
);

-- Saved searches gain the marketplace scope ("nearby listings").
alter table public.saved_searches drop constraint saved_searches_scope_check;
alter table public.saved_searches add constraint saved_searches_scope_check check (scope in ('deals', 'market'));

-- Defaults: everything on except the weekly digest (design: NotifPrefs).
create or replace function public.notification_pref(uid uuid, category text)
returns table (push boolean, in_app boolean)
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(np.push, d.on_by_default), coalesce(np.in_app, d.on_by_default)
    from (select notification_pref.category <> 'weekly_digest' as on_by_default) d
    left join public.notification_preferences np on np.user_id = uid and np.category = notification_pref.category;
$$;

-- Server-side insert helper: deduplicated, never raises on a repeat, honours preferences.
create or replace function public.notify(uid uuid, kind text, title text, body text, route text, dedupe text, extra jsonb default '{}')
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  pref record;
begin
  if uid is null then
    return;
  end if;
  if kind in ('summary', 'system') then
    select true as push, true as in_app into pref;
  else
    select * into pref from public.notification_pref(uid, kind);
  end if;
  if not pref.in_app and not pref.push then
    return;
  end if;
  insert into public.notifications (user_id, type, title, body, route, dedupe_key, data, push_status, pushed_at, push_error)
  values (uid, kind, left(title, 120), left(body, 240), route, dedupe, extra,
          case when pref.push then 'pending' else 'skipped' end::public.push_status,
          case when pref.push then null else now() end,
          case when pref.push then null else 'preference' end)
  on conflict on constraint notifications_dedupe do nothing;
  -- Push off but Activity off too would have returned above; Activity off but push on: hide the row.
  if not pref.in_app then
    update public.notifications set read_at = now() where user_id = uid and dedupe_key = dedupe and read_at is null;
  end if;
end;
$$;

revoke execute on function public.notify(uuid, text, text, text, text, text, jsonb), public.notification_pref(uuid, text) from public, anon, authenticated;

-- ---------------------------------------------------------------------------------------------
-- Events: callers move to the new vocabulary; new events for price drops and nearby listings.
-- ---------------------------------------------------------------------------------------------

create or replace function public.evaluate_price_alerts(vid uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  a      record;
  best   record;
  fired  integer := 0;
begin
  for a in
    select pa.*, p.slug as product_slug, p.name as product_name, b.name as brand_name
      from public.price_alerts pa
      join public.product_variants v on v.id = vid and v.product_id = pa.product_id
      join public.products p on p.id = pa.product_id
      join public.brands b on b.id = p.brand_id
     where pa.status = 'active' and pa.include_new and (pa.variant_id is null or pa.variant_id = vid)
  loop
    select r.delivered_cents, r.retailer_name, v.label
      into best
      from public.variant_offer_ranking r
      join public.product_variants v on v.id = r.variant_id
     where r.product_id = a.product_id and r.rank = 1 and (a.variant_id is null or r.variant_id = a.variant_id)
     order by r.delivered_cents
     limit 1;

    if best.delivered_cents is not null and best.delivered_cents <= a.target_cents
       and (a.last_notified_cents is null or best.delivered_cents < a.last_notified_cents) then
      perform public.notify(
        a.user_id, 'target_price',
        format('%s %s is %s', a.brand_name, a.product_name, public.format_usd(best.delivered_cents)),
        format('Below your %s target at %s.', public.format_usd(a.target_cents), best.retailer_name),
        '/deals/product/' || a.product_slug,
        format('alert:%s:%s', a.id, best.delivered_cents),
        jsonb_build_object('alert_id', a.id, 'price_cents', best.delivered_cents));
      update public.price_alerts set last_notified_at = now(), last_notified_cents = best.delivered_cents where id = a.id;
      fired := fired + 1;
    end if;
  end loop;
  return fired;
end;
$$;

-- Price drops on saved products and deals (§11 "Price drop"). Fires when a variant's best delivered
-- price falls by at least $1. People whose price alert fires for the same price get that instead.
create or replace function public.notify_saved_price_drop()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  p   record;
  uid uuid;
begin
  if new.best_delivered_cents is null or old.best_delivered_cents is null or old.best_delivered_cents - new.best_delivered_cents < 100 then
    return null;
  end if;
  select pr.id, pr.slug, pr.name, b.name as brand_name into p
    from public.product_variants v join public.products pr on pr.id = v.product_id join public.brands b on b.id = pr.brand_id
   where v.id = new.variant_id;
  for uid in
    select sp.user_id from public.saved_products sp where sp.product_id = p.id
    union
    select sd.user_id from public.saved_deals sd join public.deals d on d.id = sd.deal_id where d.variant_id = new.variant_id
  loop
    if not exists (select 1 from public.price_alerts pa
                    where pa.user_id = uid and pa.product_id = p.id and pa.status = 'active' and pa.include_new
                      and new.best_delivered_cents <= pa.target_cents) then
      perform public.notify(uid, 'price_drop',
        format('%s %s dropped to %s', p.brand_name, p.name, public.format_usd(new.best_delivered_cents)),
        format('Was %s. You saved this.', public.format_usd(old.best_delivered_cents)),
        '/deals/product/' || p.slug, format('drop:%s:%s', new.variant_id, new.best_delivered_cents),
        jsonb_build_object('variant_id', new.variant_id, 'price_cents', new.best_delivered_cents));
    end if;
  end loop;
  return null;
end;
$$;

create trigger variant_price_stats_saved_drop after update of best_delivered_cents on public.variant_price_stats
  for each row execute function public.notify_saved_price_drop();

-- Listings: used price alerts (target_price), saved marketplace searches nearby (nearby_listing)
-- and status changes for savers (listing_update). Distances use snapped points only (D2).
create or replace function public.notify_listing_events()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  a     record;
  info  record;
  pt    extensions.geography := (select public_point from public.listing_locations where listing_id = new.id);
  uid   uuid;
begin
  select coalesce(p.name, new.custom_title) as title, coalesce(b.name, new.custom_brand_text) as brand_name, b.slug as brand_slug, c.slug as category_slug,
         lower(concat_ws(' ', b.name, new.custom_brand_text, p.name, new.custom_title, v.label, c.name)) as haystack
    into info
    from public.categories c
    left join public.products p on p.id = new.product_id
    left join public.product_variants v on v.id = new.variant_id
    left join public.brands b on b.id = coalesce(p.brand_id, new.brand_id)
   where c.id = new.category_id;

  if new.status = 'active' and (tg_op = 'INSERT' or old.status = 'draft') then
    if new.product_id is not null then
      for a in
        select pa.id, pa.user_id, pa.target_cents, pp.home_point, pp.search_radius_m
          from public.price_alerts pa
          join public.profiles_private pp on pp.user_id = pa.user_id
         where pa.product_id = new.product_id and pa.status = 'active' and pa.include_used
           and (pa.variant_id is null or pa.variant_id = new.variant_id)
           and new.price_cents <= pa.target_cents and pa.user_id <> new.seller_id
      loop
        if new.ships or (a.home_point is not null and pt is not null and extensions.st_dwithin(a.home_point, pt, a.search_radius_m)) then
          perform public.notify(a.user_id, 'target_price', format('Pre-owned %s for %s', info.title, public.format_usd(new.price_cents)),
            'A listing matches your alert.', '/market/listing/' || new.id, 'listing:' || new.id, jsonb_build_object('listing_id', new.id));
        end if;
      end loop;
    end if;

    for a in
      select distinct on (s.user_id) s.user_id, s.label
        from public.saved_searches s
        join public.profiles_private pp on pp.user_id = s.user_id
       where s.scope = 'market' and s.notify and s.user_id <> new.seller_id
         and (s.category_slug is null or s.category_slug = info.category_slug)
         and (s.brand_slug is null or s.brand_slug = info.brand_slug)
         and (s.max_cents is null or new.price_cents <= s.max_cents)
         and (nullif(btrim(s.query), '') is null or not exists (
               select 1 from unnest(regexp_split_to_array(lower(btrim(s.query)), '\s+')) w where strpos(info.haystack, w) = 0))
         and (new.ships or (pp.home_point is not null and pt is not null and extensions.st_dwithin(pp.home_point, pt, pp.search_radius_m)))
       order by s.user_id, s.created_at
    loop
      perform public.notify(a.user_id, 'nearby_listing', format('New near you: %s', info.title),
        format('%s · %s. Matches “%s”.', public.format_usd(new.price_cents),
               coalesce((select area_label from public.listing_locations where listing_id = new.id), 'Ships'), a.label),
        '/market/listing/' || new.id, 'listing:' || new.id, jsonb_build_object('listing_id', new.id));
    end loop;
  elsif tg_op = 'UPDATE' and new.status in ('pending', 'sold') and old.status is distinct from new.status then
    for uid in select s.user_id from public.saved_listings s where s.listing_id = new.id and s.user_id <> new.seller_id loop
      perform public.notify(uid, 'listing_update', format('%s is %s', info.title, new.status::text),
        case new.status when 'sold' then 'A listing you saved has sold.' else 'A listing you saved is pending — the seller may still take offers.' end,
        '/market/listing/' || new.id, format('listing:%s:%s', new.id, new.status), jsonb_build_object('listing_id', new.id));
    end loop;
  end if;
  return null;
end;
$$;

-- Messages: no notification while the recipient has the thread open (viewing_until heartbeat).
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
  update public.conversation_participants
     set archived_at = null,
         last_read_message_id = case when user_id = new.sender_id then new.id else last_read_message_id end,
         last_read_at = case when user_id = new.sender_id then new.created_at else last_read_at end
   where conversation_id = new.conversation_id;

  perform realtime.send(payload, 'message', 'conversation:' || new.conversation_id::text, true);

  for p in select cp.user_id, cp.muted, cp.last_read_message_id, cp.viewing_until from public.conversation_participants cp where cp.conversation_id = new.conversation_id loop
    perform realtime.send(jsonb_build_object('conversation_id', new.conversation_id, 'message_id', new.id), 'inbox', 'user:' || p.user_id::text, true);
    if new.sender_id is not null and p.user_id <> new.sender_id and not p.muted and new.kind in ('text', 'image', 'location_share')
       and (p.viewing_until is null or p.viewing_until < now()) then
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

-- Weekly best deals (opt-in): Sunday 9 AM local, one per ISO week. Run hourly by pg_cron.
create or replace function public.send_weekly_digests(at timestamptz default now())
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  u record;
  top text;
  n integer := 0;
begin
  select string_agg(x.line, ' · ') into top from (
    select format('%s %s', p.name, coalesce('−' || ((100 - 100 * s.best_delivered_cents / nullif(d.reference_cents, 0)))::text || '%', public.format_usd(s.best_delivered_cents))) as line
      from public.deals d
      join public.product_variants v on v.id = d.variant_id
      join public.products p on p.id = v.product_id
      join public.variant_price_stats s on s.variant_id = d.variant_id
     where d.status = 'active' and d.starts_at > at - interval '7 days'
     order by d.is_staff_pick desc, (d.reference_cents - s.best_delivered_cents)::float / nullif(d.reference_cents, 0) desc nulls last
     limit 3) x;
  if top is null then
    return 0;
  end if;
  for u in
    select pp.user_id, pp.tz from public.profiles_private pp
     where (select np.in_app or np.push from public.notification_preferences np where np.user_id = pp.user_id and np.category = 'weekly_digest')
       and extract(isodow from at at time zone pp.tz) = 7 and extract(hour from at at time zone pp.tz) = 9
  loop
    perform public.notify(u.user_id, 'weekly_digest', 'This week’s best deals', top, '/deals',
      'digest:' || to_char(at at time zone u.tz, 'IYYY-IW'));
    n := n + 1;
  end loop;
  return n;
end;
$$;

select cron.schedule('weekly-digest', '0 * * * *', 'select public.send_weekly_digests()');

-- ---------------------------------------------------------------------------------------------
-- Delivery rules
-- ---------------------------------------------------------------------------------------------

-- Is `at` inside the user's quiet hours, and when do they end?
create or replace function public.quiet_window(uid uuid, at timestamptz default now())
returns table (quiet boolean, ends_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select case when not pp.quiet_enabled or pp.quiet_start = pp.quiet_end then false
              when pp.quiet_start < pp.quiet_end then lt::time >= pp.quiet_start and lt::time < pp.quiet_end
              else lt::time >= pp.quiet_start or lt::time < pp.quiet_end end,
         ((case when lt::time < pp.quiet_end then lt::date else lt::date + 1 end) + pp.quiet_end) at time zone pp.tz
    from public.profiles_private pp
    cross join lateral (select (at at time zone pp.tz) as lt) l
   where pp.user_id = uid;
$$;

-- iOS badge: unread Activity plus unread chat threads (muted/archived threads don't count).
create or replace function public.badge_count(uid uuid)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select (select count(*)::int from public.notifications n where n.user_id = uid and n.read_at is null and n.type not in ('new_message', 'summary'))
       + (select count(*)::int from public.conversation_participants me
            join public.conversations c on c.id = me.conversation_id
            left join public.conversation_participants o on o.conversation_id = c.id and o.user_id <> uid
           where me.user_id = uid and not me.muted and me.archived_at is null
             and (o.user_id is null or not public.is_blocked_between(uid, o.user_id))
             and exists (select 1 from public.messages m where m.conversation_id = c.id and m.id > me.last_read_message_id
                           and m.sender_id is distinct from uid and (m.meta ->> 'actor_id') is distinct from uid::text));
$$;

-- Turns held offers/messages whose quiet hours have ended into one summary per user.
create or replace function public.release_held_notifications(at timestamptz default now())
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  u record;
  n integer := 0;
begin
  for u in
    select h.user_id, count(*) filter (where h.type = 'offer') as offers, count(*) filter (where h.type = 'new_message') as messages,
           array_agg(h.id) as ids, max(h.held_until) as until
      from public.notifications h
     where h.push_status = 'pending' and h.held_until is not null and h.held_until <= at
     group by h.user_id
  loop
    update public.notifications set push_status = 'skipped', pushed_at = at, push_error = 'summarized' where id = any (u.ids);
    perform public.notify(u.user_id, 'summary', 'While you were away',
      concat_ws(' and ',
        case when u.offers > 0 then u.offers || case when u.offers = 1 then ' offer update' else ' offer updates' end end,
        case when u.messages > 0 then u.messages || case when u.messages = 1 then ' new message' else ' new messages' end end) || '.',
      case when u.messages > 0 then '/profile/messages' else '/profile/offers' end,
      'summary:' || to_char(u.until, 'YYYY-MM-DD"T"HH24:MI'));
    -- The summary is push-only: it shouldn't sit in Activity.
    update public.notifications set read_at = at where user_id = u.user_id and dedupe_key = 'summary:' || to_char(u.until, 'YYYY-MM-DD"T"HH24:MI');
    n := n + 1;
  end loop;
  return n;
end;
$$;

-- Claims what should be pushed now (overlapping runs never double-send; stale claims retry), and
-- applies quiet hours and the daily deal cap. Returns each push with the user's badge count.
drop function public.claim_pending_notifications(integer);
create function public.claim_pending_notifications(max_rows integer default 500, at timestamptz default now())
returns table (id uuid, user_id uuid, title text, body text, route text, badge integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  r record;
  q record;
  cap integer;
  used integer;
  sent_today jsonb := '{}';
begin
  perform public.release_held_notifications(at);
  for r in
    select x.* from public.notifications x
     where (x.push_status = 'pending' and (x.held_until is null or x.held_until <= at))
        or (x.push_status = 'sending' and x.pushed_at < at - interval '10 minutes')
     order by x.created_at
     limit max_rows
       for update skip locked
  loop
    select * into q from public.quiet_window(r.user_id, at);
    if coalesce(q.quiet, false) and r.type not in ('summary') then
      if r.type in ('offer', 'new_message') then
        update public.notifications n set held_until = q.ends_at where n.id = r.id;
      else
        update public.notifications n set push_status = 'skipped', pushed_at = at, push_error = 'quiet_hours' where n.id = r.id;
      end if;
      continue;
    end if;
    if r.type in ('price_drop', 'brand_deal', 'saved_search', 'nearby_listing') then
      cap := (select pp.daily_deal_cap from public.profiles_private pp where pp.user_id = r.user_id);
      if cap is not null then
        used := coalesce((sent_today ->> r.user_id::text)::int,
          (select count(*)::int from public.notifications s
             join public.profiles_private pp on pp.user_id = s.user_id
            where s.user_id = r.user_id and s.push_status in ('sent', 'sending')
              and s.type in ('price_drop', 'brand_deal', 'saved_search', 'nearby_listing')
              and (s.pushed_at at time zone pp.tz)::date = (at at time zone pp.tz)::date));
        if used >= cap then
          update public.notifications n set push_status = 'skipped', pushed_at = at, push_error = 'daily_cap' where n.id = r.id;
          continue;
        end if;
        sent_today := sent_today || jsonb_build_object(r.user_id::text, used + 1);
      end if;
    end if;
    update public.notifications n set push_status = 'sending', pushed_at = at where n.id = r.id;
    id := r.id; user_id := r.user_id; title := r.title; body := r.body; route := r.route; badge := public.badge_count(r.user_id);
    return next;
  end loop;
end;
$$;

revoke execute on function public.claim_pending_notifications(integer, timestamptz), public.release_held_notifications(timestamptz),
  public.quiet_window(uuid, timestamptz), public.badge_count(uuid), public.send_weekly_digests(timestamptz),
  public.notify_saved_price_drop() from public, anon, authenticated;
grant execute on function public.claim_pending_notifications(integer, timestamptz) to service_role;

-- ---------------------------------------------------------------------------------------------
-- Client RPCs
-- ---------------------------------------------------------------------------------------------

create or replace function public.my_notification_settings()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'categories', (select jsonb_object_agg(c, (select to_jsonb(p) from public.notification_pref(auth.uid(), c) p))
                     from unnest(array['price_drop', 'target_price', 'brand_deal', 'saved_search', 'weekly_digest',
                                       'offer', 'new_message', 'nearby_listing', 'listing_update']) c),
    'quiet_enabled', pp.quiet_enabled, 'quiet_start', to_char(pp.quiet_start, 'HH24:MI'), 'quiet_end', to_char(pp.quiet_end, 'HH24:MI'),
    'tz', pp.tz, 'daily_deal_cap', pp.daily_deal_cap, 'radius_m', pp.search_radius_m)
    from public.profiles_private pp where pp.user_id = auth.uid();
$$;

-- The design's toggles turn a category fully on or off (Activity and push together).
create or replace function public.set_notification_preference(category text, enabled boolean)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.notification_preferences (user_id, category, push, in_app)
  values (auth.uid(), set_notification_preference.category, enabled, enabled)
  on conflict (user_id, category) do update set push = excluded.push, in_app = excluded.in_app, updated_at = now();
$$;

create or replace function public.set_notification_settings(
  quiet_enabled boolean default null, quiet_start text default null, quiet_end text default null,
  tz text default null, daily_deal_cap integer default null, clear_cap boolean default false)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'sign in required' using errcode = '42501';
  end if;
  if set_notification_settings.tz is not null and not exists (select 1 from pg_catalog.pg_timezone_names z where z.name = set_notification_settings.tz) then
    raise exception 'unknown time zone' using errcode = '22023';
  end if;
  update public.profiles_private pp set
    quiet_enabled = coalesce(set_notification_settings.quiet_enabled, pp.quiet_enabled),
    quiet_start = coalesce(set_notification_settings.quiet_start::time, pp.quiet_start),
    quiet_end = coalesce(set_notification_settings.quiet_end::time, pp.quiet_end),
    tz = coalesce(set_notification_settings.tz, pp.tz),
    daily_deal_cap = case when clear_cap then null else coalesce(set_notification_settings.daily_deal_cap, pp.daily_deal_cap) end,
    updated_at = now()
  where pp.user_id = auth.uid();
end;
$$;

-- Thread on screen: renew every 30 s; `on => false` when leaving.
create or replace function public.set_viewing(conversation uuid, viewing boolean default true)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.conversation_participants
     set viewing_until = case when viewing then now() + interval '45 seconds' end
   where conversation_id = conversation and user_id = auth.uid();
$$;

create or replace function public.my_badge_count()
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select public.badge_count(auth.uid());
$$;

revoke execute on function public.my_notification_settings(), public.set_notification_preference(text, boolean),
  public.set_notification_settings(boolean, text, text, text, integer, boolean), public.set_viewing(uuid, boolean), public.my_badge_count() from public, anon;
grant execute on function public.my_notification_settings(), public.set_notification_preference(text, boolean),
  public.set_notification_settings(boolean, text, text, text, integer, boolean), public.set_viewing(uuid, boolean), public.my_badge_count() to authenticated;

-- ---------------------------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------------------------

alter table public.notification_preferences enable row level security;
alter table public.push_receipts enable row level security;  -- service role only: no policies

create policy "owners read notification preferences" on public.notification_preferences for select to authenticated
  using ((select auth.uid()) = user_id);

revoke all on public.notification_preferences, public.push_receipts from anon, authenticated;
grant select on public.notification_preferences to authenticated;
grant select (quiet_enabled, quiet_start, quiet_end, tz, daily_deal_cap) on public.profiles_private to authenticated;
