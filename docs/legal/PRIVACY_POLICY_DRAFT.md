# PickleDeals Privacy Policy (DRAFT)

> **Draft for review, not legal advice.** Written from what the code actually stores (October 2026).
> A lawyer should review it before publishing, especially the sections marked ⚠. Fill in the
> bracketed items. Keep it in sync with the App Store privacy labels in `docs/APP_STORE.md`.

**Effective date:** [date]
**Who we are:** PickleDeals is operated by [legal entity name, address]. Contact: [privacy email].

## The short version
- We collect what the app needs to work: your email, a display name, what you post and save, and
  messages you send through the app.
- **We never store your exact location.** "Near you" uses an area of about 1 km. Your device's
  location is used for a search and then discarded. The only exact point we store is a meet-up spot
  you choose to send in a chat, and only the person you're chatting with can see it.
- We don't sell your data, show third-party ads or track you across other companies' apps.
- Some retailer links are affiliate links. If you buy, the retailer may pay us a commission. We
  never pass your account details to retailers.
- You can delete your account at any time in Profile → Account. Deletion removes your data as
  described below.

## What we collect and why

| Data | What it is | Why |
|---|---|---|
| Account | Email address, or your Apple ID's private relay email if you use Sign in with Apple; an internal user ID | Signing in, account security, account deletion |
| Profile | Display name; when you joined | Shown to people you trade with |
| Approximate area | A home area you set (city or ZIP, stored as a ~1 km grid cell) and your search radius | "Near you" results and nearby-listing alerts |
| Listings | Photos, title, description, price, condition, and the ~1 km area where the item is | Showing your listing to buyers |
| Messages and offers | Messages, photos and meet-up spots you send in chats; offers and counter-offers | Letting buyers and sellers talk and agree on a price |
| Saves and alerts | Saved products, deals, listings and searches; brand follows; price alerts | Your Watchlist and notifications |
| Notification settings | Your preferences, quiet hours, time zone and push token | Sending notifications you asked for, at the right time |
| Retailer clicks | Which offer you opened, and when | Counting clicks for affiliate reporting and ranking. Never shared with retailers as personal data |
| Safety | Blocks, reports you file, and reports about you | Keeping the marketplace safe |

**Photos:** before upload, the app re-encodes your photos as new JPEGs, which strips camera
metadata, including GPS location.

**Location:** when you allow location access, the app sends your device's position with a search.
The server snaps it to a ~1 km grid cell, uses it for that request and doesn't store it. If you
save a home area, we store only that grid cell. Listings are shown at the centre of their ~1 km
cell, never at an address. ⚠ A meet-up spot sent in a chat is an exact point. It starts at your
current position unless you move the map.

## What we don't do
- No advertising SDKs, data brokers or cross-app tracking. We don't sell or rent personal data.
- [When added: we use Sentry for crash reports and [PostHog] for product analytics. Before launch,
  list exactly what they receive. They never receive location data.]

## Who we share data with
- **Other users:** your display name, when you joined, your listings (with their ~1 km area) and
  the messages and offers you send to them.
- **Service providers** that run the app for us: Supabase (database, storage, sign-in), Expo and
  Apple (push notifications), and Apple (Sign in with Apple). They process data only on our behalf.
- **Retailers and affiliate networks:** when you tap Get deal, you go to the retailer's site through
  a tracking link that identifies PickleDeals, not you. After that, the retailer's own privacy
  policy applies.
- **Legal:** when the law requires it, or to protect people's safety.

## How long we keep data
- **Account data:** until you delete your account.
- **Account deletion** permanently removes your account, profile, listings and their photos,
  saves, alerts, notification settings and push tokens. Conversations on your listings, and their
  photos, are deleted. Messages you sent on other people's listings stay in their inbox, without
  your name. Retailer clicks are kept without any link to you. If you used Sign in with Apple, we
  revoke the app's access with Apple.
- **Reports** can be kept after deletion where we need them for safety or legal reasons. ⚠ Set a
  retention period.
- **Retailer prices from Amazon's API** are deleted within 24 hours (Amazon's terms).

## Your choices and rights
- Edit your profile, home area and notification settings in the app. Turn off location in iOS
  Settings at any time.
- Delete your account in Profile → Account → Delete account.
- ⚠ Depending on where you live (for example California under the CCPA/CPRA, or the EU/UK under the
  GDPR), you may have the right to access, correct or port your data. Email [privacy email]. Have
  a lawyer confirm which laws apply at launch, since the app is US-only.

## Children
PickleDeals isn't for children under 13 [⚠ or the age your lawyer recommends; marketplaces with
chat often set 17+ or 18+], and we don't knowingly collect their data.

## Changes
If we change this policy, we'll update the date above and, for significant changes, tell you in
the app.
