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
- **Email delivery:** Supabase's built-in email only sends a few messages per hour and is meant for
  testing. Set up custom SMTP (e.g. Resend, Postmark) under Authentication → Emails → SMTP before
  TestFlight, or sign-in codes will stop arriving.
- **Sign in with Apple:** Authentication → Providers → Apple: the app's bundle id `app.pickledeals` as
  client id (still blocked by Apple's "Sign Up Not Complete" issue; see the handoff).
- **First admin:** sign in once in the app or admin, then grant the role in the SQL editor:
  `insert into public.user_roles (user_id, role) select id, 'admin' from auth.users where email = '<your email>';`
- **Shopify source:** admin → Integrations → Pickleball Grip Doctor → set shipping, turn on.

## 5. App builds
- `apps/mobile/eas.json`: the `preview` and `production` profiles point at the hosted project
  (`EXPO_PUBLIC_SUPABASE_URL` and the publishable key, both public values). The `development`
  profile keeps using the PC's local stack via `apps/mobile/.env.local`.
- `simulator` profile: an iOS Simulator build of the preview app (for cloud simulators such as
  Appetize), on the `preview` channel, so UI fixes can ship with `eas update --channel preview`
  without rebuilding.
