# TestFlight launch checklist

Audit of Oct 11, 2026. Goal: PickleDeals on TestFlight this week.
✅ done · ⬜ to do · 👤 needs the owner (Apple/Vercel/App Store Connect accounts, decisions) · 🛠 Claude can do it once approved.

## Two stages

| Stage | Who can test | Apple review | Needs |
|---|---|---|---|
| **1. Internal testing** (target: Tue–Wed) | Up to 100 people on the App Store Connect team | None, available minutes after processing | App record, production build, testers added as App Store Connect users |
| **2. External testing** (target: Thu–Fri) | Up to 10,000 by email or public link | Beta App Review, usually within 1–2 days | Everything in stage 1 + test information, privacy policy URL, a way for the reviewer to sign in |

## Blockers

1. ⬜ 👤 **Sign in with Apple still fails on device** ("Sign Up Not Complete", open since Oct 3). If a tester or the
   reviewer taps it, it fails. Guideline 4.8 only requires Apple sign-in when the app offers a third-party login
   (Google, Facebook…); email codes are PickleDeals' own accounts, so Apple sign-in is optional.
   **Recommendation:** hide the Apple button in TestFlight builds until Apple fixes the App ID (🛠 small change,
   one setting), and keep the DTS request going.
2. ⬜ 👤 **Production build must be run interactively once.** The app now asks for Associated Domains (links open
   the app), and the App Store distribution profile needs that capability, which EAS can only turn on with your
   Apple sign-in: `cd apps/mobile` → `npx eas-cli build --profile production --platform ios` → sign in when asked.
   Same reason the postponed preview build failed (build `d6293119`).
3. ⬜ 👤 **App record in App Store Connect** (bundle ID `app.pickledeals`, SKU e.g. `pickledeals-ios`, name
   "PickleDeals"). EAS Submit can create it during the first `npx eas-cli submit --platform ios --latest`, or create
   it at appstoreconnect.apple.com → Apps → +. Note the Apple ID number it gets (for `eas.json` → `submit.production.ios.ascAppId`, 🛠).
4. ⬜ 👤 **Reviewer sign-in (external stage only).** Sign-in is an emailed code, which the reviewer can't receive.
   Options:
   - (a) **Review account with a password** (recommended): a single `review@pickledeals.app` account; the
     sign-in screen shows a password field only after that exact email is typed. 🛠 small change + a migration-free
     Supabase user. Credentials go in App Store Connect's test information, nowhere else.
   - (b) Use only internal testing this week and solve review sign-in next week.

## Before the build (code and backend)

- ✅ Hosted backend: 186 products, 67 shown offers, 60 live deals, 2 live promo codes; scheduled jobs running
  (notifications, missed-message emails, offer expiry, deal refresh, ingestion, weekly digest).
- ✅ `production` build profile → hosted Supabase, auto-incrementing build numbers, EAS Update channel `production`,
  runtime version = app version (1.0.0).
- ✅ Export compliance: `ITSAppUsesNonExemptEncryption = false` (no question at upload).
- ✅ Permission texts: location (approximate area), camera and photos (selling).
- ✅ App icon and splash (PD logo v2, light and dark).
- ✅ Account deletion in Profile → Account (5.1.1(v)). ⬜ 👤 Apple token revocation needs the Sign in with Apple
  key (`APPLE_TEAM_ID`, `APPLE_KEY_ID`, `APPLE_PRIVATE_KEY`, `APPLE_CLIENT_ID` as Supabase function secrets) —
  only matters once Apple sign-in is turned back on.
- ✅ Community rules accepted before the first listing, message or offer (1.2). Reporting and blocking built.
- ✅ Privacy policy, terms and support pages live at pickledeals.app; Support / Terms / Privacy rows in Profile.
- ✅ Push notifications and missed-message emails live (push verified on device Oct 4–5).
- ⬜ 🛠 **Crash reporting (Sentry)** — strongly recommended before external testers; without it, crashes from
  testers' phones are only visible if they report them. Needs a free Sentry account (👤) and a DSN.
- ⬜ 👤 **Pre-owned is empty on live** (0 listings). Testers can't try the marketplace, chat or offers until
  someone lists. List 3–5 real items yourself in the first TestFlight build (photos, honest prices), or invite a few
  sellers early.
- ⬜ 👤 **Re-verify promo code NEWCUSTOMER20** in admin → Promos before ~Oct 20, or it hides (codes hide after
  14 days without verification).
- ⬜ 👤 **Who answers reports within 24 hours** (guideline 1.2). Name the person; admin → Reports.

## App Store Connect: TestFlight tab (👤)

- ⬜ **Test Information**: beta app description, feedback email (support@pickledeals.app), marketing URL
  https://pickledeals.app, privacy policy URL https://pickledeals.app/privacy.
- ⬜ **What to Test** notes per build, e.g. "Browse deals, Get deal opens the store, save and price alerts,
  sell an item, message a seller, notifications."
- ⬜ **Beta App Review information** (external only): contact name, phone, email; sign-in details from blocker 4;
  notes: "Prices come from retailers; Amazon items open Amazon to check the price. Exact locations are never shown;
  listings show an area of about 1 km."
- ⬜ **Internal group**: add testers as App Store Connect users (Users and Access → +, role Developer or
  Marketing), then add them to the internal group.
- ⬜ **External group** (stage 2): create a group, add emails or turn on a public link.
- ⬜ **App Privacy** answers (required before the App Store, good to do now): see the table in `APP_STORE.md`;
  no tracking, everything "App Functionality" except product interaction (Analytics).

## After the first TestFlight build (on a phone, ~30 minutes)

Install from the TestFlight app, then:
- ⬜ Sign in with an email code (from no-reply@pickledeals.app; check spam)
- ⬜ Notification permission after the first price alert; a push arrives and opens the right screen
- ⬜ Get deal opens the store; a promo code is copied
- ⬜ Share a product → open the link on another phone: opens the app (Associated Domains) or the web page
- ⬜ Sell an item: camera and library photos, location prompt wording, publish in under a minute
- ⬜ Message and offer between two accounts; missed-message email after an hour
- ⬜ Dark mode, Dynamic Type at a large size, and account deletion on a throwaway account
- ⬜ Remaining device checks from `DEVICE_SETUP.md`: map with many pins, native dialogs, swipe actions,
  keyboard in chat, quiet hours and badge clearing

## Not needed for TestFlight (later)

- Website on pickledeals.app (the preview is separate; the current site already serves privacy/support and the
  link file for /p /d /l /b and /open)
- MapKit token for www.pickledeals.app
- Screenshots, keywords, description, age rating questionnaire (App Store submission, not TestFlight)
- Amazon: tracking tag, Creators API, and opening Amazon links in Safari or the Amazon app instead of the in-app
  browser (required before any Amazon tag goes on)
- Sign in with Google (built, off; needs client IDs)

## Open decisions

1. Hide the Apple button for TestFlight? (recommended: yes, until Apple fixes the App ID)
2. Reviewer sign-in: password review account (a) or internal-only this week (b)?
3. Add Sentry before external testers?
4. Meet-up spot default (open since Phase 13): start the pin at the listing's ~1 km area instead of the phone's
   exact position?
5. Minimum age for the Terms and the age rating (lawyer).
