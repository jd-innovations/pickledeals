begin;
select plan(14);

insert into auth.users (id, email) values
  ('23232323-0000-0000-0000-000000000001', 'partner-editor@example.test'),
  ('23232323-0000-0000-0000-000000000002', 'partner-user@example.test');
insert into public.user_roles (user_id, role) values ('23232323-0000-0000-0000-000000000001', 'editor');

create function pg_temp.act_as(uid uuid, app_role text default null) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated', 'app_role', app_role)::text, true);
  set local role authenticated;
$$;
create function pg_temp.as_anon() returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
  set local role anon;
$$;

-- Written by the partner-apply edge function (service role).
insert into public.partner_inquiries (id, company, contact_name, email, store_host, myshopify_domain, shop_name, interests, message, client_hash)
values ('23230000-0000-0000-0000-000000000001', 'CourtGear', 'Alex Rivera', 'alex@courtgear.example', 'courtgear.example', 'courtgear.myshopify.com', 'CourtGear',
        array['store', 'promo_code'], 'Launching a new paddle in November.', repeat('a', 64));

select ok((select relrowsecurity from pg_class where oid = 'public.partner_inquiries'::regclass), 'RLS is on for partner applications');
select throws_ok($$insert into public.partner_inquiries (company, contact_name, email, store_host, interests, client_hash)
                  values ('X', 'Y', 'not-an-email', 'x.example', '{}', repeat('a', 64))$$, '23514', null, 'emails are checked');
select throws_ok($$insert into public.partner_inquiries (company, contact_name, email, store_host, interests, client_hash)
                  values ('X', 'Y', 'a@b.example', 'https://x.example/path', '{}', repeat('a', 64))$$, '23514', null, 'store addresses are bare hosts');
select throws_ok($$insert into public.partner_inquiries (company, contact_name, email, store_host, interests, client_hash)
                  values ('X', 'Y', 'a@b.example', 'x.example', array['free_money'], repeat('a', 64))$$, '23514', null, 'interests come from the fixed list');

-- Visitors and regular users
select pg_temp.as_anon();
select throws_ok($$select 1 from public.partner_inquiries$$, '42501', null, 'visitors cannot read applications');
select throws_ok($$insert into public.partner_inquiries (company, contact_name, email, store_host, client_hash) values ('X', 'Y', 'a@b.example', 'x.example', repeat('a', 64))$$,
  '42501', null, 'visitors cannot write applications directly (only the edge function can)');
reset role;

select pg_temp.act_as('23232323-0000-0000-0000-000000000002');
select is((select count(*)::int from public.partner_inquiries), 0, 'signed-in users see no applications');
select throws_ok($$select public.staff_set_partner_status('23230000-0000-0000-0000-000000000001', 'declined')$$, '42501', 'staff only', 'only staff change the status');
select throws_ok($$update public.partner_inquiries set status = 'connected'$$, '42501', null, 'nobody updates the table directly');
reset role;

-- Staff
select pg_temp.act_as('23232323-0000-0000-0000-000000000001', 'editor');
select is((select company from public.partner_inquiries), 'CourtGear', 'staff read applications');
select lives_ok($$select public.staff_set_partner_status('23230000-0000-0000-0000-000000000001', 'contacted', 'Emailed Alex about the Storefront token.')$$,
  'staff move an application along');
select throws_ok($$select public.staff_set_partner_status('23230000-0000-0000-0000-000000000001', 'paid')$$, '22023', 'unknown status', 'statuses are checked');
reset role;

select is((select status || ' / ' || staff_note from public.partner_inquiries), 'contacted / Emailed Alex about the Storefront token.', 'the status and note are saved');
select is((select action || ' ' || (data ->> 'from') || '→' || (data ->> 'to') from public.staff_actions where target_type = 'partner_inquiry'),
  'partner.status new→contacted', 'the change is in the audit log');

select * from finish();
rollback;
