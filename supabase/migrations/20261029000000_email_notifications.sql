-- Missed-message emails (design: NotifPrefs › Delivery › "Email me what I miss").
-- Push stays the main channel. Email is a safety net, transactional only:
--   offer, new_message → emailed when still unread an hour later, if the user's switch is on; at most
--                        one email per conversation per 24 h; the newest notification in a thread wins;
--                        held until quiet hours end; never for muted threads
--   system             → account notices (listing removed/restored, suspension), emailed at once
-- Nothing else is ever emailed. Addresses that bounce or complain are suppressed (Resend webhook),
-- and Apple private relay addresses are skipped until the domain is registered with Apple.
-- Sending happens in the dispatch-emails edge function; the rules live here so they're testable.

-- ---------------------------------------------------------------------------------------------
-- Columns and tables
-- ---------------------------------------------------------------------------------------------

alter table public.notifications
  add column email_status public.push_status,  -- null = never emailed (other types, or older rows)
  add column email_at     timestamptz,
  add column email_error  text;

create index notifications_email_pending on public.notifications (created_at) where email_status in ('pending', 'sending');

alter table public.profiles_private
  add column email_missed boolean not null default true,
  -- Secret per user for the unsubscribe link (one-click, no sign-in). Never exposed to clients.
  add column email_token  uuid not null default gen_random_uuid();

create unique index profiles_private_email_token on public.profiles_private (email_token);

create table public.email_suppressions (
  email      text primary key check (email = lower(email)),
  reason     text not null check (reason in ('bounced', 'complained')),
  created_at timestamptz not null default now()
);

-- Offers, messages and account notices are queued for a possible email when they're created.
create or replace function public.notifications_queue_email()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.type in ('offer', 'new_message', 'system') then
    new.email_status := 'pending';
  end if;
  return new;
end;
$$;

create trigger notifications_queue_email before insert on public.notifications
  for each row execute function public.notifications_queue_email();

-- ---------------------------------------------------------------------------------------------
-- Delivery rules
-- ---------------------------------------------------------------------------------------------

-- Claims what should be emailed now. Overlapping runs never double-claim; claims older than
-- 10 minutes (a crashed run) are retried, and Resend's idempotency key stops a second send.
create or replace function public.claim_pending_emails(max_rows integer default 50, at timestamptz default now())
returns table (id uuid, user_id uuid, email text, kind text, title text, body text, route text,
               listing_title text, unread integer, token uuid)
language plpgsql
security definer
set search_path = ''
as $$
declare
  r       record;
  u       record;
  q       record;
  p_found boolean;
  p_read  timestamptz;
  p_last  bigint;
  p_muted boolean;
  conv    uuid;
  reason  text;
  claimed uuid[] := '{}';
begin
  for r in
    select x.* from public.notifications x
     where (x.email_status = 'pending' and (x.type = 'system' or x.created_at <= at - interval '1 hour'))
        or (x.email_status = 'sending' and x.email_at < at - interval '10 minutes')
     order by x.created_at desc
     limit max_rows * 4
       for update skip locked
  loop
    exit when cardinality(claimed) >= max_rows;
    reason := null;
    p_found := null; p_read := null; p_last := 0; p_muted := false;
    conv := substring(r.route from '^/conversation/([0-9a-f-]{36})$')::uuid;
    select pp.email_missed, pp.email_token, lower(au.email) as email into u
      from public.profiles_private pp join auth.users au on au.id = pp.user_id
     where pp.user_id = r.user_id;

    if r.created_at < at - interval '2 days' then
      reason := 'stale';
    elsif u.email is null or u.email = '' then
      reason := 'no_email';
    elsif u.email like '%@privaterelay.appleid.com' then
      reason := 'apple_relay';
    elsif exists (select 1 from public.email_suppressions s where s.email = u.email) then
      reason := 'suppressed';
    elsif r.type <> 'system' then
      select true, cp.last_read_at, cp.last_read_message_id, cp.muted into p_found, p_read, p_last, p_muted
        from public.conversation_participants cp where cp.conversation_id = conv and cp.user_id = r.user_id;
      if not u.email_missed then
        reason := 'preference';
      elsif conv is null or p_found is null then
        reason := 'no_thread';
      elsif r.read_at is not null or p_read >= r.created_at then
        reason := 'read';
      elsif p_muted then
        reason := 'muted';
      elsif conv = any (claimed) then
        reason := 'grouped';
      elsif exists (select 1 from public.notifications s
                     where s.user_id = r.user_id and s.route = r.route and s.id <> r.id
                       and s.email_status in ('sent', 'sending') and s.email_at > at - interval '24 hours') then
        reason := 'daily_limit';
      else
        select * into q from public.quiet_window(r.user_id, at);
        if coalesce(q.quiet, false) then
          continue;  -- stays pending; sent once quiet hours end
        end if;
      end if;
    end if;

    if reason is not null then
      update public.notifications n set email_status = 'skipped', email_at = at, email_error = reason where n.id = r.id;
      continue;
    end if;

    update public.notifications n set email_status = 'sending', email_at = at, email_error = null where n.id = r.id;
    claimed := claimed || coalesce(conv, r.id);
    id := r.id; user_id := r.user_id; email := u.email; kind := r.type; title := r.title; body := r.body;
    route := r.route; token := u.email_token;
    listing_title := (select public.listing_label(c.listing_id) from public.conversations c where c.id = conv);
    unread := case when conv is null then 0 else
      (select count(*)::int from public.messages m
        where m.conversation_id = conv and m.id > p_last
          and m.sender_id is distinct from r.user_id and (m.meta ->> 'actor_id') is distinct from r.user_id::text) end;
    return next;
  end loop;
end;
$$;

-- One-click unsubscribe (email footer and List-Unsubscribe). Unknown tokens are a quiet no-op.
create or replace function public.unsubscribe_email(token uuid)
returns boolean
language sql
security definer
set search_path = ''
as $$
  with u as (
    update public.profiles_private pp set email_missed = false, updated_at = now()
     where pp.email_token = unsubscribe_email.token
    returning 1)
  select exists (select 1 from u);
$$;

-- Resend webhook: hard bounces and spam complaints stop all email to that address.
create or replace function public.suppress_email(address text, why text)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.email_suppressions (email, reason) values (lower(btrim(address)), why)
  on conflict (email) do update set reason = excluded.reason, created_at = now();
$$;

-- Every 5 minutes, POST dispatch-emails when something could be due (same Vault secrets as push).
create or replace function public.trigger_email_dispatch()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  url text := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url');
  key text := (select decrypted_secret from vault.decrypted_secrets where name = 'dispatch_key');
begin
  if url is null or key is null then
    return;
  end if;
  if exists (select 1 from public.notifications
              where (email_status = 'pending' and (type = 'system' or created_at <= now() - interval '1 hour'))
                 or (email_status = 'sending' and email_at < now() - interval '10 minutes')) then
    perform net.http_post(url || '/functions/v1/dispatch-emails',
                          headers => jsonb_build_object('Authorization', 'Bearer ' || key, 'Content-Type', 'application/json'),
                          body => '{}'::jsonb);
  end if;
end;
$$;

revoke execute on function public.notifications_queue_email(), public.claim_pending_emails(integer, timestamptz),
  public.unsubscribe_email(uuid), public.suppress_email(text, text), public.trigger_email_dispatch() from public, anon, authenticated;
grant execute on function public.claim_pending_emails(integer, timestamptz), public.unsubscribe_email(uuid),
  public.suppress_email(text, text) to service_role;

select cron.schedule('dispatch-emails', '*/5 * * * *', 'select public.trigger_email_dispatch()');

-- ---------------------------------------------------------------------------------------------
-- Client RPCs: the settings screen reads and sets the switch.
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
    'tz', pp.tz, 'daily_deal_cap', pp.daily_deal_cap, 'radius_m', pp.search_radius_m, 'email_missed', pp.email_missed)
    from public.profiles_private pp where pp.user_id = auth.uid();
$$;

drop function public.set_notification_settings(boolean, text, text, text, integer, boolean);
create function public.set_notification_settings(
  quiet_enabled boolean default null, quiet_start text default null, quiet_end text default null,
  tz text default null, daily_deal_cap integer default null, clear_cap boolean default false,
  email_missed boolean default null)
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
    email_missed = coalesce(set_notification_settings.email_missed, pp.email_missed),
    updated_at = now()
  where pp.user_id = auth.uid();
end;
$$;

revoke execute on function public.set_notification_settings(boolean, text, text, text, integer, boolean, boolean) from public, anon;
grant execute on function public.set_notification_settings(boolean, text, text, text, integer, boolean, boolean) to authenticated;

-- ---------------------------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------------------------

alter table public.email_suppressions enable row level security;  -- service role only: no policies
revoke all on public.email_suppressions from anon, authenticated;
grant select (email_missed) on public.profiles_private to authenticated;
