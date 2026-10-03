-- Phase 5: saves, follows, saved searches, price alerts, push tokens and notifications (§4.4,
-- §4.7, §11). Everything here is owner-only; notifications are written server-side only and also
-- back the in-app Activity feed. Listing saves arrive with listings (Phase 6).

create type public.alert_status as enum ('active', 'paused');
create type public.push_status as enum ('pending', 'sending', 'sent', 'skipped', 'failed');

-- ---------------------------------------------------------------------------------------------
-- Saves and follows (separate tables keep real foreign keys and cascades)
-- ---------------------------------------------------------------------------------------------

create table public.saved_products (
  user_id    uuid not null references auth.users (id) on delete cascade,
  product_id uuid not null references public.products (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, product_id)
);

create table public.saved_deals (
  user_id    uuid not null references auth.users (id) on delete cascade,
  deal_id    uuid not null references public.deals (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, deal_id)
);

create table public.brand_follows (
  user_id    uuid not null references auth.users (id) on delete cascade,
  brand_id   uuid not null references public.brands (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, brand_id)
);

create index brand_follows_brand on public.brand_follows (brand_id);

-- ---------------------------------------------------------------------------------------------
-- Saved searches (deal searches now; marketplace scope arrives in Phase 6)
-- ---------------------------------------------------------------------------------------------

create table public.saved_searches (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users (id) on delete cascade,
  scope         text not null default 'deals' check (scope in ('deals')),
  label         text not null check (char_length(btrim(label)) between 1 and 80),
  query         text check (char_length(query) <= 80),
  category_slug text,
  brand_slug    text,
  max_cents     integer check (max_cents > 0),
  filters       jsonb not null default '{}' check (jsonb_typeof(filters) = 'object'),
  notify        boolean not null default true,
  created_at    timestamptz not null default now()
);

create index saved_searches_user on public.saved_searches (user_id, created_at desc);
create index saved_searches_notify on public.saved_searches (category_slug, brand_slug) where notify;

-- ---------------------------------------------------------------------------------------------
-- Price alerts
-- ---------------------------------------------------------------------------------------------

create table public.price_alerts (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null references auth.users (id) on delete cascade,
  product_id          uuid not null references public.products (id) on delete cascade,
  -- null = any variant of the product
  variant_id          uuid references public.product_variants (id) on delete cascade,
  target_cents        integer not null check (target_cents > 0),
  include_new         boolean not null default true,
  -- Seam for Phase 6 (pre-owned listings within radius).
  include_used        boolean not null default false,
  status              public.alert_status not null default 'active',
  last_notified_at    timestamptz,
  last_notified_cents integer,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create unique index price_alerts_one_per_target
  on public.price_alerts (user_id, product_id, coalesce(variant_id, '00000000-0000-0000-0000-000000000000'::uuid));
create index price_alerts_product_active on public.price_alerts (product_id) where status = 'active';

create trigger price_alerts_set_updated_at before update on public.price_alerts
  for each row execute function public.set_updated_at();

-- Editing the target re-arms the alert.
create or replace function public.price_alerts_rearm()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.target_cents is distinct from old.target_cents or (new.status = 'active' and old.status = 'paused') then
    new.last_notified_cents := null;
    new.last_notified_at := null;
  end if;
  return new;
end;
$$;

create trigger price_alerts_rearm before update on public.price_alerts
  for each row execute function public.price_alerts_rearm();

-- ---------------------------------------------------------------------------------------------
-- Push tokens + notifications
-- ---------------------------------------------------------------------------------------------

create table public.push_tokens (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users (id) on delete cascade,
  expo_token   text not null unique check (expo_token ~ '^Expo(nent)?PushToken\[[A-Za-z0-9_-]+\]$'),
  device_id    text,
  platform     text not null check (platform in ('ios', 'android')),
  last_seen_at timestamptz not null default now(),
  revoked_at   timestamptz,
  created_at   timestamptz not null default now()
);

create index push_tokens_user_active on public.push_tokens (user_id) where revoked_at is null;

create table public.notifications (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  type        text not null check (type in ('price_alert', 'brand_deal', 'saved_search', 'system')),
  title       text not null check (char_length(title) <= 120),
  body        text not null check (char_length(body) <= 240),
  -- In-app route the notification opens, e.g. /deals/product/joola-perseus-pro-iv
  route       text check (route ~ '^/[A-Za-z0-9/_?=&%.-]*$'),
  data        jsonb not null default '{}',
  dedupe_key  text not null,
  created_at  timestamptz not null default now(),
  read_at     timestamptz,
  push_status public.push_status not null default 'pending',
  pushed_at   timestamptz,
  push_error  text,
  constraint notifications_dedupe unique (user_id, dedupe_key)
);

create index notifications_user_time on public.notifications (user_id, created_at desc);
create index notifications_pending on public.notifications (created_at) where push_status = 'pending';

-- Server-side insert helper: deduplicated, never raises on a repeat.
create or replace function public.notify(uid uuid, kind text, title text, body text, route text, dedupe text, extra jsonb default '{}')
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.notifications (user_id, type, title, body, route, dedupe_key, data)
  values (uid, kind, title, body, route, dedupe, extra)
  on conflict on constraint notifications_dedupe do nothing;
$$;

revoke execute on function public.notify(uuid, text, text, text, text, text, jsonb) from public, anon, authenticated;

-- Atomically claims pending notifications for one dispatch run, so overlapping runs never send
-- the same notification twice. Claims older than 10 minutes (a crashed run) are retried.
create or replace function public.claim_pending_notifications(max_rows integer default 500)
returns table (id uuid, user_id uuid, title text, body text, route text)
language sql
security definer
set search_path = ''
as $$
  update public.notifications n
     set push_status = 'sending', pushed_at = now()
   where n.id in (select x.id from public.notifications x
                   where x.push_status = 'pending' or (x.push_status = 'sending' and x.pushed_at < now() - interval '10 minutes')
                   order by x.created_at
                   limit max_rows
                   for update skip locked)
  returning n.id, n.user_id, n.title, n.body, n.route;
$$;

revoke execute on function public.claim_pending_notifications(integer) from public, anon, authenticated;
grant execute on function public.claim_pending_notifications(integer) to service_role;

-- ---------------------------------------------------------------------------------------------
-- Price alert evaluation — runs whenever a variant's stats refresh. One notification per drop:
-- a repeat only fires when the price falls below the last notified price.
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
    -- Best price across the alert's scope (any variant, or the one it names).
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
        a.user_id, 'price_alert',
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

revoke execute on function public.evaluate_price_alerts(uuid) from public, anon, authenticated;

create or replace function public.evaluate_alerts_on_stats()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.evaluate_price_alerts(new.variant_id);
  return null;
end;
$$;

revoke execute on function public.evaluate_alerts_on_stats() from public, anon, authenticated;

create trigger variant_price_stats_evaluate_alerts after insert or update on public.variant_price_stats
  for each row execute function public.evaluate_alerts_on_stats();

-- New deals notify followers of the brand and matching saved searches (once per deal).
create or replace function public.notify_new_deal()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  d   record;
  uid uuid;
begin
  select p.slug as product_slug, p.name as product_name, b.id as brand_id, b.slug as brand_slug, b.name as brand_name,
         c.slug as category_slug, r.delivered_cents
    into d
    from public.product_variants v
    join public.products p on p.id = v.product_id
    join public.brands b on b.id = p.brand_id
    join public.categories c on c.id = p.category_id
    left join public.variant_offer_ranking r on r.variant_id = v.id and r.rank = 1
   where v.id = new.variant_id;

  for uid in select bf.user_id from public.brand_follows bf where bf.brand_id = d.brand_id loop
    perform public.notify(uid, 'brand_deal', format('New %s deal', d.brand_name),
      format('%s: %s', d.product_name, new.headline), '/deals/product/' || d.product_slug, 'deal:' || new.id,
      jsonb_build_object('deal_id', new.id));
  end loop;

  for uid in
    select distinct s.user_id from public.saved_searches s
     where s.notify and s.scope = 'deals'
       and (s.category_slug is null or s.category_slug = d.category_slug)
       and (s.brand_slug is null or s.brand_slug = d.brand_slug)
       and (s.max_cents is null or d.delivered_cents <= s.max_cents)
       and (s.category_slug is not null or s.brand_slug is not null)
  loop
    perform public.notify(uid, 'saved_search', 'New deal for your saved search',
      format('%s %s: %s', d.brand_name, d.product_name, new.headline), '/deals/product/' || d.product_slug, 'deal:' || new.id,
      jsonb_build_object('deal_id', new.id));
  end loop;
  return null;
end;
$$;

revoke execute on function public.notify_new_deal() from public, anon, authenticated;

create trigger deals_notify_new after insert on public.deals
  for each row when (new.status = 'active') execute function public.notify_new_deal();

-- ---------------------------------------------------------------------------------------------
-- Client RPCs
-- ---------------------------------------------------------------------------------------------

-- Registers (or moves) a device token to the caller. A token belongs to one user at a time.
create or replace function public.register_push_token(token text, platform text, device text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'sign in first' using errcode = '42501';
  end if;
  insert into public.push_tokens (user_id, expo_token, platform, device_id)
  values (auth.uid(), token, platform, device)
  on conflict (expo_token) do update
    set user_id = auth.uid(), platform = excluded.platform, device_id = excluded.device_id,
        last_seen_at = now(), revoked_at = null;
end;
$$;

create or replace function public.mark_notifications_read(ids uuid[] default null)
returns integer
language sql
security definer
set search_path = ''
as $$
  with updated as (
    update public.notifications set read_at = now()
     where user_id = auth.uid() and read_at is null and (ids is null or id = any (ids))
    returning 1
  )
  select count(*)::int from updated;
$$;

revoke execute on function public.register_push_token(text, text, text), public.mark_notifications_read(uuid[]) from public, anon;
grant execute on function public.register_push_token(text, text, text), public.mark_notifications_read(uuid[]) to authenticated;

-- ---------------------------------------------------------------------------------------------
-- RLS + privileges
-- ---------------------------------------------------------------------------------------------

alter table public.saved_products enable row level security;
alter table public.saved_deals enable row level security;
alter table public.brand_follows enable row level security;
alter table public.saved_searches enable row level security;
alter table public.price_alerts enable row level security;
alter table public.push_tokens enable row level security;
alter table public.notifications enable row level security;

do $$
declare
  t text;
begin
  foreach t in array array['saved_products', 'saved_deals', 'brand_follows', 'saved_searches', 'price_alerts'] loop
    execute format('create policy "owners read %1$s" on public.%1$I for select to authenticated using ((select auth.uid()) = user_id)', t);
    execute format('create policy "owners insert %1$s" on public.%1$I for insert to authenticated with check ((select auth.uid()) = user_id)', t);
    execute format('create policy "owners update %1$s" on public.%1$I for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id)', t);
    execute format('create policy "owners delete %1$s" on public.%1$I for delete to authenticated using ((select auth.uid()) = user_id)', t);
  end loop;
end;
$$;

create policy "owners read push tokens" on public.push_tokens for select to authenticated using ((select auth.uid()) = user_id);
create policy "owners delete push tokens" on public.push_tokens for delete to authenticated using ((select auth.uid()) = user_id);
create policy "owners read notifications" on public.notifications for select to authenticated using ((select auth.uid()) = user_id);

revoke all on public.saved_products, public.saved_deals, public.brand_follows, public.saved_searches, public.price_alerts,
  public.push_tokens, public.notifications from anon, authenticated;
grant select, insert, delete on public.saved_products, public.saved_deals, public.brand_follows to authenticated;
grant select, insert, update, delete on public.saved_searches to authenticated;
grant select, insert, delete on public.price_alerts to authenticated;
grant update (target_cents, include_new, include_used, status) on public.price_alerts to authenticated;
grant select, delete on public.push_tokens to authenticated;
grant select (id, type, title, body, route, data, created_at, read_at) on public.notifications to authenticated;

-- ---------------------------------------------------------------------------------------------
-- Dispatch schedule: every minute, POST the dispatch-notifications function. The project URL and
-- service key live in Vault (secrets 'project_url' and 'dispatch_key'); without them it no-ops.
-- ---------------------------------------------------------------------------------------------

create extension if not exists pg_net;

create or replace function public.trigger_dispatch()
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
  if exists (select 1 from public.notifications where push_status = 'pending') then
    perform net.http_post(url || '/functions/v1/dispatch-notifications',
                          headers => jsonb_build_object('Authorization', 'Bearer ' || key, 'Content-Type', 'application/json'),
                          body => '{}'::jsonb);
  end if;
end;
$$;

revoke execute on function public.trigger_dispatch() from public, anon, authenticated;

select cron.schedule('dispatch-notifications', '* * * * *', 'select public.trigger_dispatch()');
