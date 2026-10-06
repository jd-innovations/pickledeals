# Hosted Supabase project

Project **`pickledeals`**, ref `tadxbjlhknukpyxbqrpt`, region `us-east-1`, on the user's Pro organization
(created Oct 6, 2026; $10/month on top of Pro). URL: `https://tadxbjlhknukpyxbqrpt.supabase.co`.

## 1. One-time setup on the PC (user)
1. Sign the CLI in (opens the browser):
   ```
   npx supabase login
   ```
2. Set a database password: Supabase dashboard → project `pickledeals` → Project Settings → Database →
   **Reset database password** → generate. Save it in a new git-ignored file **`supabase/.env.hosted`**:
   ```
   SUPABASE_DB_PASSWORD=<the password>
   ```
   Never in chat or git.

## 2. Push the backend (Claude runs these after step 1)
```
npx supabase link --project-ref tadxbjlhknukpyxbqrpt
npx supabase db push                 # all migrations
npx supabase config push             # auth (email OTP template, access-token hook), API settings
psql … -f supabase/seed/production.sql   # catalog only, once
npx supabase functions deploy        # ingest, go, dispatch-notifications, delete-account
```
`supabase/seed/production.sql` is generated with `seed.sql` (`npm run catalog:seed`): catalog only, no
fictional retailers, prices, sellers, listings or dev admin. MSRPs are approximate; verify before launch.

## 3. Secrets (user, in the dashboard: Edge Functions → Secrets)
Copy from `supabase/functions/.env`; never paste them in chat.

| Secret | For |
|---|---|
| `SHOPIFY_GRIPDOCTOR_DOMAIN`, `SHOPIFY_GRIPDOCTOR_TOKEN` | Pickleball Grip Doctor feed |
| `APPLE_TEAM_ID`, `APPLE_KEY_ID`, `APPLE_PRIVATE_KEY`, `APPLE_CLIENT_ID` (see `.env.example`) | Apple token revocation on account deletion |
| `EXPO_ACCESS_TOKEN` (optional) | push sending with enhanced security |
| `AMAZON_*`, `FEED_URL_*` | later (Amazon after launch; affiliate feeds when approved) |

Vault (SQL editor), so cron can call the functions:
```sql
select vault.create_secret('https://tadxbjlhknukpyxbqrpt.supabase.co', 'project_url');
select vault.create_secret('<service role key>', 'dispatch_key');
```

## 4. Before testers sign in
- **Email delivery (Resend; the user has a paid plan):** Supabase's built-in email only sends a few
  messages per hour, so sign-in codes go through Resend.
  1. Resend → Domains → add the sending domain (e.g. `mail.<your domain>`) and add its DNS records
     at your registrar until Resend shows it verified.
  2. Resend → API Keys → create a key with **sending access** for that domain (keep it out of chat).
  3. Supabase → Authentication → Emails → **SMTP Settings** → enable custom SMTP:
     host `smtp.resend.com`, port `465`, username `resend`, password = the API key,
     sender email `no-reply@<sending domain>`, sender name `PickleDeals`.
  4. Supabase → Authentication → **Rate Limits**: raise "emails sent per hour" (the low default only
     applies to the built-in sender).
  5. Send yourself a code from the app to confirm; the email uses the project's OTP template, pushed
     with `supabase config push`.
- **Sign in with Apple:** Authentication → Providers → Apple: the app's bundle id `app.pickledeals` as
  client id (still blocked by Apple's "Sign Up Not Complete" issue; see the handoff).
- **First admin:** sign in once in the app or admin, then grant the role in the SQL editor:
  `insert into public.user_roles (user_id, role) select id, 'admin' from auth.users where email = '<your email>';`
- **Shopify source:** admin → Integrations → Pickleball Grip Doctor → set shipping, turn on.

## Sign in with Google (user, once)
1. Google Cloud Console → APIs & Services → **OAuth consent screen**: app name PickleDeals, support
   email, publish (External).
2. **Credentials → Create OAuth client ID**, twice:
   - **iOS**: bundle ID `app.pickledeals` → gives the *iOS client ID*.
   - **Web application** (no redirect URIs needed) → gives the *web client ID* and a *client secret*.
3. App (public values, safe to commit): put both IDs in `apps/mobile/eas.json` (preview, production,
   development, simulator env) and `apps/mobile/.env.local` as `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID` and
   `EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID`. Claude can do this once you share the two IDs (not the secret).
4. Hosted Supabase: Authentication → Providers → **Google**: enable; Client IDs = `<web ID>,<iOS ID>`;
   Client secret = the web client secret; **Skip nonce check** on.
5. Local: in `supabase/.env` set `SUPABASE_AUTH_EXTERNAL_GOOGLE_CLIENT_ID=<web ID>,<iOS ID>` and
   `SUPABASE_AUTH_EXTERNAL_GOOGLE_SECRET=<secret>`, then `enabled = true` under
   `[auth.external.google]` in `supabase/config.toml`.
6. Native code changed (new module + URL scheme): new **development** and **preview** builds are needed.

## 5. App builds
- `apps/mobile/eas.json`: the `preview` and `production` profiles point at the hosted project
  (`EXPO_PUBLIC_SUPABASE_URL` and the publishable key, both public values). The `development`
  profile keeps using the PC's local stack via `apps/mobile/.env.local`.
- `simulator` profile: an iOS Simulator build of the preview app (for cloud simulators such as
  Appetize), on the `preview` channel, so UI fixes can ship with `eas update --channel preview`
  without rebuilding.
