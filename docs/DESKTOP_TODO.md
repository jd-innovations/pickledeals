# Desktop to-do (owner)

Things only you can run from the PC. Tell Claude when each is done; Claude checks and does the follow-ups.
Run everything in PowerShell from `C:\dev\pickledeals`.

## Done (Oct 13)

- Database: `20261101000000_brand_matching`, `20261102000000_seller_reviews`, `20261103000000_problem_reports`
  pushed and checked on hosted.
- `dispatch-emails` deployed (version 4, review emails).
- `main` pushed to GitHub (website changes).
- App update for build 3 published (update group b2e32dc3…).

## Next: test on the phone

1. Fully close PickleDeals, open it, wait a few seconds, close and reopen.
2. Marketplace → Filters: brands with listings first, **More brands** shows all.
3. With a second account, message about one of your listings. Mark it **Sold** and pick that account
   under "Who's buying?".
4. On the second account: the push / Activity item and the **Rate seller** button in the chat. Leave a review.
5. Your seller profile shows the rating and the Reviews tab.
6. On any deal or product page: **Report a problem** shows Wrong price / Code doesn't work / Out of stock /
   Link doesn't work. A listing's **Report listing** has **Not as described** at the top.

## Also

- Untracked `app.json` in the repo root (Oct 12, 18:52, only an EAS project id). Probably from an EAS
  command run in the root; look at it and delete it if you don't need it.
- Two failing promo-code tests in `supabase/tests/03_retail.test.sql` (older than this work); a task card
  was offered to investigate.
