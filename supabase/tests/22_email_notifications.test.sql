begin;
select plan(30);

-- Fixtures ----------------------------------------------------------------------------------------
insert into auth.users (id, email) values
  ('22222222-0000-0000-0000-000000000001', 'Email-Seller@Example.test'),            -- receives the messages
  ('22222222-0000-0000-0000-000000000002', 'email-buyer@example.test'),             -- writes to the seller
  ('22222222-0000-0000-0000-000000000003', 'abc123@privaterelay.appleid.com'),      -- Sign in with Apple relay
  ('22222222-0000-0000-0000-000000000004', 'bounced@example.test'),                 -- suppressed
  ('22222222-0000-0000-0000-000000000005', 'quiet@example.test');                   -- always in quiet hours
update public.profiles set display_name = 'Dana B.' where id = '22222222-0000-0000-0000-000000000002';
update public.profiles_private set quiet_enabled = false;
update public.profiles_private set quiet_enabled = true, quiet_start = '00:00', quiet_end = '23:59', tz = 'UTC'
 where user_id = '22222222-0000-0000-0000-000000000005';
select public.suppress_email('  Bounced@Example.test ', 'bounced');

create function pg_temp.act_as(uid uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  set local role authenticated;
$$;

insert into public.listings (id, seller_id, category_id, custom_title, custom_brand_text, condition, price_cents, status, published_at)
values ('22220000-0000-0000-0000-000000000001', '22222222-0000-0000-0000-000000000001', (select id from public.categories where slug = 'paddles'),
        'Email test paddle', 'JOOLA', 'good', 15000, 'active', now());

-- Every other user opens a thread on the seller's listing (they're its buyer participants).
create temp table c (uid uuid primary key, cid uuid);
grant select on c to authenticated;
do $$
declare u uuid;
begin
  foreach u in array array['22222222-0000-0000-0000-000000000002', '22222222-0000-0000-0000-000000000003',
                           '22222222-0000-0000-0000-000000000004', '22222222-0000-0000-0000-000000000005']::uuid[] loop
    perform set_config('request.jwt.claims', json_build_object('sub', u, 'role', 'authenticated')::text, true);
    insert into c values (u, public.start_conversation('22220000-0000-0000-0000-000000000001'));
  end loop;
end $$;

create function pg_temp.cid(uid uuid) returns uuid language sql as $$ select cid from c where c.uid = cid.uid $$;
create function pg_temp.status(key text) returns text language sql as $$
  select coalesce(email_status::text, 'none') || coalesce(':' || email_error, '') from public.notifications where dedupe_key = key
$$;
create temp table claimed as select * from public.claim_pending_emails() limit 0;

-- Structure and access ------------------------------------------------------------------------------

select ok((select relrowsecurity from pg_class where oid = 'public.email_suppressions'::regclass), 'RLS is on for email suppressions');
select is((select email from public.email_suppressions), 'bounced@example.test', 'suppressed addresses are stored trimmed and lower-case');

select pg_temp.act_as('22222222-0000-0000-0000-000000000001');
select is((public.my_notification_settings() ->> 'email_missed')::boolean, true, 'missed-message emails are on by default');
select throws_ok($$select public.claim_pending_emails()$$, '42501', null, 'clients cannot claim the email queue');
select throws_ok($$select 1 from public.email_suppressions$$, '42501', null, 'suppressions are server-only');
select throws_ok($$select email_token from public.profiles_private$$, '42501', null, 'unsubscribe tokens are never readable by clients');
select throws_ok($$select public.unsubscribe_email(gen_random_uuid())$$, '42501', null, 'clients cannot call unsubscribe directly');
select lives_ok($$select email_missed from public.profiles_private$$, 'owners can read their email switch');
reset role;

-- Queueing --------------------------------------------------------------------------------------------

select pg_temp.act_as('22222222-0000-0000-0000-000000000002');
insert into public.messages (conversation_id, body) values (pg_temp.cid('22222222-0000-0000-0000-000000000002'), 'Hi! Still available?');
insert into public.messages (conversation_id, body) values (pg_temp.cid('22222222-0000-0000-0000-000000000002'), 'Could meet tomorrow.');
reset role;
create temp table seller_msg as
  select dedupe_key from public.notifications where user_id = '22222222-0000-0000-0000-000000000001' and type = 'new_message';
select is((select pg_temp.status(dedupe_key) from seller_msg), 'pending', 'message notifications are queued for email');

select public.notify('22222222-0000-0000-0000-000000000001', 'price_drop', 'Drop', 'Body', '/deals', 'email-test-drop');
select is(pg_temp.status('email-test-drop'), 'none', 'deal notifications are never emailed');

-- An offer in the same thread, a minute later (the newest in a thread wins).
select public.notify('22222222-0000-0000-0000-000000000001', 'offer', 'New offer: $120', 'Dana B. offered $120.',
  '/conversation/' || pg_temp.cid('22222222-0000-0000-0000-000000000002'), 'email-test-offer');
update public.notifications set created_at = now() + interval '1 minute' where dedupe_key = 'email-test-offer';

-- Account notice
select public.notify('22222222-0000-0000-0000-000000000001', 'system', 'Your listing was removed', 'Email test paddle: counterfeit.',
  '/market/listing/22220000-0000-0000-0000-000000000001', 'email-test-system');

-- Messages to the relay, suppressed and quiet users.
select public.notify(u, 'new_message', 'Seller', 'Hello', '/conversation/' || pg_temp.cid(u), 'email-test-msg-' || right(u::text, 1))
  from unnest(array['22222222-0000-0000-0000-000000000003', '22222222-0000-0000-0000-000000000004', '22222222-0000-0000-0000-000000000005']::uuid[]) u;

-- Claims ----------------------------------------------------------------------------------------------

insert into claimed select * from public.claim_pending_emails(50, now() + interval '30 minutes');
select is((select array_agg(kind) from claimed), array['system'], 'account notices go at once; messages wait an hour');

insert into claimed select * from public.claim_pending_emails(50, now() + interval '61 minutes');
select is((select count(*)::int from claimed where kind <> 'system'), 1, 'after an hour, one email for the unread thread');
select is((select kind || ' ' || title from claimed where kind <> 'system'), 'offer New offer: $120', 'the newest notification in the thread is the one emailed');
select is(pg_temp.status((select dedupe_key from seller_msg)), 'skipped:grouped', 'older notifications in that thread are folded in');
select is((select email from claimed where kind = 'offer'), 'email-seller@example.test', 'the address comes from the account, lower-cased');
select is((select listing_title from claimed where kind = 'offer'), 'JOOLA Email test paddle', 'the email names the listing');
select is((select unread from claimed where kind = 'offer'), 2, 'and counts the unread messages');
select is((select token from claimed where kind = 'offer'), (select email_token from public.profiles_private where user_id = '22222222-0000-0000-0000-000000000001'),
  'the unsubscribe token comes along');
select is(pg_temp.status('email-test-msg-3'), 'skipped:apple_relay', 'Apple private relay addresses are skipped');
select is(pg_temp.status('email-test-msg-4'), 'skipped:suppressed', 'bounced addresses are skipped');
select is(pg_temp.status('email-test-msg-5'), 'pending', 'quiet hours hold the email');

-- One email per thread per day
select public.notify('22222222-0000-0000-0000-000000000001', 'new_message', 'Dana B.', 'Hello again',
  '/conversation/' || pg_temp.cid('22222222-0000-0000-0000-000000000002'), 'email-test-again');
update public.notifications set email_status = 'sent' where email_status = 'sending';
select is((select count(*)::int from public.claim_pending_emails(50, now() + interval '3 hours')), 0, 'nothing more for that thread today');
select is(pg_temp.status('email-test-again'), 'skipped:daily_limit', 'a second email for the thread within 24 h is skipped');

-- Read, switched off, stale
update public.profiles_private set quiet_enabled = false where user_id = '22222222-0000-0000-0000-000000000005';
update public.conversation_participants set last_read_at = now() + interval '5 minutes'
 where user_id = '22222222-0000-0000-0000-000000000005';
select is((select count(*)::int from public.claim_pending_emails(50, now() + interval '2 hours')), 0, 'read threads are not emailed');
select is(pg_temp.status('email-test-msg-5'), 'skipped:read', 'reading in the app cancels the email');

select pg_temp.act_as('22222222-0000-0000-0000-000000000002');
select public.set_notification_settings(email_missed => false);
select is((public.my_notification_settings() ->> 'email_missed')::boolean, false, 'the switch turns emails off');
reset role;
select public.notify('22222222-0000-0000-0000-000000000002', 'new_message', 'Seller', 'Reply',
  '/conversation/' || pg_temp.cid('22222222-0000-0000-0000-000000000002'), 'email-test-off');
select is((select count(*)::int from public.claim_pending_emails(50, now() + interval '2 hours')), 0, 'switched off: nothing is claimed');
select is(pg_temp.status('email-test-off'), 'skipped:preference', 'and the notification records why');

-- Unsubscribe link
update public.profiles_private set email_missed = true where user_id = '22222222-0000-0000-0000-000000000001';
select is(public.unsubscribe_email((select email_token from public.profiles_private where user_id = '22222222-0000-0000-0000-000000000001')), true,
  'the unsubscribe link works without signing in');
select is((select email_missed from public.profiles_private where user_id = '22222222-0000-0000-0000-000000000001'), false, 'and turns the switch off');

select * from finish();
rollback;
