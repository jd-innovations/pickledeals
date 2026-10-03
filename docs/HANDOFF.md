# PickleDeals — session handoff (after Phase 6)

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
- **Never call Supabase `create_project`**; projects cost money and the user doesn't want to pay. Everything runs on local Docker.
- Commits are made from Bash with a heredoc (`git commit -F -`); PowerShell mangles quotes.
- Before calling work done:
  - `npm run typecheck && npm run lint && npm test`
  - `npm run build -w apps/admin`
  - `npx supabase test db`
  - `npm run catalog:seed -- --check`
- In PowerShell use `npm.cmd` / `npx.cmd`, because `npm.ps1` is blocked.
- Add mobile packages with `npx expo install`, and check the SDK 57 docs before using an Expo/RN API.

## Status
- Phases 0–6 are done. The last commit is `748279d` ("Phase 6: marketplace app …"), pushed.
- **Next: Phase 7, the map.** It covers:
  - the Market map view (the Grid/Map toggle currently shows "Map view is coming soon")
  - the approximate-area map on the listing detail and on the sell Details step (each currently a pin card)
  - MapPreview / MarketMap / DarkMap designs in `preview/`
- D2 still applies: clients only ever get the snapped geohash-6 (~1 km) cell centre. Never return exact coordinates from a public table, view or RPC. A map RPC must return snapped cell points or cluster counts only, never `listing_locations.public_point` per listing beyond the snapped centre.
- Check the §13 Phase 7 scope and its exit criterion first, then propose the plan to the user.

## Local environment
- **Supabase CLI 2.119 on Docker.**
  - Commands: `npx supabase start`, `npx supabase db reset` (re-seeds), `npx supabase test db`.
  - Regenerate types (from Bash, so the file has no BOM/CRLF): `npx supabase gen types typescript --local > packages/shared/src/database.types.ts`
  - Studio: http://127.0.0.1:54323
  - Mailpit: http://127.0.0.1:54324. Sign-in codes are in the API at `/api/v1/messages`.
- **Dev servers** (`.claude/launch.json`):
  - `mobile-web` on :8081 (the Expo web preview, checked at the mobile viewport)
  - `admin` on :5174
  - `pickledeals-preview` on :5173 (the design files)
- **Seeded local accounts:**
  - Dev admin `admin@pickledeals.test` (admin role) signs in with an email code from Mailpit.
  - Three fictional sellers (Marcus T., Priya K., Jordan R.) with 8 listings around Sarasota, FL. One custom wooden paddle sits in the review queue.
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
- **Database:**
  - Every table gets RLS in the migration that creates it, plus pgTAP tests in `supabase/tests`.
  - Definer functions use `set search_path = ''`.
  - plpgsql pitfall: parameter/column name clashes. Qualify them as `fn_name.param`.
  - Staff checks: `is_staff()` reads the `app_role` JWT claim. In tests, set claims with `set_config('request.jwt.claims', …)` and reset them for anon checks.
- **React Compiler lint:** no `setState` in effects (adjust state during render instead), and use Reanimated `.get()`/`.set()`.

## Open items
- **Not yet verified on a real iPhone:**
  - camera and photo library
  - reverse geocoding and city/ZIP search
  - native dialogs
  - push delivery (Expo → APNs)
  - the "list in under 60 seconds" timing. The automated browser run took 77 s, inflated by tool overhead.
- **Need the user:**
  - Apple key and Team ID (Sign in with Apple token revocation)
  - Expo/EAS project setup and a dev build
  - a decision on a staging Supabase project (costs money; the user prefers local)
  - Vault secrets for production push dispatch
- **Placeholders to wire up later:**
  - Message and Make offer on the listing detail, plus offer/chat counts on My listings (messaging and offers phases)
  - "Report listing/seller"
  - the Notifications settings row
- **Known web-only quirks; iOS is unaffected:**
  - the native tab bar renders on top of headers
  - Switch thumbs are teal
