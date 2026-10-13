-- Seller reviews (owner decisions Oct 13, 2026: buyer → seller only; 1–5 stars and an optional
-- comment; open for 30 days after the sale; the average shows from the first review, with its count).
--   Buyer linking   Mark as sold may name the buyer (design: ManageListing "Who's buying?"). Only
--                   someone who messaged about the listing qualifies; the server checks it.
--   Reviews         seller_reviews: one per sold listing, written by its linked buyer through RPCs only.
--   Notifications   one category, `review`: "rate your purchase" to the buyer when the sale is linked,
--                   "you got a review" to the seller. Push like everything else; emailed when still
--                   unread an hour later (the "Email me what I miss" switch, quiet hours, suppressions).
--   Moderation      reviews can be reported; staff hide them from the Reports queue.
-- The table could take seller → buyer reviews later (reviewer/seller columns), but nothing writes them.

-- ---------------------------------------------------------------------------------------------
-- Table
-- ---------------------------------------------------------------------------------------------

create table public.seller_reviews (
  id            uuid primary key default gen_random_uuid(),
  listing_id    uuid not null unique references public.listings (id) on delete cascade,
  seller_id     uuid not null references auth.users (id) on delete cascade,
  -- Set null when the reviewer deletes their account: the rating stays, shown as "Former member".
  reviewer_id   uuid references auth.users (id) on delete set null,
  rating        smallint not null check (rating between 1 and 5),
  body          text check (char_length(body) between 1 and 500),
  hidden_at     timestamptz,
  hidden_reason text check (char_length(hidden_reason) <= 500),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index seller_reviews_seller on public.seller_reviews (seller_id, created_at desc) where hidden_at is null;
create index seller_reviews_reviewer on public.seller_reviews (reviewer_id);

create trigger seller_reviews_set_updated_at before update on public.seller_reviews
  for each row execute function public.set_updated_at();
create trigger seller_reviews_guard_suspended before insert or update of rating, body on public.seller_reviews
  for each row execute function public.guard_suspended();

-- RPC only: public reads go through seller_reviews_for(), writes through submit/delete_review().
alter table public.seller_reviews enable row level security;
revoke all on public.seller_reviews from anon, authenticated;

-- How long the buyer has to review (and edit or delete) after the sale.
create or replace function public.review_window()
returns interval
language sql
immutable
set search_path = ''
as $$
  select interval '30 days';
$$;

-- ---------------------------------------------------------------------------------------------
-- Notifications: the `review` category (push, Activity, email)
-- ---------------------------------------------------------------------------------------------

alter table public.notifications drop constraint notifications_type_check;
alter table public.notifications add constraint notifications_type_check check (type in (
  'price_drop', 'target_price', 'brand_deal', 'saved_search', 'weekly_digest',
  'offer', 'new_message', 'nearby_listing', 'listing_update', 'review', 'summary', 'system'));

alter table public.notification_preferences drop constraint notification_preferences_category_check;
alter table public.notification_preferences add constraint notification_preferences_category_check check (category in (
  'price_drop', 'target_price', 'brand_deal', 'saved_search', 'weekly_digest',
  'offer', 'new_message', 'nearby_listing', 'listing_update', 'review'));

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
                                       'offer', 'new_message', 'nearby_listing', 'listing_update', 'review']) c),
    'quiet_enabled', pp.quiet_enabled, 'quiet_start', to_char(pp.quiet_start, 'HH24:MI'), 'quiet_end', to_char(pp.quiet_end, 'HH24:MI'),
    'tz', pp.tz, 'daily_deal_cap', pp.daily_deal_cap, 'radius_m', pp.search_radius_m, 'email_missed', pp.email_missed)
    from public.profiles_private pp where pp.user_id = auth.uid();
$$;

create or replace function public.notifications_queue_email()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.type in ('offer', 'new_message', 'review', 'system') then
    new.email_status := 'pending';
  end if;
  return new;
end;
$$;

-- As before, plus `review`: emailed when still unread an hour later, if the switch is on and outside
-- quiet hours. Review notifications aren't tied to a thread, so the thread rules don't apply.
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
    elsif r.type = 'review' then
      if not u.email_missed then
        reason := 'preference';
      elsif r.read_at is not null then
        reason := 'read';
      else
        select * into q from public.quiet_window(r.user_id, at);
        if coalesce(q.quiet, false) then
          continue;
        end if;
      end if;
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
    listing_title := coalesce((select public.listing_label(c.listing_id) from public.conversations c where c.id = conv),
                              public.listing_label(nullif(r.data ->> 'listing_id', '')::uuid));
    unread := case when conv is null then 0 else
      (select count(*)::int from public.messages m
        where m.conversation_id = conv and m.id > p_last
          and m.sender_id is distinct from r.user_id and (m.meta ->> 'actor_id') is distinct from r.user_id::text) end;
    return next;
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- Buyer linking on Mark as sold
-- ---------------------------------------------------------------------------------------------

-- Seller only: people who messaged about the listing, the accepted offer's buyer first.
create or replace function public.listing_buyer_candidates(listing uuid)
returns table (buyer_id uuid, name text, avatar_path text, detail text, accepted boolean)
language sql
stable
security definer
set search_path = ''
as $$
  select c.buyer_id, pr.display_name, pr.avatar_path,
         case when ag.amount_cents is not null then 'Offer accepted · ' || public.format_usd(ag.amount_cents)
              when lo.amount_cents is not null then 'Latest offer ' || public.format_usd(lo.amount_cents)
              else 'Messaged about this listing' end,
         ag.amount_cents is not null
    from public.conversations c
    join public.listings l on l.id = c.listing_id and l.seller_id = auth.uid()
    join public.profiles pr on pr.id = c.buyer_id
    left join lateral (select a.amount_cents from public.agreements a
                        where a.listing_id = c.listing_id and a.buyer_id = c.buyer_id order by a.created_at desc limit 1) ag on true
    left join lateral (select o.amount_cents from public.marketplace_offers o
                        where o.conversation_id = c.id and not o.auto_declined order by o.created_at desc limit 1) lo on true
   where c.listing_id = listing_buyer_candidates.listing and c.last_message_id is not null
   order by (ag.amount_cents is not null) desc, c.last_message_at desc nulls last
   limit 20;
$$;

-- As before, plus: a named buyer must have messaged about the listing, and is asked to rate the sale
-- (notification, and the sold line in their thread carries buyer_id for the Rate seller button).
create or replace function public.set_listing_status(listing uuid, status text, buyer uuid default null, sold_price integer default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  l public.listings;
  seller_name text;
  linked uuid;
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
  linked := case when set_listing_status.status = 'sold' then buyer end;
  if linked is not null and not exists (select 1 from public.conversations c where c.listing_id = l.id and c.buyer_id = linked) then
    raise exception 'Pick someone who messaged you about this listing.' using errcode = '22023';
  end if;
  update public.listings
     set status = set_listing_status.status::public.listing_status,
         sold_to_user_id = linked,
         sold_price_cents = case when set_listing_status.status = 'sold' then coalesce(sold_price, l.price_cents) end,
         sold_at = case when set_listing_status.status = 'sold' then now() end
   where id = listing;
  seller_name := public.first_name(l.seller_id);
  if set_listing_status.status <> l.status::text then
    insert into public.messages (conversation_id, sender_id, kind, body, meta)
    select c.id, null, 'status_event',
           seller_name || case set_listing_status.status
             when 'active' then ' marked this listing available again'
             when 'removed' then ' removed this listing'
             else ' marked this listing ' || initcap(set_listing_status.status) end,
           jsonb_build_object('status', set_listing_status.status, 'actor_id', l.seller_id)
             || case when linked is not null and c.buyer_id = linked then jsonb_build_object('buyer_id', linked, 'listing_id', l.id) else '{}' end
      from public.conversations c
     where c.listing_id = listing and c.last_message_id is not null;
  end if;
  if linked is not null then
    perform public.notify(linked, 'review',
      format('How was buying %s from %s?', public.listing_label(l.id), seller_name),
      'Rate your purchase. It helps other players buy with confidence.',
      '/rate-seller/' || l.id, 'review-ask:' || l.id, jsonb_build_object('listing_id', l.id));
  end if;
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- Reviews: write, read
-- ---------------------------------------------------------------------------------------------

-- The Rate seller sheet: null unless the caller is the listing's linked buyer.
create or replace function public.my_review(listing uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
           'listing_id', l.id,
           'title', public.listing_label(l.id),
           'seller_id', l.seller_id,
           'seller_name', coalesce(pr.display_name, 'the seller'),
           'sold_at', l.sold_at,
           'closes_at', l.sold_at + public.review_window(),
           'open', l.sold_at > now() - public.review_window(),
           'review', (select jsonb_build_object('rating', r.rating, 'body', r.body, 'hidden', r.hidden_at is not null)
                        from public.seller_reviews r where r.listing_id = l.id and r.reviewer_id = auth.uid()))
    from public.listings l
    left join public.profiles pr on pr.id = l.seller_id
   where l.id = listing and l.status = 'sold' and l.sold_to_user_id = auth.uid();
$$;

-- Create or update the caller's review of a purchase. The seller hears about the first version only.
create or replace function public.submit_review(listing uuid, rating integer, body text default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid  uuid := auth.uid();
  l    public.listings;
  txt  text := nullif(btrim(submit_review.body), '');
  rid  uuid;
  fresh boolean;
begin
  if uid is null then
    raise exception 'sign in required' using errcode = '42501';
  end if;
  select * into l from public.listings where id = listing;
  if l.id is null or l.status <> 'sold' or l.sold_to_user_id is distinct from uid then
    raise exception 'Only the buyer of a sold item can review it.' using errcode = '42501';
  end if;
  if l.sold_at <= now() - public.review_window() then
    raise exception 'Reviews close 30 days after the sale.' using errcode = '22023', hint = 'window_closed';
  end if;
  if rating is null or rating not between 1 and 5 then
    raise exception 'Choose 1 to 5 stars.' using errcode = '22023';
  end if;
  if char_length(txt) > 500 then
    raise exception 'Keep the comment under 500 characters.' using errcode = '22023';
  end if;
  perform public.check_listing_text(null, txt);

  insert into public.seller_reviews (listing_id, seller_id, reviewer_id, rating, body)
  values (l.id, l.seller_id, uid, rating, txt)
  on conflict (listing_id) do update set rating = excluded.rating, body = excluded.body
    where public.seller_reviews.reviewer_id = uid
  returning id, (xmax = 0) into rid, fresh;
  if rid is null then
    raise exception 'Only the buyer of a sold item can review it.' using errcode = '42501';
  end if;

  if fresh then
    perform public.notify(l.seller_id, 'review',
      format('%s left you a %s-star review', public.first_name(uid), rating),
      coalesce(left(txt, 200), 'For ' || public.listing_label(l.id) || '.'),
      '/seller/' || l.seller_id, 'review:' || rid, jsonb_build_object('review_id', rid, 'listing_id', l.id));
  end if;
  return rid;
end;
$$;

create or replace function public.delete_review(listing uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (select 1 from public.listings l
                  where l.id = listing and l.sold_to_user_id = auth.uid() and l.sold_at > now() - public.review_window()) then
    raise exception 'Reviews can be deleted for 30 days after the sale.' using errcode = '22023', hint = 'window_closed';
  end if;
  delete from public.seller_reviews r where r.listing_id = listing and r.reviewer_id = auth.uid();
end;
$$;

-- Public: a seller's average, count and newest visible reviews (hidden ones never show or count).
create or replace function public.seller_reviews_for(seller uuid, max_rows integer default 20, skip integer default 0)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with v as (select r.* from public.seller_reviews r where r.seller_id = seller and r.hidden_at is null)
  select jsonb_build_object(
    'average', (select round(avg(v.rating)::numeric, 1) from v),
    'count', (select count(*)::int from v),
    'items', coalesce((
      select jsonb_agg(x order by x.created_at desc)
        from (select v.id, v.rating, v.body, v.created_at, v.reviewer_id,
                     coalesce(pr.display_name, 'Former member') as reviewer_name, pr.avatar_path as reviewer_avatar,
                     public.listing_label(v.listing_id) as item
                from v left join public.profiles pr on pr.id = v.reviewer_id
               order by v.created_at desc
               limit least(greatest(max_rows, 1), 50) offset greatest(skip, 0)) x), '[]'));
$$;

-- ---------------------------------------------------------------------------------------------
-- Moderation: reviews can be reported; staff hide them from the Reports queue
-- ---------------------------------------------------------------------------------------------

alter table public.reports drop constraint reports_target_type_check;
alter table public.reports add constraint reports_target_type_check check (target_type in ('listing', 'user', 'conversation', 'review'));

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
      when 'review' then exists (select 1 from public.seller_reviews r where r.id = file_report.target_id and r.hidden_at is null
                                    and r.reviewer_id is distinct from auth.uid())
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

-- Reviews show as "★4 review of <seller>", owned by the reviewer, with the review text as the transcript.
drop function public.staff_reports(boolean);
create function public.staff_reports(include_closed boolean default false)
returns table (
  id uuid, target_type text, target_id uuid, reason text, details text, status text, created_at timestamptz,
  reporter_name text, open_reports integer, target_label text, target_owner uuid, target_owner_name text,
  listing_status text, transcript jsonb, review_hidden boolean)
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
           when 'review' then (select format('★%s review of %s', sr.rating, coalesce(sp.display_name, 'a deleted seller'))
                                 from public.seller_reviews sr left join public.profiles sp on sp.id = sr.seller_id where sr.id = r.target_id)
         end,
         tgt.id, tgt.display_name,
         case when r.target_type = 'listing' then (select l.status::text from public.listings l where l.id = r.target_id) end,
         case r.target_type
           when 'conversation' then (
             select coalesce(jsonb_agg(jsonb_build_object('at', m.created_at, 'from', coalesce(sp.display_name, 'System'), 'kind', m.kind, 'body', m.body) order by m.id), '[]')
               from (select * from public.messages m2 where m2.conversation_id = r.target_id order by m2.id desc limit 50) m
               left join public.profiles sp on sp.id = m.sender_id)
           when 'review' then (
             select jsonb_build_array(jsonb_build_object('at', sr.updated_at, 'from', coalesce(rv.display_name, 'Former member'), 'kind', 'review',
                                                         'body', format('★%s · %s', sr.rating, public.listing_label(sr.listing_id))
                                                                 || coalesce(E'\n' || sr.body, '')))
               from public.seller_reviews sr left join public.profiles rv on rv.id = sr.reviewer_id where sr.id = r.target_id)
         end,
         case when r.target_type = 'review' then (select sr.hidden_at is not null from public.seller_reviews sr where sr.id = r.target_id) end
    from public.reports r
    left join public.profiles rp on rp.id = r.reporter_id
    left join lateral (
      select pr.id, pr.display_name from public.profiles pr
       where pr.id = case r.target_type
                       when 'listing' then (select l.seller_id from public.listings l where l.id = r.target_id)
                       when 'user' then r.target_id
                       when 'conversation' then (select case when c.buyer_id = r.reporter_id then c.seller_id else c.buyer_id end from public.conversations c where c.id = r.target_id)
                       when 'review' then (select sr.reviewer_id from public.seller_reviews sr where sr.id = r.target_id)
                     end) tgt on true
   where public.is_staff() and (include_closed or r.status = 'open')
   order by r.created_at desc
   limit 200;
$$;

-- `remove_listing` removes the reported thing: a listing is taken down, a review is hidden.
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
  elsif remove_listing and r.target_type = 'review' then
    update public.seller_reviews
       set hidden_at = now(), hidden_reason = coalesce(nullif(btrim(note), ''), 'Hidden after a report')
     where id = r.target_id and hidden_at is null;
  end if;
  perform public.log_staff_action('report.' || decision, 'report', r.id::text, note,
    jsonb_build_object('target_type', r.target_type, 'target_id', r.target_id, 'remove_listing', remove_listing));
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- Privileges
-- ---------------------------------------------------------------------------------------------

revoke execute on function public.review_window() from public, anon, authenticated;
revoke execute on function public.listing_buyer_candidates(uuid), public.my_review(uuid), public.submit_review(uuid, integer, text),
  public.delete_review(uuid), public.staff_reports(boolean) from public, anon;
grant execute on function public.listing_buyer_candidates(uuid), public.my_review(uuid), public.submit_review(uuid, integer, text),
  public.delete_review(uuid), public.staff_reports(boolean) to authenticated;
revoke execute on function public.seller_reviews_for(uuid, integer, integer) from public;
grant execute on function public.seller_reviews_for(uuid, integer, integer) to anon, authenticated;
