# PickleDeals — Technical Architecture & Implementation Plan

Status: **APPROVED with decisions D1–D8 below** · Oct 1, 2026
Design source of truth: the approved PickleDeals design canvas (mirrored locally in `preview/`).
Where a decision below conflicts with a later section, the decision wins.

---

## 0. Decision log (approved)

**D1 — Amazon prices.** No manually entered or unverified Amazon prices are ever displayed.
- `retailer_offers` gains `price_display` (`show` | `check_price`) and `price_source` (`manual` | `feed` | `api`).
- Amazon offers exist with `price_display = 'check_price'` and render a **"Check price on Amazon"** CTA, not a price. They are excluded from best-price ranking and from `variant_price_stats`.
- A later approved API or feed sets `price_source = 'api'` and flips `price_display` with no schema change.
- Other retailers and brands display prices only where we have permission or reliable data: `retailers.price_display_default`.

**D2 — Location: about 1 km public precision, with public and private data split.**
- `listing_locations` holds only the snapped public point (geohash-6 cell centre), `area_label` and `postal_code`. This is all any client-facing table, view or RPC can return.
- Exact coordinates are not persisted in V1. The device sends a point to the `set_listing_location` RPC, which snaps it before writing.
- If a private location is ever needed (e.g. a seller's saved home pickup point), it goes in a separate `listing_locations_private` table with owner-only RLS and is never joined into public views.
- Meet-up spots are only voluntary `location_share` chat messages, visible to participants.

**D3 — Custom marketplace items are allowed.**
- The sell flow leads with **Search / Select existing product**, then "Can't find it? List a custom item".
- Custom listings have `product_id = null` plus `custom_title`, optional `custom_brand_text` / `brand_id`, a required `category_id`, and the normal listing fields.
- They never auto-create catalog rows. An admin review queue (`listing_catalog_reviews`: listing, suggested product, decision) can **link** a listing to an existing product or **promote** it into a new draft product.

**D4 — Map: Apple Maps / MapKit via `react-native-maps` on iOS**, behind a `features/map` abstraction.
- Components: `<ListingMap>`, `<PriceMarker>`, `<ClusterMarker>`, and a `useMapViewport()` hook emitting bounds.
- Provider-specific code stays inside the adapter, so another provider could be added later.
- Clustering: `supercluster` on the client.

**D5 — Native iOS tab bar** (Expo Router native tabs), with tabs **Deals · Marketplace · Sell · Alerts · Profile**.
- Sell is a native tab item that opens the sell flow as a modal. It uses the best native representation (a prominent SF Symbol), not a custom-drawn black circle.
- This tab set replaces the "Watchlist / Inbox" tabs proposed in the design:
  - **Alerts** contains Activity (notifications), Price alerts and Saved.
  - **Messages** is reached from Profile and from the conversation entry points (listing, offer, push). It also has a badge on the Profile tab.
- *To confirm in Phase 0 review.*

**D6 — Browse without an account; auth only at the moment of intent.**
- Browsing, search, categories, products, offer comparison, listings, the map and seller profiles are all public (the `anon` role can read).
- Save, alert, follow, message, offer, list and manage call `requireAuth(intent)`. This presents a lightweight native auth sheet (Sign in with Apple and email code), then **resumes the original intent** (e.g. completes the save, or opens Make offer).
- Supabase anonymous sign-in is **not** used in V1, so §5's anonymous-session proposal is withdrawn.

**D7 — One repository** containing `apps/mobile`, `apps/admin`, `packages/*` and `supabase/`.
- Environments: local (Supabase CLI + Docker), staging and production projects.
- The admin app stays minimal until Phase 2.

**D8 — Image provenance is first-class.**
- `product_images` gains `source` (`brand_supplied` | `manufacturer_site` | `retailer_feed` | `affiliate_feed` | `owned`), `source_url`, `license_note`, `rights_expires_at?`, `is_cutout`, `added_by`, `status` (`active` | `pending_review` | `removed`).
- No arbitrary scraping.
- The `ProductImage` component renders both cutouts (tinted tile) and full photographs (edge-to-edge, `cover`) based on `is_cutout`.
- Catalog images and C2C `listing_images` are separate tables and separate buckets.

**Scope guard:** deferred systems (Amazon API, automated ingestion, payments, shipping, reputation) get **seams only**: a column, an enum value, or a nullable foreign key. They get no speculative tables or services.

---

## 1. Current repository assessment

| Item | Finding |
|---|---|
| Source code | None. The folder contains only `preview/` (design boards, a local preview runtime, `canvas.json`) and `.claude/launch.json`. |
| Version control | Not a git repository. |
| Toolchain | Node 20.16, npm 10.8, Python 3.12. Expo CLI is not installed globally (fine — use `npx expo`). |
| Supabase | No PickleDeals project exists in the connected org. Related-looking projects exist (`paddlewiz`, `C2C appraisal`) but they are paused, so **I recommend a fresh project**. |
| Design assets | `preview/pd.css` holds the approved semantic tokens (light and dark), and `preview/*.dc.html` is the screen inventory. Product art in the design is a placeholder for real background-removed photography. |

**Implication:** this is a greenfield build. The first decisions (repo layout, environments, schema conventions) are cheap now and expensive later, so section 15 lists the ones to decide before Phase 0.

---

## 2. Recommended application architecture

```
┌────────────────────────── iOS app (Expo / React Native, TypeScript) ──────────────────────────┐
│ Expo Router (file routes, typed)  ·  Design system (tokens → themed primitives → commerce UI)  │
│ TanStack Query (server state, cache, optimistic updates)  ·  Zustand (small client state)      │
│ Feature modules: catalog · deals · alerts · marketplace · map · chat · offers · notifications  │
│ supabase-js (Auth, PostgREST, RPC, Storage, Realtime)                                           │
└───────────────┬──────────────────────────────────────────────────────────────┬─────────────────┘
                │ RLS-protected tables, views, SECURITY DEFINER RPCs            │ Realtime (private channels)
┌───────────────▼──────────────────────────────────────────────────────────────▼─────────────────┐
│ Supabase                                                                                         │
│  Postgres 17 + PostGIS + pg_trgm + pgmq (Queues) + pg_cron + pg_net                              │
│  Auth (Apple, email OTP; optional Google; anonymous browsing)                                    │
│  Storage (catalog, avatars, listing-images, chat-images)                                         │
│  Realtime (Broadcast from DB for chat and inbox; Broadcast for typing; Presence optional)       │
│  Edge Functions: go (affiliate redirect), dispatch-notifications, evaluate-alerts,               │
│                  ingest-* (manual/CSV now, APIs later), delete-account, image-postprocess        │
└──────────────────────────────────────────────────────────────────────────────────────────────────┘
        ▲ admin web (Phase 2 minimal → Phase 11 full), same database, admin role via JWT claim
```

Principles:

1. **The catalog is the hub.** Every offer, deal, promo, alert and listing resolves to `product` (and to `product_variant` where known).
2. **The database enforces the rules.** State machines (offers, listing status) run in Postgres functions inside a transaction, never as client-side sequences of writes.
3. **Thin client and typed contracts.** Types are generated from the schema (`supabase gen types`), Zod validates at the boundaries, and every query and RPC lives in a feature `api.ts`.
4. **Honest ranking lives on the server.** "Best price" is computed in SQL from consumer-facing price data only. Commission data is not readable by clients or by the ranking views.
5. **Ephemeral stays ephemeral.** Typing and presence never touch tables.

---

## 3. Proposed directory structure

I recommend npm workspaces from day one. Admin web and shared code can then be added without a repo migration.

```
pickledeals/
├─ apps/
│  ├─ mobile/                         # Expo app
│  │  ├─ app/                         # Expo Router routes (thin: compose feature screens)
│  │  │  ├─ _layout.tsx               # providers: theme, query, auth, notifications
│  │  │  ├─ (tabs)/
│  │  │  │  ├─ _layout.tsx            # Deals · Pre-owned · [Sell] · Watchlist · Inbox
│  │  │  │  ├─ deals/index.tsx
│  │  │  │  ├─ market/index.tsx       # grid ⇄ map toggle lives in this stack
│  │  │  │  ├─ market/map.tsx
│  │  │  │  ├─ watchlist/index.tsx
│  │  │  │  └─ inbox/{index,activity}.tsx
│  │  │  ├─ search.tsx
│  │  │  ├─ product/[id]/{index,offers,history}.tsx
│  │  │  ├─ deal/[id].tsx
│  │  │  ├─ category/[slug].tsx · brand/[slug].tsx
│  │  │  ├─ listing/[id].tsx · seller/[id].tsx
│  │  │  ├─ conversation/[id].tsx
│  │  │  ├─ sell/_layout.tsx + {product,photos,condition,price,details,preview}.tsx   # fullScreenModal stack
│  │  │  ├─ (sheets)/{price-alert,make-offer,counter-offer,market-filters,manage-listing}.tsx  # formSheet
│  │  │  ├─ profile/{index,listings,notifications,appearance,account}.tsx
│  │  │  └─ (auth)/{welcome,sign-in}.tsx
│  │  ├─ src/
│  │  │  ├─ design/      tokens.ts · theme.tsx · typography.ts · spacing.ts · haptics.ts
│  │  │  ├─ ui/          primitives: Text, Button, IconButton, Chip, SegmentedControl, Switch,
│  │  │  │               SearchField, Sheet, ListRow, Skeleton, EmptyState, ErrorState, GlassBar
│  │  │  ├─ commerce/    ProductImage, PriceBlock, DiscountPill, DealBadge, DealCard, ProductCard,
│  │  │  │               ListingCard, RetailerRow, PromoCodeRow, ConditionBadge, DealQualityMeter,
│  │  │  │               UsedVsNew, SellerIdentity, FavoriteButton, PriceAlertControl
│  │  │  ├─ features/<name>/   api.ts (queries/RPC) · hooks.ts · components/ · screens/ · types.ts
│  │  │  ├─ lib/         supabase.ts · queryClient.ts · format/{money,distance,time}.ts · linking.ts
│  │  │  └─ types/database.ts           # generated, never hand-edited
│  │  ├─ app.config.ts · eas.json
│  ├─ admin/                           # Phase 2 (minimal) → Phase 11; Next.js or Vite + supabase-js
├─ packages/
│  └─ shared/                          # zod schemas, enums, money/condition helpers, token JSON
├─ supabase/
│  ├─ config.toml
│  ├─ migrations/                      # SQL migrations (only source of schema truth)
│  ├─ functions/                       # Edge Functions (Deno)
│  ├─ seed/                            # seed.sql + catalog CSVs
│  └─ tests/                           # pgTAP: RLS + state-machine tests
├─ docs/                               # this plan, ADRs
└─ preview/                            # approved design (reference only)
```

Rule: **routes compose; features own logic; `ui/` and `commerce/` own all visuals.** A screen file should rarely contain styling.

---

## 4. Database / schema plan

### Conventions
- `uuid` primary keys (`gen_random_uuid()`), `timestamptz` everywhere, `created_at`/`updated_at` with a trigger.
- **Money is integer cents** (`*_cents int`) plus `currency char(3) default 'USD'`. No floats.
- Postgres enums for stable sets (`listing_condition`, `listing_status`, `offer_status`, `message_kind`). Lookup tables for sets that grow (retailers, categories).
- Each schema area lives in its own migration file. RLS is enabled in the same migration that creates the table.

### 4.1 Identity
| Table | Key columns | Notes |
|---|---|---|
| `profiles` | `id` (= `auth.users.id`), `display_name`, `avatar_path`, `area_label`, `member_since` | Created by trigger on signup. Public fields only. |
| `profiles_private` | `user_id`, `phone_verified_at`, `home_area geography(Point)` (already approximate), `search_radius_m`, `appearance` | Owner-only RLS. |
| `user_roles` | `user_id`, `role` (`admin`,`editor`) | Exposed to the JWT through a Custom Access Token hook → `auth.jwt()->>'app_role'`. |
| `user_blocks` | `blocker_id`, `blocked_id` | Required for App Store UGC rules (Guideline 1.2). |
| `reports` | `reporter_id`, `target_type`, `target_id`, `reason`, `status` | Moderation queue for listings, users and messages. |

### 4.2 Canonical catalog (the hub)
| Table | Key columns | Notes |
|---|---|---|
| `brands` | `slug` uniq, `name`, `logo_path`, `website_url`, `is_active` | |
| `categories` | `slug` uniq, `name`, `parent_id`, `sort`, `variant_axes text[]` | Tree. `variant_axes` declares which attributes create variants (paddles: `thickness`; shoes: `color`). |
| `products` | `brand_id`, `category_id`, `slug` uniq, `name`, `model_year`, `msrp_cents`, `specs jsonb`, `status` (`draft/active/discontinued`), `search tsvector` (generated) | One row per model, e.g. "Perseus Pro IV". |
| `product_variants` | `product_id`, `label` ("16mm"), `attributes jsonb`, `msrp_cents` (override), `is_default` | **Every product has ≥1 variant.** Offers bind to variants. |
| `product_identifiers` | `variant_id`, `kind` (`gtin`,`upc`,`ean`,`asin`,`mpn`,`retailer_sku`), `value`, `retailer_id` | `unique(kind, value, retailer_id)`. The matching key for ingestion. |
| `product_aliases` | `product_id`, `alias` | "perseus 4", "pro iv" — used by search and the matcher. |
| `product_images` | `product_id`, `variant_id?`, `storage_path`, `sort`, `width`, `height`, `blurhash`, `is_cutout` | Background-removed "cutout" images keep the monochrome tile design working in both themes. |

**Variant granularity decision:** variants are created only along **price-relevant** axes (thickness, shape, generation). Shoe **size** is *not* a variant — it is offer-level availability (`retailer_offers.available_sizes`) and a listing attribute. This prevents a combinatorial explosion of variants.

### 4.3 Retail offers, deals, promos, price intelligence
| Table | Key columns | Notes |
|---|---|---|
| `retailers` | `slug`, `name`, `kind` (`marketplace/retailer/manufacturer`), `domain`, `logo_path` | |
| `affiliate_programs` | `retailer_id`, `network`, `tag_template`, `commission_notes` | **No client access.** Never joined by ranking views. |
| `retailer_offers` | `variant_id`, `retailer_id`, `source_id`, `external_ref`, `url`, `price_cents`, `shipping_cents`, `in_stock`, `available_sizes text[]`, `status`, `first_seen_at`, `last_checked_at` | **Current state only.** `unique(variant_id, retailer_id, external_ref)`. |
| `price_points` | `offer_id`, `observed_at`, `price_cents`, `shipping_cents`, `in_stock` | Append-only. Written on change plus a daily heartbeat. Index `(offer_id, observed_at desc)`. Partition by month when large. |
| `promo_codes` | `retailer_id`, `brand_id?`, `code`, `discount_type` (`percent/amount/free_ship`), `discount_value`, `min_purchase_cents`, `scope`, `starts_at`, `ends_at`, `verified_at`, `is_exclusive`, `source_id` | |
| `promo_code_targets` | `promo_id`, `product_id?`, `variant_id?`, `category_id?` | Lets the "$195 with DINK15" row be computed instead of typed. |
| `deals` | `variant_id`, `offer_id?`, `promo_id?`, `kind` (`price_drop/sale/promo/editorial`), `headline`, `starts_at`, `ends_at`, `status`, `is_staff_pick`, `created_by`, `origin` (`auto/curated`) | A deal is a **time-bounded, noteworthy state of an offer**, not a separate product. Replaces the proposed `deal_events`. |
| `collections` / `collection_items` | slug, title, kind (`editorial/sponsored`), items → product/deal | Powers "Staff picks", "Shoes on sale". |
| `placements` | `kind` (`sponsored_deal/product/collection`), `target_id`, `campaign`, `starts_at`, `ends_at`, `label` | Sponsored inventory is separate and always labelled. It never changes "best price". |
| `variant_price_stats` | `variant_id` PK, `best_offer_id`, `best_delivered_cents`, `typical_cents` (90-day median), `low_30d`, `low_90d`, `low_all_time`, `deal_quality` (enum), `updated_at` | Derived. Refreshed by a queue worker when an offer changes. |
| `variant_market_stats` | `variant_id` PK, `active_listings`, `min_ask_cents`, `used_p25_cents`, `used_p75_cents` | Derived from listings (sold prices are weighted more heavily). Powers "Typical used $105–$135". |
| `outbound_clicks` | `user_id?`, `offer_id?`, `promo_id?`, `placement`, `created_at` | Written by the `go` redirect function. |

**Best-price rule (SQL view `variant_offer_ranking`):** `delivered = price + shipping − best applicable verified promo`, ordered ascending, ties broken by `in_stock` then `last_checked_at`. The view selects nothing from `affiliate_programs`, and a pgTAP test enforces that.

### 4.4 User intent
| Table | Notes |
|---|---|
| `saved_products(user_id, product_id)` · `saved_deals(user_id, deal_id)` · `saved_listings(user_id, listing_id)` | Separate tables keep real foreign keys and cascades (better than one polymorphic table). PK `(user_id, target_id)`. |
| `brand_follows(user_id, brand_id)` | |
| `saved_searches(user_id, scope, query, filters jsonb, center geography?, radius_m, notify)` | |
| `price_alerts(user_id, product_id, variant_id?, target_cents, include_new, include_used, min_condition, radius_m, status, last_notified_at, last_notified_cents)` | `unique(user_id, product_id, coalesce(variant_id,…))`. |

### 4.5 Marketplace
| Table | Key columns | Notes |
|---|---|---|
| `listings` | `seller_id`, `product_id?`, `variant_id?`, `category_id` (required), `custom_title?`, `condition` enum (`new_sealed, like_new, excellent, good, fair`), `price_cents`, `accepts_offers`, `description`, `pickup`, `ships`, `status` enum (`draft, active, pending, sold, removed`), `sold_to_user_id?`, `sold_price_cents?`, `published_at`, `sold_at` | `check (product_id is not null or custom_title is not null)`. Status changes go only through RPCs. |
| `listing_private` | `listing_id`, `hide_offers_below_cents` | Seller-only, so buyers can't read the auto-decline floor. |
| `listing_images` | `listing_id`, `storage_path`, `sort`, `width`, `height`, `blurhash` | |
| `listing_locations` | `listing_id` PK, `public_point geography(Point,4326)`, `geohash6`, `area_label`, `postal_code` | **Approximate only — see §8.** GIST index on `public_point`. |

### 4.6 Conversations, messages, offers
| Table | Key columns | Notes |
|---|---|---|
| `conversations` | `listing_id`, `buyer_id`, `seller_id`, `last_message_at`, `last_message_preview` | `unique(listing_id, buyer_id)`. V1 chats are always about one listing, between two people. |
| `conversation_participants` | `conversation_id`, `user_id`, `role`, `last_read_at`, `muted`, `archived_at` | Per-user state. Keeps RLS simple and allows group threads later without a migration. |
| `messages` | `id bigint identity` (ordering), `conversation_id`, `sender_id?` (null = system), `kind` (`text, image, offer_event, status_event, location_share`), `body`, `image_path`, `offer_id?`, `meta jsonb`, `client_id uuid`, `created_at` | `unique(conversation_id, client_id)` gives idempotent retries. Index `(conversation_id, id desc)`. |
| `marketplace_offers` | `listing_id`, `conversation_id`, `buyer_id`, `seller_id`, `proposed_by`, `parent_offer_id`, `amount_cents`, `message`, `status` (`pending, accepted, declined, countered, withdrawn, expired`), `expires_at`, `responded_at` | **Partial unique index: one `pending` offer per conversation.** The negotiation chain is linked through `parent_offer_id`. |
| `agreements` *(optional, recommended)* | `offer_id`, `listing_id`, `buyer_id`, `seller_id`, `amount_cents`, `created_at` | Written when an offer is accepted. **The future payments hook:** `payment_intents` would reference `agreements`, so no offer redesign is needed later. |

### 4.7 Notifications
| Table | Notes |
|---|---|
| `notification_preferences(user_id, category, push, in_app)` + `quiet_start`, `quiet_end`, `tz`, `daily_deal_cap` on `profiles_private` | |
| `push_tokens(user_id, expo_token, device_id, platform, last_seen_at, revoked_at)` | |
| `notifications(user_id, type, title, body, route, data jsonb, dedupe_key, created_at, read_at, push_status, pushed_at)` | `unique(user_id, dedupe_key)`. This table also backs the in-app **Activity** feed. |

### 4.8 Ingestion staging (see §9)
`ingestion_sources`, `ingestion_runs`, `raw_offer_records` (payload plus normalized fields plus `match_status`, `matched_variant_id`, `match_confidence`).

### Key indexes
- `products(search)` GIN; `product_aliases(alias gin_trgm_ops)`; `brands(name gin_trgm_ops)`.
- `retailer_offers(variant_id) where status='active'`; `price_points(offer_id, observed_at desc)`.
- `deals(status, ends_at)`; `deals(variant_id)`.
- `listings(status, published_at desc)`; `listings(product_id) where status in ('active','pending')`; `listings(seller_id, status)`.
- `listing_locations using gist(public_point)`.
- `messages(conversation_id, id desc)`; `conversation_participants(user_id, conversation_id)`.
- `marketplace_offers(conversation_id) where status='pending'` (unique); `marketplace_offers(expires_at) where status='pending'`.
- `notifications(user_id, created_at desc)`.

---

## 5. Authentication architecture

- **Providers:** Sign in with Apple (native, via `expo-apple-authentication` → `signInWithIdToken`) and **email one-time code**. Google is optional; adding any third-party login requires offering Apple too. No passwords in V1.
- **Browsing without an account:** deals, product pages, listings and the map are public. Saving, alerts, listing, messaging and offers require an account.
  - Recommended: Supabase **anonymous sign-in** on first launch, so saves and alerts work immediately. "Create account" then links an identity, keeping the user id and data.
  - RLS blocks anonymous users from listing, messaging and offering (`auth.jwt()->>'is_anonymous' = 'false'`).
- **Session storage:** the Supabase session exceeds SecureStore's size limit. Use the documented pattern: an AES key in `expo-secure-store` encrypts the session in AsyncStorage (or MMKV).
- **Profile bootstrap:** a trigger on `auth.users` inserts `profiles` and `profiles_private`.
- **Roles:** `user_roles` → Custom Access Token hook → `app_role` claim → an `is_admin()` SQL helper.
- **Account deletion (App Store requirement):** the `delete-account` Edge Function (service role) removes listings and images, anonymizes the sender on messages ("Deleted user"), revokes tokens and deletes the auth user.
- **Deep links:** `pickledeals://` plus universal links on `pickledeals.app` (used for auth callbacks, shared listings and push routes).

---

## 6. Storage architecture

| Bucket | Access | Path | Notes |
|---|---|---|---|
| `catalog` | public read · admin write | `products/{product_id}/{uuid}.webp` | Background-removed cutouts at 2048 px max. |
| `brand-logos` | public read · admin write | `{brand_id}.svg/png` | |
| `avatars` | public read · owner write | `{user_id}/{uuid}.jpg` | |
| `listing-images` | public read · owner write to own folder | `{seller_id}/{listing_id}/{uuid}.jpg` | Unguessable paths. Deleted when the listing is removed or sold plus 30 days. |
| `chat-images` | **private** · participants only | `{conversation_id}/{uuid}.jpg` | Storage RLS checks participation and serves short-lived signed URLs. |

Client pipeline (`expo-image-picker` → `expo-image-manipulator`):
- Resize to 2048 px on the long edge and re-encode to JPEG at 0.8 quality.
- **Re-encoding strips EXIF, which includes GPS.** This is a privacy requirement, not an optimization.
- Upload directly to Storage, then insert `listing_images`.

Server side: a thumbnail strategy using Supabase image transformations (Pro plan) or an `image-postprocess` function that writes 400/800 px variants and a blurhash.

Display: `expo-image` with blurhash placeholders, memory-and-disk caching, and a fixed aspect ratio, so cards never reflow.

---

## 7. Realtime / chat architecture

**Persisted (Postgres):** conversations, participants (including `last_read_at`), messages (text, image, offer_event, status_event, location_share), offers, agreements, and blocks.

**Ephemeral (Realtime only):** typing indicators and online presence.

**Delivery:**
1. The client inserts a message with a `client_id` and renders it optimistically as "sending".
2. The insert succeeds, and the message shows as "delivered" — the server ack *is* delivery.
3. An `AFTER INSERT` trigger calls `realtime.broadcast_changes` to the **private** topic `conversation:{id}`. A second broadcast goes to `user:{recipient}` to update the inbox row and badge.
4. Realtime authorization uses RLS on `realtime.messages`: a client may join `conversation:{id}` only if it is a participant, and `user:{id}` only if it is that user.
5. **Read receipts:** the client updates its own `conversation_participants.last_read_at` (throttled), which is broadcast to the other participant. "Read 6:44 PM" means the other participant's `last_read_at` ≥ the message's `created_at`. There are no per-message receipt rows.
6. **Typing:** client-to-client Broadcast `typing` events on the same private channel, throttled to one every 3 s and expiring after 5 s. Nothing is stored.
7. **Reconnect and backfill:** on foreground or reconnect, fetch `messages where id > last_seen_id`. Realtime is an accelerator, not the source of truth.
8. **Push:** the message trigger enqueues a `new_message` job. Push is suppressed when the recipient is viewing the conversation (presence) or has muted it.

Broadcast-from-database was chosen over `postgres_changes` because it scales better (no per-subscriber RLS evaluation on the WAL), and private channels give explicit authorization.

---

## 8. Marketplace and location architecture

**Use PostGIS — it's available on Supabase and is the right tool.**

**Privacy model: never store the seller's exact coordinates.**
1. The seller chooses an area: current location, a dragged pin, or a ZIP code. The **device** sends only the raw point *to an RPC*, not to a table.
2. The `set_listing_location` RPC snaps the point to its **geohash-6 cell center** (about 1.2 × 0.6 km) using PostGIS `ST_GeoHash` / `ST_PointFromGeoHash`. It then stores only `public_point`, `geohash6` and a reverse-geocoded `area_label` ("Lakewood Ranch, FL").
3. Because this is **grid snapping, not random jitter**, averaging many listings from the same seller can't converge on their home.
4. Distances are computed from `public_point` and **displayed rounded** (to 0.5 mi under 5 mi, then whole miles), always as approximate.
5. Meet-up spots are exchanged only as a `location_share` message in the private chat.

**Queries (SQL functions returning only public fields):**
- `listings_nearby(lat, lng, radius_m, filters, cursor)` uses `ST_DWithin` on geography and orders by `<->` distance.
- `listings_in_bounds(min_lng, min_lat, max_lng, max_lat, filters, limit 500)` powers "Search this area". It returns `{id, price_cents, public_point, thumb, condition}`.
- **Clustering in V1:** done on the client with `supercluster` over the bounded result set. If density makes 500 rows insufficient, add a server-side grid aggregate (`ST_SnapToGrid` by zoom). The RPC signature already allows it.
- Filters (category, brand, price, condition, pickup, ships, recency) are shared between list and map through one `MarketFilters` type, serialized into URL params.

**Map SDK:** `react-native-maps` with Apple Maps on iOS. Its `mutedStandard` map type plus automatic dark mode is the closest native match to the monochrome design (decision 15.4).

**Listing lifecycle RPCs:** `publish_listing`, `update_listing`, `set_listing_status(listing_id, status, buyer_id?)`, `remove_listing`. A status change inserts a `status_event` message into every open conversation about the listing, and its notifications.

**Offer state machine (SECURITY DEFINER RPCs, one transaction each):**

```
make_offer(listing, amount, msg)        → pending            (buyer; listing active and accepts offers; no pending offer in thread)
counter_offer(offer, amount, msg)       → parent: countered, new child: pending (either party, alternating)
accept_offer(offer)                     → accepted + agreements row (counterparty of proposer only)
decline_offer(offer)                    → declined
withdraw_offer(offer)                   → withdrawn (proposer only, while pending)
pg_cron every 5 min                     → expired (pending and past expires_at, default 48 h)
```

Each RPC validates the actor and state, writes the offer, inserts an `offer_event` message that references `offer_id`, and enqueues a notification. **Accepting does not change the listing status** — the seller marks it Pending or Sold explicitly, as the design specifies. Offers below `hide_offers_below_cents` are auto-declined server-side.

---

## 9. Deal ingestion architecture

The source never dictates the model. Every path flows through one pipeline:

```
source (manual form | CSV | Amazon API | affiliate feed | brand portal | price monitor)
   → ingestion_runs / raw_offer_records   (payload + normalized: title, brand, gtin/upc/asin/mpn, price, url, retailer)
   → matcher                              (1. exact identifier  2. alias + brand + trigram  3. manual review queue)
   → upsert retailer_offers (current)     + append price_points on change
   → enqueue: recompute variant_price_stats → detect deal (drop ≥ X% vs typical, or new low) → deals(origin='auto')
   → enqueue: evaluate price_alerts for the variant
```

- **V1:** the admin "Add offer" form and CSV import both write `raw_offer_records` with `source=manual` or `csv`, so day-one data exercises the same matcher and stats path as future automation.
- **Later:** each integration is an Edge Function (`ingest-amazon`, `ingest-feed-<network>`) on `pg_cron`. Each only has to produce normalized raw records.
- **Unmatched records** land in an admin review queue. Approving a match writes a `product_identifiers` row, so the next import matches automatically.
- **Promo codes** follow the same pattern. `verified_at` is set by admin verification, and stale codes (unverified for more than 14 days) are hidden.
- **Queues:** Supabase Queues (`pgmq`) carry `offer_changed`, `listing_published` and `notify` jobs, consumed by Edge Functions on a cron tick.

---

## 10. RLS and security strategy

- **RLS is on for every table, with deny by default.** Policies are written per operation, and pgTAP tests in `supabase/tests` cover every policy and RPC in CI.

| Area | select | insert / update / delete |
|---|---|---|
| Catalog, retailers, offers, deals, promos, collections, placements, stats | `anon` and `authenticated`, where `status='active'` | admin/editor only (`is_admin()`), or service role |
| `affiliate_programs`, ingestion tables | **none** (service role and admin only) | service role and admin |
| `profiles` | public (safe columns only) | owner updates own row |
| `profiles_private`, saved, follows, alerts, push tokens, notifications | owner only | owner only (notifications are inserted server-side only) |
| `listings` | public when `active/pending/sold`; owner always | insert by owner (not anonymous); update own non-status columns; **status via RPC only** |
| `listing_private` | owner only | owner only |
| `listing_locations` | public | **RPC only** (enforces snapping) |
| `conversations`, `messages`, `participants` | participants only (`is_participant()` SECURITY DEFINER helper avoids recursive RLS) | insert `text`/`image` messages as self; `offer_event`/`status_event` via RPC only; blocked users can't insert |
| `marketplace_offers`, `agreements` | buyer and seller | **RPC only** |
| Storage | per §6 | per §6 |
| Realtime topics | RLS on `realtime.messages` per §7 | — |

Additional controls:
- All SECURITY DEFINER functions set `search_path = ''`, check `auth.uid()`, and are granted to `authenticated` only.
- **Column privileges:** revoke `UPDATE (status, seller_id, sold_*)` on `listings` from `authenticated`.
- **Rate limits in RPCs:** messages (30/min), offers (10/hour per listing), new listings (20/day), and a limit on new conversations per day.
- **Abuse controls:** blocks hide each user's content from the other; reports go to a moderation queue; prohibited-item and keyword checks run on listing publish.
- **Secrets:** affiliate tags and API keys live only in Edge Function secrets. The client never builds affiliate URLs itself; it calls `go/{offer_id}`.
- **Get Deal flow:** `https://go.pickledeals.app/o/{offer_id}?pl=…` → an Edge Function logs `outbound_clicks`, applies the affiliate tag and returns a 302. The app opens it in `expo-web-browser` (SFSafariViewController).

---

## 11. Notification architecture

```
domain event (RPC / trigger / ingestion job)
  → INSERT notifications (dedupe_key)           ← also the in-app Activity feed
  → pgmq 'notify'
  → dispatch-notifications (Edge Fn, cron every 30–60 s)
       checks preferences, quiet hours (digest instead), daily deal cap, mute, viewing presence
       → Expo Push API (batched) → receipts job revokes DeviceNotRegistered tokens
```

| Event | Trigger | Dedupe key |
|---|---|---|
| Price drop / target reached | `evaluate-alerts` after `variant_price_stats` changes | `alert:{id}:{price}` |
| New deal (followed brand or saved search) | deal created | `deal:{id}` |
| Nearby listing match | `listing_published` → saved searches and used-alerts within radius | `listing:{id}` |
| Offer received / countered / accepted / declined / expiring | offer RPCs, cron | `offer:{id}:{status}` |
| New message | message trigger | `msg:{conversation}` (coalesced) |
| Listing pending or sold (for savers) | `set_listing_status` | `listing:{id}:{status}` |

The payload `route` (e.g. `/conversation/…`) deep-links through Expo Router. **Transactional notifications** (offers, messages) bypass the daily cap but respect quiet hours, using summaries. **No promotional pushes, by policy.**

---

## 12. Recommended dependencies

Expo SDK: the **latest stable at Phase 0** (pin it; New Architecture on). Use a development build (`expo-dev-client`), not Expo Go, because of maps, Apple auth and push.

| Purpose | Package |
|---|---|
| Routing | `expo-router` (typed routes, native stack, `formSheet` with detents for sheets) |
| Server state | `@tanstack/react-query` (+ persist client for offline-first cache of catalog reads) |
| Client state | `zustand` (sell draft, filters, appearance preference) |
| Forms / validation | `react-hook-form`, `zod` (schemas in `packages/shared`) |
| Backend | `@supabase/supabase-js`, generated types |
| Secure storage | `expo-secure-store` + `@react-native-async-storage/async-storage` (or `react-native-mmkv`) |
| Lists | `@shopify/flash-list` |
| Images | `expo-image`, `expo-image-picker`, `expo-image-manipulator` |
| Motion / gestures | `react-native-reanimated`, `react-native-gesture-handler`, `expo-haptics` |
| Glass / blur | `expo-glass-effect` (iOS 26 Liquid Glass) with an `expo-blur` fallback |
| Maps / location | `react-native-maps`, `supercluster`, `expo-location` |
| Charts | `react-native-svg` (custom sparkline and price chart — small, matches the design exactly) |
| Auth | `expo-apple-authentication`, `expo-auth-session` (if Google) |
| Notifications | `expo-notifications`, `expo-device` |
| Utilities | `expo-web-browser`, `expo-clipboard`, `expo-linking`, `expo-localization`, `date-fns` |
| Quality | TypeScript strict, ESLint, Prettier, Jest + `@testing-library/react-native`, **Maestro** (E2E), **pgTAP** (DB) |
| Observability | `@sentry/react-native`; product analytics (PostHog) deferred to Phase 13 |
| Delivery | EAS Build, EAS Submit, EAS Update (channels: development / preview / production) |

**No UI kit.** The design system is small and exact, and kits fight the monochrome token model.

---

## 13. Implementation phases (revised order)

I changed your sequence in four places, each driven by a dependency:
- **Retailer offers and product detail now come before deals discovery.** Deal cards and feeds need offers and price stats to exist.
- **Minimal admin and import tooling move into the catalog phase.** Without them there's no way to enter data.
- **The push foundation moves into the alerts phase.** Alerts are the first feature that needs push.
- **A hardening and launch phase is added.**

| # | Phase | Delivers | Exit criteria |
|---|---|---|---|
| **0** | Foundation and design system | Git repo, npm workspaces, Expo app (dev client), EAS profiles, Supabase **local + staging + prod**, migration workflow, type generation, CI (lint, typecheck, unit, pgTAP), Sentry. Tokens ported from `pd.css` → `design/tokens.ts`; theme provider (System/Light/Dark); typography (SF Pro, Dynamic Type); primitives and commerce components in a **component gallery screen** checked against `preview/` | Gallery matches the approved components in both themes |
| **1** | Auth and profiles | Apple and email OTP, anonymous browsing and linking, profile bootstrap, roles claim, account deletion, Appearance setting | Sign in, sign out, link and delete work on device |
| **2** | Canonical catalog and data tooling | Catalog schema, seed of about 150 products across all categories, CSV importer, **minimal admin** (catalog CRUD and image upload), Browse (categories and brands), unified search RPC (FTS + trigram, grouped results) | Search for "perseus" returns grouped results from real seed data |
| **3** | Retailer offers and product detail | Offers, promos, price points, best-price view, `variant_price_stats`, Product detail, All offers, Price history, Deal detail, `go` redirect and click logging, admin offer and promo entry through the ingestion pipeline | The product page matches the design using data entered through admin |
| **4** | Deals discovery | Deal detection job, curated deals, collections, Deals Home sections, Category and Brand detail with filter sheets, sponsored placements with labels | The home feed is fully data-driven |
| **5** | Saves, alerts and push foundation | Saved products/deals/listings, brand follows, Watchlist, price alerts, the `evaluate-alerts` job, push tokens, `dispatch-notifications`, the notifications table and Activity feed | A price change in admin triggers a push on device |
| **6** | Marketplace listings and sell flow | Listings schema, storage, the 6-step sell flow with catalog prefill, the approximate-location RPC, Marketplace Home (grid), Listing detail with used-vs-new, Seller profile, My listings, Manage status, `variant_market_stats` | A listing can be created in under about 60 seconds and appears on the product page |
| **7** | Marketplace map *(can run in parallel with 8)* | Nearby and bounds RPCs, map with price pins, clustering, Search this area, preview card, shared filters | Smooth map with 500 pins on a mid-range iPhone |
| **8** | Chat | Conversations, messages, image messages, Realtime private channels, read state, typing, inbox, blocks and reports | Two devices chat with read receipts and typing |
| **9** | Structured offers | Offer RPCs and state machine, offer cards in chat, Make offer and Counter sheets, expiry cron, agreements, status events | Every transition is covered by pgTAP; the full negotiation from the design works end to end |
| **10** | Notifications complete | All event types, preference screen, quiet hours and digests, daily caps, deep links, badge counts | Every event in §11 delivers correctly and respects preferences |
| **11** | Admin and deal operations | Full admin: matching review queue, promo verification, collections, placements, moderation queue, listing takedown, basic metrics | Operations can run without SQL |
| **12** | Affiliate and API integrations | Amazon product API (compliance-driven), one affiliate network feed, a price-monitoring scheduler, automatic identifier learning | Automated prices stay fresh within the required windows |
| **13** | Hardening and launch | Accessibility (VoiceOver, Dynamic Type), performance, offline cache, analytics, App Store review prep (UGC, deletion, privacy labels), TestFlight beta | App Store submission |

---

## 14. Dependencies between phases

```
0 ─► 1 ─► 2 ─► 3 ─► 4
          │    └──► 5 (alerts need price stats; push infra here)
          └─────────► 6 (listings need catalog + auth + storage)
                       ├─► 7 (map needs listing locations)
                       └─► 8 (chat is anchored to listings) ─► 9 (offers live in chat)
5 + 8 + 9 ─► 10 · 3/4/6 ─► 11 · 3 + 11 ─► 12 · all ─► 13
```

Parallelizable once 6 lands: **7 alongside 8**. Admin work in 11 can start incrementally from Phase 2 onwards.

---

## 15. Decisions to make now

1. **Amazon pricing compliance (high risk).** Amazon's Associates rules restrict showing Amazon prices unless they come from Amazon's product API and are refreshed within strict windows, and API access requires qualifying sales. Manually typed Amazon prices in V1 may not comply.
   - *Recommendation:* in V1, show Amazon offers with a timestamp and a "check price" fallback once stale, or omit Amazon prices until API access exists. Confirm against the current Associates Operating Agreement before launch.
2. **Exact location is never stored.** I recommend grid snapping at geohash-6 (§8). Confirm the precision: about 1 km. Geohash-5 (about 5 km) would be more private but less useful for "nearby".
3. **Custom (non-catalog) listings.** Option A: catalog-only, plus a "request a product" flow. **Option B (recommended):** allow custom items with a required category; they're excluded from product pages until an admin links them.
4. **Map SDK.**
   - **Recommended:** `react-native-maps` with Apple Maps — free, native and `mutedStandard`, but only partially monochrome.
   - **Alternative:** Mapbox — fully styled to match the design, but usage-based cost and a heavier native module.
5. **Tab bar.**
   - **Recommended:** Expo Router **native tabs** — real iOS 26 Liquid Glass tab bar, best native feel, with the Sell tab intercepted to open the modal. The centre Sell button may render as a standard tab item rather than the filled black circle.
   - **Alternative:** a custom JS tab bar reproducing the design exactly, with less native behaviour.
   - This is the one place a technical limitation may touch the approved visuals.
6. **Anonymous auth for browse-first saving** (recommended), or require an account to save anything.
7. **Repo layout:** a monorepo with npm workspaces now (recommended) or a single app.
8. **Supabase plan and environments:**
   - Use the Pro plan for production (no pausing, PITR, image transformations, more Realtime capacity).
   - Run separate staging and prod projects. Your existing free projects are paused, which is the free-tier behaviour to avoid in production.
9. **Admin surface:** a small Next.js admin in `apps/admin` (recommended) vs. Supabase Studio plus scripts, or a third-party tool. A minimal version is needed by Phase 2.
10. **Product photography source:** who supplies and background-removes catalog images (brand assets, retailer images under affiliate terms, or your own)? This affects licensing and the look of the image-tile design.
11. **Pricing scope:** USD and US only in V1. Taxes are excluded from "delivered price" (stated in the UI).
12. **Minimum iOS version:** iOS 17+ recommended, with Liquid Glass on iOS 26 and blur fallback below.

---

## 16. Deliberately deferred from V1

- C2C payments, escrow, payouts, shipping labels, transaction fees and refunds. `agreements` is the future hook.
- Seller reviews and ratings. The schema hooks are `sold_to_user_id` and `agreements`.
- Automated retailer APIs, feeds and scraping beyond one pilot (Phase 12 gates these).
- Featured or paid C2C listings and self-serve brand campaigns. `placements` exists but is admin-only.
- Server-side map clustering, a dedicated search engine (Typesense/Algolia) and ML recommendations ("For you" starts as follows + saves + category heuristics).
- Android release (architecture stays compatible), web app, iPad layout.
- Email notifications beyond auth; SMS; phone verification for sellers (optional trust signal later).
- Multi-currency and international, i18n (but externalize strings from day one).
- Auctions, social feeds, follows between users, gamification and livestream shopping (excluded by product direction).
- Video in listings; offline listing drafts beyond the in-memory sell draft.
