# App Store submission checklist (Phase 13)

Status as of Oct 2026. ✅ done in code · ⬜ to do · 👤 needs the user.

## Review guidelines that apply

| Guideline | Requirement | Status |
|---|---|---|
| 1.2 User-generated content | A way to filter objectionable content | ✅ `prohibited_terms` and the custom-listing review queue |
| | Reporting with timely responses | ✅ `file_report`, admin Reports page. 👤 Someone has to work the queue within 24 h |
| | Blocking abusive users | ✅ `block_user`. Blocks hide the other person's threads and listings |
| | Published contact information | ⬜ Support email in the app (Profile) and on the support URL |
| | Users agree to terms forbidding objectionable content (EULA) | ⬜ Accept the Terms before the first listing or message (draft in `docs/legal/TERMS_DRAFT.md`) |
| 4.8 Login services | Sign in with Apple offered next to the other login | ✅ Apple and email code. 👤 Apple's "Sign Up Not Complete" issue is still open (see the handoff) |
| 5.1.1(v) Account deletion | Deletion inside the app, with Apple token revocation | ✅ Profile → Account. Listing and thread photos are removed too. 👤 Apple .p8 key needed in production |
| 5.1.1 Data collection | Privacy policy link in App Store Connect and in the app | ⬜ Needs a public URL (draft in `docs/legal/PRIVACY_POLICY_DRAFT.md`) |
| 5.1.1 Permissions | Purpose strings explain each permission | ✅ Location, camera and photos in `app.json` |
| 5.1.2 Data use | No tracking without ATT | ✅ No tracking, so no ATT prompt |
| 3.1.1 Payments | No digital goods sold | ✅ Only physical goods and affiliate links |
| 3.2.2 / 5.6 | Affiliate disclosure | ✅ The disclosure appears on All offers and Deal detail |
| 2.1 App completeness | The reviewer can use every feature | ⬜ Demo account plus seeded production data (see below) |
| 4.0 Design | The app works on all supported iPhones | ⬜ Device checks in `docs/DEVICE_SETUP.md` |

## Privacy "nutrition" labels (App Store Connect → App Privacy)

None of this data is used for tracking. All of it is linked to the user unless a row says
otherwise. Recheck this table when Sentry or analytics are added.

| Apple category | Type | Used for |
|---|---|---|
| Contact Info | Email address | App functionality |
| Contact Info | Name (display name) | App functionality |
| Location | Coarse location (home area, ~1 km) | App functionality |
| Location | Precise location ⚠ (only when a user sends a meet-up spot in chat) | App functionality |
| User Content | Photos | App functionality |
| User Content | Other user content (listings, messages, offers, reports) | App functionality |
| Identifiers | User ID | App functionality |
| Usage Data | Product interaction (retailer clicks, saves) | Analytics, App functionality |
| Diagnostics | Crash data, performance data | *(only after Sentry is added)* App functionality |

Notes:
- Device location sent with a search isn't stored (it's snapped and discarded), so Apple doesn't
  count it as "collected". The saved home area is collected (coarse).
- Push tokens are used only to deliver notifications. Apple doesn't require declaring them as an
  identifier unless they're used for something else.

## App Store Connect metadata

- ⬜ Name, subtitle, keywords, description, promotional text
- ⬜ Category: Shopping (primary), Sports (secondary)
- ⬜ Age rating questionnaire: unrestricted web access (no; the in-app browser opens only retailer
  links), user-generated content and messaging (yes). 👤 Choose the minimum age with your lawyer
- ✅ Support URL https://pickledeals.app/support · marketing URL https://pickledeals.app · privacy policy URL https://pickledeals.app/privacy (live Oct 7, 2026)
- ⬜ Screenshots for 6.9" and 6.5" iPhones, in light mode with seeded data: Deals home, Product
  with all offers, Price history, Marketplace grid, Map, Listing detail (used vs new), Chat with
  an offer, Sell flow
- ⬜ App Review notes:
  - a demo account (email code sign-in needs a reviewer path; consider a fixed review code or a
    password account for review only)
  - how to reach the marketplace and chat
  - "Prices come from retailers; Amazon items open Amazon to check the price"
  - "Exact locations are never shown"
- ⬜ Export compliance: `ITSAppUsesNonExemptEncryption: false` is already set

## Before the TestFlight build

- 👤 A hosted Supabase project for production or TestFlight (the phone can't reach local Docker off
  your Wi-Fi), with migrations applied, a production catalog seed (no dev sellers), Vault secrets
  for push dispatch and ingestion, and Apple sign-in keys
- ⬜ `APP_ENV=production` config pointing at it; EAS production profile; EAS Update channel
- ✅ Dev-only entries (component gallery) are behind `__DEV__` on Profile. Recheck before submitting
- ⬜ App icon and splash final art
- ⬜ Crash reporting (Sentry) before external testers

## Open questions for the user

1. Meet-up spot: the map starts at your current position, so sending it without moving the pin
   shares your exact location. Start it at the listing's ~1 km cell instead? That would also let the
   precise-location label be dropped if the pin has to be moved first.
2. Minimum age (Terms, age rating).
3. Who works the report queue, and how fast.
