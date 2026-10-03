# Running PickleDeals on an iPhone

Development builds are compiled in the cloud by EAS (no Mac needed) and installed on the phone.
The phone loads the app's JavaScript from Metro on this PC and talks to the **local Supabase stack
over the Wi-Fi** (option a: no hosted project, no cost). Phone and PC must be on the same network.

- Apple Team: `ZSH27U747N` · bundle ID `app.pickledeals` (in `apps/mobile/app.json`)
- Development builds allow plain HTTP to the PC (`apps/mobile/app.config.ts`); preview/production
  builds don't.

## One-time setup

Run these from `apps/mobile`, in a terminal where you can answer prompts.

1. **Log in to EAS and link the project**
   ```bash
   npx eas-cli@latest login
   ```
   ```bash
   npx eas-cli@latest init
   ```
   `init` creates the project in your Expo account. It should add `owner` and
   `extra.eas.projectId` to `app.json`. If it says it can't edit a dynamic config (`app.config.ts`),
   copy the project ID it prints into `app.json` → `expo.extra.eas.projectId` and set `expo.owner` to your Expo
   username (or send me both). Push notifications need this ID.

2. **Register the iPhone** (skip if this Expo account already has it from your other apps:
   `npx eas-cli device:list`)
   ```bash
   npx eas-cli@latest device:create
   ```

3. **Build the development client**
   ```bash
   npx eas-cli@latest build --profile development --platform ios
   ```
   When asked, sign in with your Apple ID and let EAS manage credentials:
   - distribution certificate and provisioning profile: **yes, generate**
   - **"Generate a new Apple Push Notifications service key?" → yes** (needed for push)
   - Sign in with Apple is switched on for the bundle ID automatically (`usesAppleSignIn`).

   Rebuild only when native code changes (new native packages, `app.json`/`app.config.ts` edits).
   JavaScript changes never need a rebuild.

4. **Install** from the QR code or link EAS prints when the build finishes. Developer Mode is
   already on for your phone.

5. **Let the phone reach this PC through Windows Firewall.** Windows currently treats the Wi-Fi as a
   *Public* network, which blocks incoming connections. In an **administrator** PowerShell:
   ```powershell
   New-NetFirewallRule -DisplayName "PickleDeals dev (Metro, Supabase)" -Direction Inbound -Protocol TCP -LocalPort 8081,54321 -RemoteAddress LocalSubnet -Action Allow
   ```
   This allows only devices on your own subnet, only on those two ports. To remove it later:
   `Remove-NetFirewallRule -DisplayName "PickleDeals dev (Metro, Supabase)"`.

## Each testing session

1. Docker Desktop running, then from the repo root: `npx supabase start`
2. Point the app at this PC's Wi-Fi address:
   ```bash
   npm run device:lan
   ```
   Check from the phone: open `http://<that IP>:54321/rest/v1/` in Safari. A short JSON error means
   it can reach the PC; a spinner or timeout means the firewall rule or Wi-Fi is the problem.
3. Serve the edge functions (needed for **Get deal** links and **push**):
   ```bash
   npx supabase functions serve --env-file supabase/functions/.env
   ```
4. Start Metro and open the app on the phone. It lists the running server, or scan the QR code:
   ```bash
   cd apps/mobile && npx expo start --dev-client
   ```
   Allow the **Local Network** prompt the first time.
5. Sign in with an email code. Seed accounts: `seller1@` (Marcus), `seller2@` (Priya),
   `seller3@pickledeals.test` (Jordan). Read codes in Mailpit on the PC: http://127.0.0.1:54324
6. When you're done, `npm run device:local` sets the app back to `127.0.0.1` for the web preview.

Notes:
- `npx supabase db reset` signs everyone out; sign in again on the phone.
- If the PC's IP changes (new network, router restart), run `npm run device:lan` again and restart Metro.
- Two-account tests (chat, offers): phone as one seller, the web preview on the PC as the other.

## On-device checklist (open items from the handoff)

- [ ] Sign in with Apple (native sheet) creates an account and signs in
- [ ] Email code sign-in; sign out; account deletion (Apple token revocation needs the .p8 key in
      `supabase/functions/.env`: `APPLE_TEAM_ID`, `APPLE_KEY_ID`, `APPLE_CLIENT_ID`, `APPLE_PRIVATE_KEY`)
- [ ] Camera and photo library in the sell flow; photos upload and show on the listing
- [ ] Location permission, approximate area, reverse geocoding, city/ZIP search
- [ ] Native dialogs (Alert, action sheets) in Manage listing, chat, offers
- [ ] Push: permission prompt, token registered, a message from the web account arrives as a push,
      tapping it opens the thread, app icon badge matches unread counts, quiet hours hold pushes
- [ ] Map: Apple Maps renders (`mutedStandard`), 500 pins pan smoothly, clusters open, Search this area
- [ ] Sell flow: list an item in under 60 seconds
- [ ] Inbox swipe actions, composer and keyboard behaviour
- [ ] Native tab bar (Liquid Glass on iOS 26), dark mode, Dynamic Type at large sizes
- [ ] Get deal opens the retailer in the in-app browser (functions served)
