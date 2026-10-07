# PickleDeals — session handoff (Oct 6, 2026: hosted backend live, preview build next)

Paste this into a new session, or say: "Read docs/HANDOFF.md and continue."

## Project
- PickleDeals: a native iOS app (Expo SDK 57, React Native 0.86, Expo Router, TypeScript) on Supabase.
- Repo: `C:\dev\pickledeals`, GitHub `jd-innovations/pickledeals`, branch `main`.
- The old copy at `C:\Users\dhjes\OneDrive\Documents\PickleDeals` is obsolete. Don't work there, and don't delete it.
- Monorepo layout:
  - `apps/mobile`: Expo app
  - `apps/admin`: Vite + React 19 staff admin
  - `packages/shared`: tokens, domain, format, generated `database.types.ts`
  - `supabase/`: migrations, tests, seed, functions
- Rules live in `CLAUDE.md`. Follow them.
- The plan is `docs/ARCHITECTURE_PLAN.md`. Phases are in §13; decisions D1–D8 override anything later in the doc.
- The approved design in `preview/*.dc.html` is the visual source of truth.

## Working agreement with the user
- Work one phase at a time. Implement, validate, commit and push, then **report and wait for a go-ahead** before starting the next phase.
- **Hosted Supabase project `pickledeals`** (ref `tadxbjlhknukpyxbqrpt`, us-east-1) was created on Oct 6, 2026 with the user's explicit approval ($10/month on their Pro org). Setup steps and secrets checklist: `docs/HOSTED_SETUP.md`. Don't create further projects or branches without asking; local Docker remains the dev environment.
- Commits are made from Bash with a heredoc (`git commit -F -`); PowerShell mangles quotes.
- Before calling work done:
  - `npm run typecheck && npm run lint && npm test`
  - `npm run build -w apps/admin`
  - `npx supabase test db`
  - `npm run catalog:seed -- --check`
- In PowerShell use `npm.cmd` / `npx.cmd`, because `npm.ps1` is blocked.
- Add mobile packages with `npx expo install`, and check the SDK 57 docs before using an Expo/RN API.

## Where things stand (Oct 6, 2026) — start here

### Next steps, in order
1. **Hosted dashboard (Oct 6): done** — Shopify function secrets set; Vault `dispatch_key` = legacy
   `service_role` JWT (verified by the user). **Resend SMTP skipped**: the user has no sending domain yet, so
   sign-in codes use Supabase's built-in mailer (project team members only, a few per hour). Later: verify a
   domain in Resend → Authentication → SMTP (`smtp.resend.com`, 465, user `resend`, password = Resend API
   key, sender `no-reply@<domain>`, name PickleDeals) → Rate Limits: raise emails/hour.
2. **Shopify on hosted: on (Oct 6).** `shopify-gripdoctor` active, storefront, shipping $4.99, free from $39
   (`flat_cents` 499, `free_over_cents` 3900), every 30 min. First run: 32 products, 15 skipped (out of
   stock), 17 unmatched → review queue; 0 offers until staff link/publish them in the hosted admin. All 7
   cron jobs exist.
3. **Preview build (Oct 6): done.** EAS build 67a1c076… (preview, hosted backend) installed; the user
   signed in as dhjesus122@gmail.com and has `admin` on hosted.
   **Grip Doctor review queue cleared on hosted (Oct 6, by Claude with the user's go-ahead):** 16 new active
   products (Engage ×6, Pickleball Grip Doctor ×9, new brand **Luzz** ×1) + Trigger linked to the existing
   `pgd-trigger-grip-attachment`; 17 live offers, all with store images. Both HEXXO packs share UPC
   850081191216, so that UPC identifier was removed and they match by store SKU only. New store products will
   still land in the review queue (`npm.cmd run admin:hosted`).
   **Promo NEWCUSTOMER20 (Oct 6, hosted):** Grip Doctor, 20% off, first order only, every category except
   Paddles (category targets), no end date; terms "First order only. Not valid on paddles." → 10 live deals.
   Codes hide after 14 days without re-verification (`verified_at`): re-verify in admin → Promos by ~Oct 20.
4. **Admin on hosted:** done. `npm run admin:hosted` (or launch config `admin-hosted`, :5175) runs the admin
   against hosted via Vite mode `hosted` (`apps/admin/.env.hosted`, public values, committed); the tab title
   starts with "HOSTED". Usable once the user has the admin role on hosted (step 3) and email codes send (step 1).
5. **Sign in with Google:** built, off. Needs the user's two Google Cloud client IDs (iOS `app.pickledeals` +
   Web; public, can be shared in chat) → add to `eas.json` + `apps/mobile/.env.local`, enable the provider
   (hosted dashboard with the secret + Skip nonce check; local `config.toml`), new development + preview builds.
6. **UI:** audit fixes 1–6 shipped Oct 6. Phone fixes shipped as OTA on Oct 6–7 (user confirmed fine):
   one-line "Get deal" CTAs (code never in the button; long store names → "Get deal"), PromoCodeRow with
   terms on product/deal/home/brand, "with code" on sticky bars, segmented labels one line + shrink
   (Inbox tabs Activity · Alerts · Searches), full-screen PhotoViewer (pinch/double-tap zoom) on product,
   deal and listing photos, deal page gallery uncropped. Header test A (no solid header background, for the
   iOS 26 blank large-title band, react-native-screens#3100) is live; if the band persists, option B = no
   native large title on tab roots, draw the design's 34pt title in content. The user wants
   review → recommend → approval before cosmetic changes. Still open: the minimized tab-bar button
   overlapping sticky bars; not yet audited: signed-in screens and the map.

### Facts to know
- **Grip Doctor catalog on hosted (Oct 7):** 37 live offers. Added Thrive (8 products; FURY Elongated, FURY YoH 2026
  and Ignite with swing weights as variants) and RESET (3). FURY Gold Limited is out of stock (arrives via review
  when restocked; new swing weights also land in review and need a variant). New store products must be in the
  **PickleDeals** sales channel or the Storefront API never sees them. NEWCUSTOMER20 now targets Grip Doctor's own
  10 non-paddle products by product (not categories): Collective suppliers' items don't take the code, and new own
  products must be added to the code by hand. Migration 20261022: exact matches prefer store IDs over shared
  barcodes (HEXXO UPC, Ignite GTIN).
- **Accent colours (user decision, Oct 7):** the UI stays monochrome except ON states: saved = filled heart
  in `saved` (red), price alert set = filled bell in `alert` (yellow), label "Alert set". Tokens in
  `preview/pd.css` + `packages/shared/src/tokens.ts`; rule noted on `preview/Components.dc.html`.
- **Hosted project** `pickledeals` (ref `tadxbjlhknukpyxbqrpt`, us-east-1, $10/mo on the user's Pro org;
  created with explicit approval). Live: 24 migrations, `config push` applied (6-digit OTP, templates,
  access-token hook, Apple on, redirect URLs), production catalog loaded (149 products, 32 brands, 12
  categories; 1 retailer: Grip Doctor; no listings/users), 4 functions deployed, Vault `project_url` set.
  Security advisor: definer views/functions are by design; tidy-up later: `pg_net` sits in `public`.
- **CLI** is logged in and linked (`supabase/.temp`). The DB password is in git-ignored `supabase/.env.hosted`
  (`SUPABASE_DB_PASSWORD=…`); export it for `db push`/`link`, never print it. SQL against hosted:
  `docker exec -i -e PGPASSWORD=… supabase_db_pickledeals psql "postgresql://postgres.tadxbjlhknukpyxbqrpt@aws-0-us-east-1.pooler.supabase.com:5432/postgres?sslmode=require"`.
  Push schema changes with the CLI (`db push`), never by pasting migration files into the MCP.
- **Builds:** paid Expo plan; preview builds are the preferred way to test. `eas.json`: preview/production use
  the hosted URL + publishable key; `development` uses the PC (`.env.local`); `simulator` = iOS Simulator build
  of preview (EAS build 90748ede…, for Appetize; UI fixes via `eas update --channel preview`).
- **OTA to the preview build:** `eas update` reads `apps/mobile/.env.local` (the PC), not eas.json, so pass
  the hosted values: from `apps/mobile`, `APP_ENV=staging EXPO_PUBLIC_SUPABASE_URL=https://tadxbjlhknukpyxbqrpt.supabase.co
  EXPO_PUBLIC_SUPABASE_ANON_KEY=<publishable key from eas.json> npx eas-cli update --channel preview --environment preview
  --platform ios --message "…" --non-interactive`; then check `dist/_expo/static/js/ios/*.hbc` contains the hosted URL.
  First OTA (Oct 6): deal CTA/promo row fix, update group 9e1577a4….
- **Email:** paid Resend plan; open question: which sending domain.
- **CI:** check the GitHub run after each push (public API:
  `https://api.github.com/repos/jd-innovations/pickledeals/actions/runs?head_sha=<sha>`); `gh` isn't installed.
- **Local data** differs from a fresh seed (two Engage products created during Shopify testing), so
  `02_catalog` test 2 (seed count 149) fails locally until a `db reset`; CI is unaffected.
- **Device servers** after a PC restart: start Docker Desktop
  (`C:UsersdhjesAppDataLocalProgramsDockerDesktopDocker Desktop.exe`), `npx supabase start`,
  `npm run device:lan`, then open the "PickleDeals Metro" (`apps/mobile`: `npx.cmd expo start --dev-client`) and
  "PickleDeals Edge Functions" (`npx.cmd supabase functions serve --env-file supabase/functions/.env`) console
  windows with Start-Process (background tasks die after 2 h; the Terminal panel failed after a restart).

## Status
- Phases 0–12 are done and pushed. Since Phase 12 (all on `main`):
  - **Price tracking excludes Amazon** (decision, see Open items).
  - **Device testing is set up and largely passed on the user's iPhone** (development build; see `docs/DEVICE_SETUP.md`).
  - Fixes found on device: the sell draft id (iOS has no `crypto.randomUUID` → `expo-crypto`), the sell flow's City/ZIP area search, dark-mode toggles (shared `ui/Toggle`), `/` → Deals redirect (`app/index.tsx`).
  - Smaller fixes: ASINs in `import_catalog` (Phase 12 regression), no duplicate check-price row on Product, no Price alert button on Amazon-only products.
  - The dev seed has 149 products, including 5 real Amazon products (Pickleball Grip Doctor, Fjalljós, JTJEI, Hesacore, Big Shot Golf) with untagged check-price Amazon offers.
- **Phase 13 work done overnight (Oct 4), while the user was away; all pushed:**
  - Blocked users' listings are hidden from each other in the marketplace (`market_match`, pgTAP 14).
  - Offline cache: `lib/queryPersist.ts` persists only `catalog` (not search), `deals` and `offers` for 24 h. Never `market` (keys hold the device point, D2), personal data, or live Amazon API prices. Screens keep cached data when a refetch fails.
  - Accessibility: `packages/shared/src/a11y.ts` (`spoken`, `speakable`, `spokenPrice`, `spokenBadge`). Cards and rows now carry full VoiceOver labels (before, name-only labels hid prices). Controls use `minHeight` so Dynamic Type grows them.
  - `delete-account` now removes `listing-images/{uid}/` and the photos in the user's seller threads.
  - Drafts for review: `docs/legal/PRIVACY_POLICY_DRAFT.md`, `docs/legal/TERMS_DRAFT.md`, plus the checklist `docs/APP_STORE.md` (guidelines, privacy labels, metadata, open questions).
  - **Shopify direct-store feed (Oct 5), live locally against the real store**: Pickleball Grip Doctor is the seller of record (PickleDeals never sells). Storefront API token in `supabase/functions/.env` (the "PickleDeals" Headless storefront); source `shopify-gripdoctor` on, mode storefront, every 30 min. Grip Doctor codes apply at checkout via Shopify discount links; Grip Doctor wins exact ties (disclosed); sold-out and pre-order items are hidden. Products show the store's full description (About section), images (swipeable gallery) and auto-read specs, kept in sync. Details, decisions and open questions: `docs/SHOPIFY_PLAN.md`.
  - Local test data the user created: Engage X2 Elongated (offer hidden: pre-order) and Engage Pursuit Pro1 Innovation 12.7mm (published, with store content). They make `02_catalog` test 2 (seed count 149) fail locally until a `db reset`; CI is unaffected.
  - Device servers now run in their own console windows (Start-Process): "PickleDeals Metro" and "PickleDeals Edge Functions", so they don't hit the 2-hour background-task limit. The Terminal panel's shell integration failed after a restart.
  - Still waiting on the user: analytics choice, legal page hosting, the Phase 13 go-ahead for the rest of 13a and 13d/13e, and the questions at the end of `docs/APP_STORE.md`. (Hosted Supabase: decided Oct 6.)
- **Agreed order from here** (user, Oct 4):
  1. Finish the remaining on-device checks (list below), including the dark-mode toggle fix.
  2. **Phase 13, hardening and launch** (accessibility, performance, offline cache, analytics, App Store review prep, TestFlight). Propose the plan first and wait for a go-ahead.
  3. After launch: Amazon (Associates registration of the live app, tagged links, promo-code deals, Creators API once 10 sales/30 days).
- **Strategy (user, Oct 5):** the initial supply strategy shifts from Amazon to **Shopify Collective through Pickleball Grip Doctor** (its own stock plus curated Collective suppliers), proven working end to end locally. Amazon stays as a fallback and the door stays open: check-price offers today, the Associates tag and Creators API after launch. Affiliate retailers (AvantLink etc.) remain the second tier. Deals on Collective items come from Grip Doctor discount codes.
- D2 still applies: clients only ever get the snapped geohash-6 (~1 km) cell centre. The one exception is a meet-up spot, which is an exact point but lives only in a private `location_share` message.

## Local environment
- **Supabase CLI 2.119 on Docker.**
  - Commands: `npx supabase start`, `npx supabase db reset` (re-seeds), `npx supabase test db`.
  - Regenerate types (from Bash, so the file has no BOM/CRLF): `npx supabase gen types typescript --local > packages/shared/src/database.types.ts`
  - Studio: http://127.0.0.1:54323
  - Mailpit: http://127.0.0.1:54324. Sign-in codes are in the API at `/api/v1/messages`.
- **Device testing on the user's iPhone** (development build, Expo project `@dhjesus122/pickledeals`): full steps in `docs/DEVICE_SETUP.md`.
  - Each session: Docker → `npx supabase start` → `npm run device:lan` → `npx supabase functions serve --env-file supabase/functions/.env` (Get deal + push) → `cd apps/mobile && npx expo start --dev-client` → optional `npm run admin`. Afterwards `npm run device:local`.
  - JavaScript changes reload from Metro (press `r`); rebuild with EAS only for native/config changes.
  - **Ask the user before `npx supabase db reset` while they're testing on the phone.** It signs them out and wipes any local test data.
- **Dev servers** (`.claude/launch.json`):
  - `mobile-web` on :8081 (the Expo web preview, checked at the mobile viewport)
  - `admin` on :5174
  - `pickledeals-preview` on :5173 (the design files)
- **Seeded local accounts:**
  - Dev admin `admin@pickledeals.test` (admin role) signs in with an email code from Mailpit.
  - Three fictional sellers (Marcus T., Priya K., Jordan R.) with 8 listings around Sarasota, FL (plus anything the user listed from the phone since the last reset). One custom wooden paddle sits in the review queue.
  - The sellers also sign in with email codes: `seller1@` (Marcus), `seller2@` (Priya) and `seller3@pickledeals.test` (Jordan). A demo thread has Priya asking Marcus about his Perseus.
  - Two-account testing (chat, offers): use two tabs on different origins, `localhost:8081` and `127.0.0.1:8081`, so each keeps its own session. A `db reset` invalidates existing sessions, so sign in again afterwards.
  - The seed is generated: edit `supabase/seed/build-seed.ts`, then run `npm run catalog:seed`.
- **Browser testing tips:**
  - Geolocation: stub `navigator.geolocation.getCurrentPosition` in the page.
  - Photos: expo-image-picker on web dispatches a `MouseEvent('click')` on a hidden file input. Stub `EventTarget.prototype.dispatchEvent` to supply canvas-generated `File`s.
  - On web, `Alert` ignores buttons; use `lib/dialog.ts` (`confirm`, `chooseAction`), which has a web variant.

## Architecture conventions
- **Routes stay thin.** Files in `apps/mobile/src/app/**` re-export screens from `src/features/*`; visuals live in `src/ui` and `src/commerce`.
- Colours come only from `useTheme().colors` tokens.
- Money is integer cents with tabular numerals.
- D1: Amazon/`check_price` offers never show a number.
- **Navigation:**
  - Listing, seller, manage-listing and edit-listing routes exist in the deals, market and profile stacks. `useMarketNav()` (`features/market/components.tsx`) pushes within the current tab.
  - Sheets use `sheetOptions()` from `design/navigation.ts`.
  - The sell flow lives in the sell tab stack: `index`, `photos`, `condition`, `price`, `details`, `preview`. `SellFrame` draws its header and progress bar; the draft is a persisted zustand store (`useSellDraft`).
- **Marketplace data:**
  - `market_feed` RPC (definer). Inputs: lat/lng snapped server-side, `use_home`, `radius_m`, filters, `ids`, `q`. It returns `{total, has_origin, items}`.
  - The `useViewer` store keeps the device point in memory only.
  - Home area: `set_home_area`; the client can't read `home_point`.
  - Photos: `features/market/device.ts` resizes, re-encodes to JPEG (stripping EXIF) and uploads to `listing-images/{uid}/{listingId}/{uuid}.jpg`.
  - Saves: `useToggleSave()` covers `product | deal | brand | listing`.
  - Grid and map share one filter predicate, `market_match` (internal, definer). Grid and map also share `useMarketFilters`, `useMarketSearch` and `MarketQuickChips`.
- **Chat (Phase 8, §7):**
  - Tables: `conversations` (one per listing and buyer), `conversation_participants` (`last_read_message_id`, mute, archive), `messages` (bigint id, `client_id` idempotency), `user_blocks`, `reports`.
  - Clients insert `text`/`image`/`location_share` rows directly (RLS plus a before-insert trigger for blocks, a 30/min rate limit and attachment shape). System lines come only from RPCs.
  - The after-insert trigger updates the thread preview, `realtime.send`s to the private `conversation:{id}` and `user:{id}` topics, and creates one `new_message` push per unread streak (not when muted).
  - Realtime RLS lives on `realtime.messages` via `can_use_topic()`. Typing is client Broadcast only, throttled to 3 s with a 5 s expiry.
  - RPCs: `start_conversation`, `mark_conversation_read`, `set_conversation_state`, `my_conversations(only_id)`, `unread_conversation_count`, `block_user`/`unblock_user`, `file_report`, and for staff `staff_reports`/`resolve_report`. `set_listing_status` now writes status lines into threads.
  - App:
    - `features/chat` holds the hooks (optimistic sends, backfill, channels) and the screens
    - root routes: `conversation/[id]`, `meetup` and `report` sheets, plus `listing/[id]` and `seller/[id]` so chat can open details above the tabs
    - Inbox is `profile/messages`
    - `useInboxChannel` runs in the root layout
    - the Profile tab badge counts unread threads
    - Activity excludes `new_message`
  - Admin: the Reports page (`#/reports`).
- **Offers (Phase 9, §8):**
  - `marketplace_offers` (enum `marketplace_offer_status`, because `offer_status` is the retail enum) and `agreements`. Both are read-only to buyer and seller; every write goes through an RPC.
  - RPCs:
    - `make_offer` returns `{offer_id, conversation_id, status}`. Offers below the seller's floor are declined at once and hidden from the seller.
    - `counter_offer`, `accept_offer`, `decline_offer`, `withdraw_offer`, all built on `offer_for_action`
    - `expire_offers` on pg_cron every 5 minutes, with a reminder 6 h before expiry
    - Listings going sold or removed close their open offers (trigger).
  - Each transition writes an `offer_event` line (`meta.action`, `actor_id`, `amount_cents`, `previous_cents`) and an `offer` notification, which appears in Activity.
  - `my_conversations` now includes the latest offer per thread. Plus `my_offers()` and `my_listing_activity()`.
  - App:
    - root sheets `make-offer` and `counter-offer`
    - `OfferEventItem` renders the cards, with `AcceptedBanner` for accepted offers
    - `offerFlow.afterAccept` offers to mark the listing Pending
    - Profile → Offers is `profile/offers`
    - the inbox has an "Open offers" filter and tags
- **Notifications (Phase 10, §11):**
  - Types and preference categories:
    - deals: `price_drop`, `target_price`, `brand_deal`, `saved_search`, `weekly_digest` (opt-in)
    - pre-owned: `offer`, `new_message`, `nearby_listing`, `listing_update`
    - always on: `summary`, `system`
  - Preferences: `notify()` reads `notification_preferences`; when a category is off, nothing is created.
  - `claim_pending_notifications(max_rows, at)` applies the push rules and returns each push with a `badge`:
    - quiet hours (`profiles_private.quiet_*`, `tz`): offers and messages are held and released as one "While you were away" summary; other pushes are skipped
    - daily deal cap (`daily_deal_cap`): limits `price_drop`, `brand_deal`, `saved_search` and `nearby_listing` pushes
  - Viewing suppression: `set_viewing` heartbeat on `conversation_participants.viewing_until`.
  - New events:
    - saved-product price drops (variant stats trigger)
    - `nearby_listing` from `saved_searches` with `scope = 'market'` (Market home bell button)
    - `send_weekly_digests` (hourly cron, Sunday 9 AM local)
  - Dispatch sends `badge` and stores tickets in `push_receipts`; a later run checks receipts and revokes `DeviceNotRegistered` tokens. `EXPO_PUSH_URL` and `EXPO_RECEIPTS_URL` can point at a mock: serve the function with `--env-file`.
  - App:
    - Profile → Notifications (`profile/notifications`, NotifPrefs design)
    - time zone synced on sign-in (`useTimeZoneSync`)
    - push taps mark the notification read
    - the app icon badge equals unread Activity plus unread threads
    - Activity icons per type
- **Map (Phase 7, D4):**
  - `market_in_bounds(min_lng, min_lat, max_lng, max_lat, …filters)` returns `{total, truncated, items}`. It's capped at 500 rows, nearest the viewport centre first. Each item's `lat`/`lng` is its public cell centre.
  - Listing detail and the sell step decode `listing_locations.geohash6` client-side (`geohashCenter` / `snapToCell` in `packages/shared/src/geo.ts`).
  - `features/map` is the adapter:
    - `ListingMap`: react-native-maps, Apple Maps `mutedStandard`
    - `ListingMap.web.tsx`: a plain pannable stand-in, because react-native-maps has no web build
    - `AreaMap` (+ `.web`)
    - `useClusters` (supercluster; same-cell clusters open a carousel instead of zooming)
    - `useMapViewport` ("Search this area")
  - Route: `market/map` (full screen, no header). The Grid/Map toggle pushes it, and "List" goes back.
- **Admin operations (Phase 11):**
  - Admin (`apps/admin`, :5174) pages: Dashboard (`#/dashboard`, default), Products, Brands, Categories, CSV import, Offers, Review queue, Promo codes, Retailers, Live deals, Collections, Sponsored placements, Reports, Listings, Users, Custom listings, Prohibited terms. Shared helpers live in `src/lib/ops.tsx` (`useNotice`, `ActivityList`, `describeAction`).
  - Audit log: `staff_actions`. RPCs log explicitly (`log_staff_action`); direct staff edits to promos, promo targets, collections, collection items, placements and prohibited terms log via the `log_staff_change` trigger, as do raw-offer match status and custom-listing decisions. Read it with `staff_activity(for_type, for_id, max_rows)`.
  - Listing status changes only through RPCs, staff included (`update(status)` is revoked). `staff_set_listing_status(listing, 'remove' | 'restore', reason)` uses the internal `takedown_listing` / `restore_listing`: a thread status line plus a `system` notification to the seller. `listings.removed_by_staff`, `removed_at` and `removed_reason` are maintained by `listings_track_removal`; the owner can read the reason, and the app shows "Removed by PickleDeals". `resolve_report(..., remove_listing)` uses the same path.
  - Suspensions (admins only): `user_suspensions`, `staff_suspend_user(target, reason, hide_listings)` / `staff_unsuspend_user(target, restore_listings)`. The `guard_suspended` triggers block the suspended user's own listing inserts and live-status updates, new conversations, client messages, new offers and accepting offers. Marking sold or removed still works. Staff can't be suspended.
  - Search: `staff_listings(q, with_status, by_seller, …)` and `staff_users(q, only_suspended, …)`. Emails are returned and searchable for admins only.
  - D3 promote: `promote_listing_review(review, brand, name)` creates a draft product with a default variant; the `products_link_promoted_listings` trigger links the listing when the product goes active.
  - `reopen_raw_offer`; `promo_codes.verified_by` (set by trigger on every verification).
  - Metrics: `staff_queue_counts()` (all staff) and `staff_metrics(days)` (admins; UTC days, clicks by retailer/placement/product, per-placement clicks approximated as clicks on the promoted variant's offers while the placement ran).
  - Only `sponsored_deal` placements are offered, because the app renders only those.
- **Integrations (Phase 12, §9):**
  - Sources are `ingestion_sources` rows with `config` (adapter, retailer_slug, url_env, column mapping), `interval_minutes`, `max_age_minutes` and run state. `amazon-creators` (api, every 30 min, 60-min freshness) and `avantlink-selkirk` (feed, every 6 h, 48 h) ship **off**; turn them on in admin → Integrations.
  - Flow: pg_cron `schedule_ingestion()` (every 5 min) → `net.http_post` to the `ingest` edge function (Vault `project_url` + `dispatch_key`) → `claim_ingestion_runs` → adapter → `ingest_offers(source, records, dry_run => false, automated => true)` → `finish_ingestion_run` (backoff on failure; a complete feed hides offers it no longer lists unless it looks truncated). Admin "Run now" = `request_ingestion_run`.
  - Automated matching adds "previously matched SKU" and skips items already in (or rejected from) the review queue. Exact matches learn the record's other identifiers (`product_identifiers.source = 'learned'`, never overwriting; conflicts counted). Review matches are `source = 'review'`. Admin → Integrations lists them with Forget.
  - Pure adapter code: `supabase/functions/_shared/integrations.ts` (Creators API mapping, delimited feeds, tracking-URL unwrapping, affiliate links), tested by `packages/shared/src/integrations.test.ts`.
  - **Amazon compliance:** API prices show only while < 60 minutes old (a `variant_offer_ranking` read-time guard plus `enforce_offer_freshness` every 5 min; `max_age_minutes` ≤ 60 is a check constraint). They're never written to `price_points`, raw API records are purged after 24 h (`purge_api_payloads`), MAP-restricted prices aren't shown, and the app shows "Price as of …" and Amazon's required disclaimer on Product, All offers and Deal detail.
  - Affiliate links: `affiliate_programs.tag_template` (query tag, e.g. Amazon `tag=…`) and/or `link_template` (network click URL with `{url}`, e.g. AvantLink). `go` applies them; wrapper hosts must be on `AFFILIATE_LINK_HOSTS`.
  - Secrets are Edge Function env only (`supabase/functions/.env.example`): `AMAZON_CREATORS_CLIENT_ID/_SECRET`, `AMAZON_PARTNER_TAG`, `FEED_URL_*`.
  - Local run: `npm run mock:integrations` (port 54399), put the mock URLs in `supabase/functions/.env` (see `.env.example`), `npx supabase functions serve --env-file supabase/functions/.env`, then turn the sources on.
- **Database:**
  - Every table gets RLS in the migration that creates it, plus pgTAP tests in `supabase/tests`.
  - Definer functions use `set search_path = ''`.
  - plpgsql pitfall: parameter/column name clashes. Qualify them as `fn_name.param`.
  - Staff checks: `is_staff()` reads the `app_role` JWT claim. In tests, set claims with `set_config('request.jwt.claims', …)` and reset them for anon checks.
- **React Compiler lint:** no `setState` in effects (adjust state during render instead), and use Reanimated `.get()`/`.set()`.

## Open items
- **Cosmetic fixes noticed by the user on the phone (Oct 5)**, to tackle later: product page with store images and description. Ask the user for the specifics.
- **Remaining on-device checks** (checklist in `docs/DEVICE_SETUP.md`):
  - Dark-mode toggles after the `ui/Toggle` fix (knob turns dark when on). The web preview can't show it.
  - The Phase 7 exit criterion: a smooth 500-pin map on the phone (the pin rendering itself is verified).
  - Native dialogs, inbox swipe actions, composer and keyboard, Dynamic Type, Get deal in the in-app browser.
  - Push: quiet hours and the badge clearing after reading; receipt handling with real tickets.
  - Verified on device (Oct 4–5, 2026): email sign-in; push (message push, tap opens the thread, badge); camera and library photos (compressed to ≤2048 px JPEG 0.8, EXIF/GPS stripped); current location and City/ZIP area; publishing in under 60 s; listing photos and the map pin.
- **Sign in with Apple fails on device ("Sign Up Not Complete" in Apple's sheet; Oct 3, 2026).** Email sign-in works. The capability is ticked on `app.pickledeals` and the same team's other app (dreambreaker) signs in fine, which matches Apple's known server-side issue with new App IDs (forum thread 837986; Apple fixes it by re-registering the App ID). The user may file a DTS request (a draft is in the Oct 3 conversation). No code change expected; retest after Apple replies.
- **Decision (Oct 4, 2026): track every retailer except Amazon.** `retailers.tracking_excluded` (forced on for amazon.* domains by trigger) keeps offers out of `variant_price_stats` (best price, deal quality, lows), target-price alerts, saved-product price drops, tracking-based deals ("below typical" / "lowest we've tracked") and the LOWEST PRICE / HOT DEAL badges and deal quality in `deal_feed`. Amazon still lists, ranks and links (discovery). The app says "Price history and alerts don't include Amazon" and hides Price alert on Amazon-only products. The user accepted the remaining risk that Amazon's rule is app-wide. Migration `20261015000000_tracking_exclusions.sql`, tests `13_tracking_exclusions`.
- **Amazon Associates (researched Oct 4, 2026). Read this before adding any Amazon tag:**
  - Program Policies: "Unless otherwise agreed by Amazon, your Site must not have price tracking and/or price alerting functionality" ("Site" includes apps). The tracking exclusion above is the user's accepted mitigation.
  - **The Amazon tag stays out of the seed and out of production until after launch.** For local tests, set it in admin → Retailers → Amazon (network `amazon-associates`, tag `tag=pickledeals-20`). The user's tracking ID is `pickledeals-20`; they shouldn't buy through their own links.
  - Mobile apps: must be live in an app store and registered in Associates Central, use the app's own tracking ID, not emulate Amazon's app, and not render Amazon pages in WebViews. Amazon links should open in Safari or the Amazon app, not `expo-web-browser` (change before tagging).
  - Creators API access: at least 10 qualifying sales in the trailing 30 days per marketplace (rolling). Credentials: Associates Central → Tools → Creators API. OffersV2 has price, savingBasis, savings, availability, merchant and dealDetails, but **no promotions, shipping or lowest new/used summaries**. Show "shipping at checkout" for Amazon, and the lowest used price only if provided.
  - Required notices when live: "As an Amazon Associate I earn from qualifying purchases" and "CERTAIN CONTENT THAT APPEARS IN THIS APPLICATION COMES FROM AMAZON…". ASINs may be stored indefinitely; images can't be cached.
  - **Promo codes:** sellers can share Percentage Off codes with Associates. They appear in Associates Central → Promotions → Amazon Promo Codes (Amazon's guide is a 2020 Amazon Live document). There's no API, and scraping Associates Central is off-limits (Conditions of Use). Rules on reposting codes publicly aren't documented. The plan: manual entry or a file import (if the page has an export) of ASIN + code + % → the existing promo engine computes "$X after code" once API prices exist.
  - Post-launch design idea (not built): **Amazon-only code deals** keyed by ASIN without a catalog product (DealSeek-style); needs the user's go-ahead.
- **Integrations need the user:**
  - Amazon Creators API credentials (after launch, see above). Verify `AMAZON_RESOURCES` names and `externalIds` casing against a live response.
  - An AvantLink account approved for Selkirk (or another network/merchant): the datafeed download URL and its column names (editable in admin → Integrations → Settings), plus the AvantLink click URL (`mi`/`pw`) on Retailers.
  - Legal review: notifications that quote prices are kept longer than 24 hours (relevant once Amazon API prices exist; Amazon is excluded from alerts).
- **Possible small follow-ups (offered, not requested):** an optional git-ignored local setting so the Amazon tag survives `db reset` on the user's machine only.
- **Admin follow-ups:**
  - Sponsored clicks aren't attributed exactly: the app opens a deal's detail from the trending row, so `outbound_clicks.placement` never says "sponsored".
  - A pending listing hidden by a suspension comes back as active when the suspension is lifted.
  - Removed listings don't appear in My listings; the seller reaches them from the notification.
- **Need the user:**
  - Sign in with Apple key (.p8 and Key ID) for token revocation (goes in `supabase/functions/.env`, never chat or git)
  - a decision on a staging Supabase project (costs money; the user prefers local)
  - Vault secrets for production push dispatch
- **Known web-only quirks; iOS is unaffected:**
  - the native tab bar renders on top of headers
  - Switch thumbs are teal (web ignores `thumbColor`)
  - the map is a flat stand-in (drag to pan, +/− to zoom), and the tab bar covers the map's search row
  - `chooseAction` uses `window.prompt` and the photo picker needs the file-input stub
  - City/ZIP search is native-only (expo-location geocoding)
