-- Reporting problems (owner-approved Oct 13, 2026).
-- 1. Listings: a "Not as described" reason (wrong item, condition or photos).
-- 2. Deals and products: "Report a problem" on an offer (wrong price, out of stock, broken link) or on
--    its promo code (doesn't work). They land in admin › Reports as `offer` / `promo` reports, where
--    staff can turn the offer off (a store feed turns it back on when it next sees it, as on the Offers
--    page) or remove the code.
-- 3. Three different people saying a code doesn't work within a day un-verify it: it drops out of the
--    app and the prices at once, until staff (or the store check) verify it again. Reports stay open.

alter table public.reports drop constraint reports_target_type_check;
alter table public.reports add constraint reports_target_type_check
  check (target_type in ('listing', 'user', 'conversation', 'review', 'offer', 'promo'));

alter table public.reports drop constraint reports_reason_check;
alter table public.reports add constraint reports_reason_check check (reason in (
  'prohibited', 'scam', 'offensive', 'spam', 'counterfeit', 'not_as_described',
  'wrong_price', 'code_failed', 'out_of_stock', 'broken_link', 'other'));

create or replace function public.file_report(target_type text, target_id uuid, reason text, details text default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  rid uuid;
  visible boolean;
  fits boolean;
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
      when 'offer' then exists (select 1 from public.retailer_offers o where o.id = file_report.target_id and o.status = 'active')
      when 'promo' then exists (select 1 from public.promo_codes p where p.id = file_report.target_id and p.status = 'active')
      else false end;
  -- Each kind of thing has its own reasons (the app shows only those).
  fits := case
       when file_report.target_type = 'promo' then file_report.reason in ('code_failed', 'other')
       when file_report.target_type = 'offer' then file_report.reason in ('wrong_price', 'out_of_stock', 'broken_link', 'other')
       when file_report.reason in ('code_failed', 'wrong_price', 'out_of_stock', 'broken_link') then false
       when file_report.reason = 'not_as_described' then file_report.target_type = 'listing'
       else true end;
  if not fits then
    raise exception 'That reason doesn’t apply here.' using errcode = '22023';
  end if;
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

-- Three people within a day: the code stops showing until it's verified again.
create or replace function public.reports_unverify_failed_code()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.target_type = 'promo' and new.reason = 'code_failed'
     and (select count(distinct r.reporter_id) from public.reports r
           where r.target_type = 'promo' and r.target_id = new.target_id and r.reason = 'code_failed'
             and r.created_at > now() - interval '1 day') >= 3 then
    update public.promo_codes set verified_at = null where id = new.target_id and verified_at is not null;
  end if;
  return null;
end;
$$;

create trigger reports_unverify_failed_code after insert or update of reason on public.reports
  for each row execute function public.reports_unverify_failed_code();

-- Offers and codes show what was reported, and their current state in listing_status.
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
           when 'offer' then (select format('%s %s at %s · %s shown', b.name, p.name, rt.name,
                                            case when o.price_display = 'show' then public.format_usd(o.price_cents) else 'check price' end)
                                from public.retailer_offers o
                                join public.retailers rt on rt.id = o.retailer_id
                                join public.product_variants v on v.id = o.variant_id
                                join public.products p on p.id = v.product_id
                                join public.brands b on b.id = p.brand_id
                               where o.id = r.target_id)
           when 'promo' then (select format('Code %s at %s', pc.code, rt.name)
                                from public.promo_codes pc join public.retailers rt on rt.id = pc.retailer_id where pc.id = r.target_id)
         end,
         tgt.id, tgt.display_name,
         case r.target_type
           when 'listing' then (select l.status::text from public.listings l where l.id = r.target_id)
           when 'offer' then (select o.status::text from public.retailer_offers o where o.id = r.target_id)
           when 'promo' then (select case when pc.status = 'removed' then 'removed' when public.promo_is_live(pc) then 'live' else 'unverified' end
                                from public.promo_codes pc where pc.id = r.target_id)
         end,
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

-- `remove_listing` removes the reported thing: listing taken down, review hidden, offer turned off,
-- code removed.
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
  elsif remove_listing and r.target_type = 'offer' then
    update public.retailer_offers set status = 'inactive' where id = r.target_id;
  elsif remove_listing and r.target_type = 'promo' then
    update public.promo_codes set status = 'removed' where id = r.target_id;
  elsif remove_listing and r.target_type = 'review' then
    update public.seller_reviews
       set hidden_at = now(), hidden_reason = coalesce(nullif(btrim(note), ''), 'Hidden after a report')
     where id = r.target_id and hidden_at is null;
  end if;
  perform public.log_staff_action('report.' || decision, 'report', r.id::text, note,
    jsonb_build_object('target_type', r.target_type, 'target_id', r.target_id, 'remove_listing', remove_listing));
end;
$$;

revoke execute on function public.reports_unverify_failed_code() from public, anon, authenticated;
revoke execute on function public.staff_reports(boolean) from public, anon;
grant execute on function public.staff_reports(boolean) to authenticated;
