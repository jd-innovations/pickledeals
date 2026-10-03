begin;
select plan(49);

insert into auth.users (id, email) values
  ('15151515-0000-0000-0000-000000000001', 'chatseller@example.test'),
  ('15151515-0000-0000-0000-000000000002', 'chatbuyer@example.test'),
  ('15151515-0000-0000-0000-000000000003', 'outsider@example.test'),
  ('15151515-0000-0000-0000-000000000004', 'staff@example.test');
update public.profiles set display_name = 'Marcus T.' where id = '15151515-0000-0000-0000-000000000001';
update public.profiles set display_name = 'Dana B.' where id = '15151515-0000-0000-0000-000000000002';

create function pg_temp.act_as(uid uuid, app_role text default null) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated', 'app_role', app_role)::text, true);
  set local role authenticated;
$$;
create function pg_temp.as_anon() returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
  set local role anon;
$$;

-- A live listing owned by the seller (direct insert, as the seed does).
insert into public.listings (id, seller_id, category_id, custom_title, condition, price_cents, status, published_at)
values ('cccc0000-0000-0000-0000-000000000001', '15151515-0000-0000-0000-000000000001', (select id from public.categories where slug = 'paddles'),
        'Chat test paddle', 'good', 15000, 'active', now());
insert into public.listing_locations (listing_id, public_point, geohash6, area_label)
select 'cccc0000-0000-0000-0000-000000000001', s.point, s.geohash, 'Sarasota, FL' from public.snap_point(27.33, -82.53, 6) s;

-- Structure ---------------------------------------------------------------------------------------

select ok((select bool_and(relrowsecurity) from pg_class where oid in (
  'public.conversations'::regclass, 'public.conversation_participants'::regclass, 'public.messages'::regclass,
  'public.user_blocks'::regclass, 'public.reports'::regclass)), 'RLS is on for every chat table');

-- Starting a thread -----------------------------------------------------------------------------------

select pg_temp.as_anon();
select throws_ok($$select public.start_conversation('cccc0000-0000-0000-0000-000000000001')$$, '42501', null, 'guests can’t start a chat (D6)');
reset role;

select pg_temp.act_as('15151515-0000-0000-0000-000000000001');
select throws_ok($$select public.start_conversation('cccc0000-0000-0000-0000-000000000001')$$, '22023', 'This is your listing.', 'sellers can’t message themselves');
reset role;

select pg_temp.act_as('15151515-0000-0000-0000-000000000002');
create temp table t (cid uuid);
grant all on t to authenticated;
insert into t select public.start_conversation('cccc0000-0000-0000-0000-000000000001');
select is((select public.start_conversation('cccc0000-0000-0000-0000-000000000001')), (select cid from t), 'starting a chat is idempotent');
select is((select count(*)::int from public.conversation_participants where conversation_id = (select cid from t)), 2, 'buyer and seller both join');
select is((select count(*)::int from public.my_conversations()), 0, 'empty threads stay out of the inbox');

-- Messages ----------------------------------------------------------------------------------------------

select lives_ok($$insert into public.messages (conversation_id, body, client_id) values ((select cid from t), 'Hi! Is this still available?', 'dddd0000-0000-0000-0000-000000000001')$$,
  'a participant sends a message');
select throws_ok($$insert into public.messages (conversation_id, body, client_id) values ((select cid from t), 'Hi! Is this still available?', 'dddd0000-0000-0000-0000-000000000001')$$,
  '23505', null, 'retries with the same client id are idempotent');
select is((select sender_id from public.messages where client_id = 'dddd0000-0000-0000-0000-000000000001'), '15151515-0000-0000-0000-000000000002'::uuid, 'the sender is the caller');
select throws_ok($$insert into public.messages (conversation_id, sender_id, body) values ((select cid from t), '15151515-0000-0000-0000-000000000001', 'spoofed')$$,
  '42501', null, 'nobody can send as someone else');
select throws_ok($$insert into public.messages (conversation_id, kind, body) values ((select cid from t), 'status_event', 'Fake status')$$,
  '42501', null, 'system lines only come from RPCs');
select throws_ok($$insert into public.messages (conversation_id, kind, image_path) values ((select cid from t), 'image', 'elsewhere/x.jpg')$$,
  '22023', 'invalid image path', 'photos must live in the conversation’s folder');
select lives_ok($$insert into public.messages (conversation_id, kind, meta) values ((select cid from t), 'location_share', '{"lat": 27.39, "lng": -82.41, "label": "Lakewood Ranch park courts", "extra": "dropped"}')$$,
  'participants share a meet-up spot');
select is((select meta from public.messages where kind = 'location_share'), '{"lat": 27.39, "lng": -82.41, "label": "Lakewood Ranch park courts"}'::jsonb,
  'meet-up spots keep only lat, lng and label');
select is((select last_message_preview from public.conversations where id = (select cid from t)), 'Shared a meet-up spot', 'the thread keeps a preview');
select is((select last_read_message_id from public.conversation_participants where conversation_id = (select cid from t) and user_id = auth.uid()),
          (select max(id) from public.messages where conversation_id = (select cid from t)), 'you’ve read what you sent');
reset role;

-- Realtime fan-out and push (§7) --------------------------------------------------------------------------

select ok(exists (select 1 from realtime.messages where topic = 'conversation:' || (select cid from t) and event = 'message' and private
                    and payload ->> 'body' = 'Hi! Is this still available?'), 'messages broadcast on the private conversation topic');
select ok(exists (select 1 from realtime.messages where topic = 'user:15151515-0000-0000-0000-000000000001' and event = 'inbox'), 'the recipient’s inbox topic is told');
select is((select count(*)::int from public.notifications where user_id = '15151515-0000-0000-0000-000000000001' and type = 'new_message'), 1,
  'one push per unread streak');
select is((select route from public.notifications where user_id = '15151515-0000-0000-0000-000000000001' and type = 'new_message'),
          '/conversation/' || (select cid from t), 'the push opens the thread');
select is((select count(*)::int from public.notifications where user_id = '15151515-0000-0000-0000-000000000002' and type = 'new_message'), 0, 'senders aren’t notified');

-- Reading and receipts ---------------------------------------------------------------------------------

select pg_temp.act_as('15151515-0000-0000-0000-000000000001');
select is((select unread from public.my_conversations()), 2, 'the seller has two unread messages');
select is(public.unread_conversation_count(), 1, 'one unread thread for the badge');
select lives_ok($$select public.mark_conversation_read((select cid from t), 9223372036854775807)$$, 'the seller reads the thread');
select is((select unread from public.my_conversations()), 0, 'nothing unread after reading');
reset role;
select ok(exists (select 1 from realtime.messages where topic = 'conversation:' || (select cid from t) and event = 'read'
                    and payload ->> 'user_id' = '15151515-0000-0000-0000-000000000001'), 'read receipts are broadcast');
select pg_temp.act_as('15151515-0000-0000-0000-000000000002');
select is((select other_last_read_message_id from public.my_conversations()), (select max(id) from public.messages where conversation_id = (select cid from t)),
  'the buyer sees how far the seller has read');
select lives_ok($$insert into public.messages (conversation_id, body) values ((select cid from t), 'Can I pick it up Saturday?')$$, 'a new message after reading');
reset role;
select is((select count(*)::int from public.notifications where user_id = '15151515-0000-0000-0000-000000000001' and type = 'new_message'), 2,
  'a new unread streak notifies again');

-- Privacy -------------------------------------------------------------------------------------------------

select pg_temp.act_as('15151515-0000-0000-0000-000000000003');
select is_empty($$select 1 from public.messages$$, 'outsiders can’t read messages');
select is_empty($$select 1 from public.conversations$$, 'outsiders can’t see threads');
select throws_ok($$insert into public.messages (conversation_id, body) values ((select cid from t), 'hello')$$, '42501', null, 'outsiders can’t post');
select ok(not public.can_use_topic('conversation:' || (select cid from t)), 'outsiders can’t join the conversation topic');
select ok(not public.can_use_topic('user:15151515-0000-0000-0000-000000000001'), 'nobody joins someone else’s inbox topic');
select ok(public.can_use_topic('user:15151515-0000-0000-0000-000000000003'), 'users join their own inbox topic');
select ok(not public.can_use_topic('conversation:not-a-uuid'), 'malformed topics are refused');
reset role;
select pg_temp.as_anon();
select throws_ok($$select 1 from public.messages$$, '42501', null, 'guests have no access to chat');
reset role;

-- Status lines ------------------------------------------------------------------------------------------

select pg_temp.act_as('15151515-0000-0000-0000-000000000001');
select lives_ok($$select public.set_listing_status('cccc0000-0000-0000-0000-000000000001', 'pending')$$, 'the seller marks the listing pending');
select is((select body from public.messages where conversation_id = (select cid from t) and kind = 'status_event'), 'Marcus marked this listing Pending',
  'status changes leave a line in the thread');

-- Mute / archive -----------------------------------------------------------------------------------------

select lives_ok($$select public.set_conversation_state((select cid from t), muted => true, archived => true)$$, 'the seller mutes and archives');
select ok((select muted and archived from public.my_conversations()), 'mute and archive are per user');
reset role;

-- Blocks ------------------------------------------------------------------------------------------------

select pg_temp.act_as('15151515-0000-0000-0000-000000000001');
select lives_ok($$select public.block_user('15151515-0000-0000-0000-000000000002')$$, 'the seller blocks the buyer');
select is((select count(*)::int from public.my_conversations()), 0, 'blocked threads leave the inbox');
reset role;
select pg_temp.act_as('15151515-0000-0000-0000-000000000002');
select throws_ok($$insert into public.messages (conversation_id, body) values ((select cid from t), 'Hello?')$$, '42501', 'You can’t message this person.',
  'blocked users can’t message');
select is_empty($$select 1 from public.user_blocks$$, 'blocks are private to the blocker');

-- Reports ----------------------------------------------------------------------------------------------

select lives_ok($$select public.file_report('conversation', (select cid from t), 'offensive', 'Rude replies')$$, 'participants report a conversation');
select throws_ok($$select public.file_report('conversation', gen_random_uuid(), 'spam')$$, '22023', 'Nothing to report.', 'you can only report what you can see');
select is((select count(*)::int from public.reports), 1, 'reporters see their own reports');
reset role;

select pg_temp.act_as('15151515-0000-0000-0000-000000000004', 'editor');
select ok((select jsonb_array_length(transcript) > 0 from public.staff_reports() where target_type = 'conversation'), 'staff see the reported thread');
reset role;

select * from finish();
rollback;
