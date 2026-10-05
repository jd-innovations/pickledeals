# Shopify direct-store feed (Pickleball Grip Doctor) — plan

Status: **Part B built (Oct 5, 2026); waiting for the user's Part A (Shopify token).** The source ships
**off**. Defaults used: new feed items become draft products; only products in the PickleDeals channel.

## What's built
- Migration `20261018000000_shopify_direct.sql` (pgTAP `15_shopify_direct`):
  - retailer **Pickleball Grip Doctor** with `ownership_note` "PickleDeals’ owner also owns this store"
  - source `shopify-gripdoctor` (adapter `shopify`, every 30 min, off): mode `storefront` | `public`,
    shipping rule, `store_url`, `utm_source`, env names `SHOPIFY_GRIPDOCTOR_DOMAIN` / `_TOKEN`
  - `retailer_offers.ships_from` (Collective supplier, shown as its catalog brand name)
  - `brand_vendor_aliases` + `brand_for_vendor()` ("EngagePickleball" → Engage)
  - `staff_create_product_from_raw()` (draft product + default variant, remembers barcode/SKU and vendor name)
  - ranking tie-break is now in stock → lower shipping → retailer name (it used to favour the most
    recently refreshed offer, which would have favoured a 30-minute feed)
- Adapter: `supabase/functions/_shared/integrations.ts` (`fromStorefront`, `fromPublicJson`,
  `shopifyRecords`; unit tests in `packages/shared/src/integrations.test.ts`) and `ingest` (`fetchShopify`).
  One offer per product per defining option (thickness, shape); sizes become `available_sizes`; colours
  and graphics fold into one offer. Compare-at price is never used.
- Admin: review queue **Create product…** (brand pre-filled from the vendor, editable; name suggested);
  Integrations → Shopify settings (mode, shipping, full-catalog) and a **Vendor names** list.
- App: "Ships from Engage" on offers; the ownership note in the disclosure line on Product, All offers and Deal detail.

## Dry run against the real store (Oct 5, 2026, public mode, local only)
- 32 products → 32 offers, no errors. 12 tagged *Shopify Collective* (Engage); 13 with vendor
  "Pickleball Grip Doctor"; also Joola (3), Selkirk (1), Holbrook (2), and 1 Engage item without the tag.
- **The public product list has no barcodes**, so nothing matched automatically there. The
  Storefront API returns barcodes, which is why mode `storefront` is the default.
- Suggestions: Trigger Grip Attachment 95%; Engage Pursuit items get Engage suggestions. Several are
  newer generations than the catalog (Agassi Pro **V** vs Pro IV): create new products, don't match.
- The local review queue now holds these 32 items for trying **Create product…**.

## Decisions (user, Oct 5, 2026) — built
- **Pickleball Grip Doctor is the seller of record** for its own and its Collective items: its domain,
  Shopify Payments, order numbers and Collective agreements. PickleDeals never sells; it lists Grip
  Doctor as a disclosed partner store (not a "PickleDeals Shop").
- **Deals on Collective items come from Grip Doctor discount codes** (Collective prices are set by the
  supplier and reverted if edited; Grip Doctor absorbs the discount). Add codes in admin → Promo codes
  (retailer Pickleball Grip Doctor; optional product/category targets; "PickleDeals exclusive" flag).
  Promo codes must be re-verified every 14 days to stay live (existing rule for all retailers).
- **Codes apply automatically**: `retailers.discount_link_template = '/discount/{code}?redirect={path}'`;
  the go function sends Get deal to the Shopify discount link (verified end to end locally). The app
  says "Get deal · CODE applied" and still copies the code as a fallback.
- **Grip Doctor wins exact ties** (`retailers.wins_price_ties`, only allowed with an ownership note).
  Order: delivered price → in stock → tie preference → shipping → name. A cheaper offer always wins.
  Disclosure now reads "PickleDeals’ owner also owns this store; it’s listed first when prices tie".
- **Sold-out items aren't imported**: the adapter skips items with nothing in stock; with the
  full-catalog setting, an offer that sells out is hidden on the next run and returns when restocked.
- **Pre-orders are hidden too** (user, Oct 5): variants Shopify sells with nothing on hand
  ("continue selling when out of stock", Storefront `currentlyNotInStock`) count as out of stock. Their
  offers are hidden on each run and return once stock arrives. Example: the Engage X2's description still
  carries Engage's stale "5/1 shipping update" (supplier content synced by Collective; ask Engage to fix it).

## Store check via the Shopify connector (Oct 5, 2026, read-only)
- **No Headless channel is installed yet.** Channels: Online Store, Point of Sale, Shop, Google & YouTube,
  Facebook & Instagram, TikTok, Collective: Supplier, Sell on WordPress, Microsoft Copilot, Lovable,
  Meta AI and Muse, Google AI Mode and Gemini.
- **Collective items can be published beyond Online Store and Shop**: the active Engage items are also on
  the **Lovable** channel (an app storefront that reads the same storefront data a Headless storefront
  does), and Thrive items are on Point of Sale. None are on Google, Facebook or TikTok. Strong evidence
  (not yet proof) that publishing them to a PickleDeals Headless storefront will work: Part A step 5 confirms it.
- The store has **36 Collective items from three suppliers**, not only Engage: Engage (20; 11 active,
  9 draft), **Thrive Pickleball** (15; mostly *unlisted*, which the public data hides) and
  **TriggerGrip Pro** (1 draft). Only active, published items reach the app.
- Grip Doctor is also a Collective **supplier** (its own products are on the Collective: Supplier channel).
- **Barcodes:** every active Engage item has one (UPC 810957…). Thrive items and most of Grip Doctor's
  own products have none (WrapCore does). Items without barcodes go through review once, then match by SKU/previous match.

## Questions for the user (from the dry run)
1. Items ending in **"PGD"** (e.g. *Agassi Pro V … 16MM PGD* $249, *Engage X2 … PGD* $219 vs $199.99
   plain): are these paddles modified by Grip Doctor? If so they're separate products, not the brand's paddle.
2. **Joola, Selkirk, Holbrook** items and one Engage item have no *Shopify Collective* tag: does Grip
   Doctor stock and ship these itself? If they're Collective too, the tag is missing in Shopify.
3. Several items list vendor "Pickleball Grip Doctor" but are other brands (Scorpeus Pro V is JOOLA,
   Luzz, HEXXO). Fixing the vendor in Shopify makes brand mapping automatic.
4. The ownership wording "PickleDeals’ owner also owns this store; it’s listed first when prices tie" (lawyer to confirm).
5. Your shipping rule (Integrations → Settings), e.g. free over $50, otherwise $6.95.

## To go live (after Part A)
1. Put `SHOPIFY_GRIPDOCTOR_DOMAIN` (the .myshopify.com domain) and `SHOPIFY_GRIPDOCTOR_TOKEN` in `supabase/functions/.env`.
2. Serve functions with `--env-file supabase/functions/.env`, set the shipping rule, turn the source on, **Run now**.
3. Work the review queue: match or **Create product…**, add MSRP and a licensed image, publish.

## Context
- PickleDeals never sells. **Pickleball Grip Doctor** (pickleballgripdoctor.com) is a separate
  business owned by the same person, listed as an ordinary retailer. It is the pilot for a generic
  "direct Shopify store" source that other stores can use later.
- The store carries two kinds of products:
  - **Grip Doctor's own products** (e.g. the Trigger Grip Attachment), made and shipped by Grip Doctor.
  - **Shopify Collective supplier products**, made and shipped by the supplier, currently
    **Engage Pickleball**. Grip Doctor is only the retailer for these.
  Collective items arrive in the store as normal products, so one feed covers both; the
  `Shopify Collective` tag tells them apart.
- This feed is expected to be the **primary source** of new catalog products.

What a **Collective supplier product** looks like in the store's data (Engage X2 Elongated, an
Engage product sold by Grip Doctor through Collective; read Oct 5, 2026 from the public endpoint):

| Field | Value | Use |
|---|---|---|
| title | Engage X2 Elongated Pickleball Paddle | match suggestion |
| vendor | `EngagePickleball` | maps to catalog brand **Engage** |
| tags | `EngagePickleball, Shopify Collective` | Collective detection → "Ships from Engage" |
| barcode | `810957038755` (UPC) | exact product match, learned afterwards |
| sku | X2E-AQU-001 | second identifier |
| price / compare-at | $199.99 / $259.99 | price shown and tracked; compare-at **never** used as "was" |

The catalog has Engage (5 paddles) but not the X2, so the first import puts it in review.

## A. The user's steps in Shopify (about 15 minutes)

Shopify stopped allowing new legacy custom apps (permanent admin tokens) on Jan 1, 2026. The
supported read-only route is the **Headless channel**, which issues Storefront API tokens.

1. **Install the Headless channel**: Shopify admin → Sales channels → add **Headless** (Shopify App Store).
2. **Create a storefront** named **PickleDeals** (Headless → Create storefront). It gets a public and a **private** access token.
3. **Permissions**: in the storefront's Storefront API settings, allow **product listings** and **product inventory** (inventory returns stock levels).
4. **Publish products**: Products → select → **Include in sales channels → PickleDeals**. Only products published to this channel reach the app.
5. **Check Collective items**: try publishing a supplier product (e.g. *Engage X2 Elongated*) to PickleDeals, and one of your own products for comparison. Not confirmed in Shopify's docs that Collective items can be published to a headless storefront; if it can't be selected, report back (fallback below).
6. **Secrets** — never in chat or git. Add to `supabase/functions/.env`:
   ```
   SHOPIFY_GRIPDOCTOR_DOMAIN=<your-store>.myshopify.com
   SHOPIFY_GRIPDOCTOR_TOKEN=<private access token>
   ```
   (Settings → Domains shows the `.myshopify.com` domain.)
7. **Shipping rule**, e.g. "free over $50, otherwise $6.95" — not in the product data; entered in admin.
8. **Images for Collective items**: ask Engage whether PickleDeals may use their product photos (or for their brand media kit). Grip Doctor's own photos are fine.

**Fallback if step 5 fails**: the store's public product endpoint already returns vendor, tags,
barcode and prices (no stock; unofficial) — usable as a stopgap. The proper alternative is a Dev
Dashboard app on the Admin API (client credentials), which is more setup.

## B. Build (one phase, after go-ahead)

1. **Shopify Storefront adapter** (`supabase/functions/_shared/integrations.ts` + `ingest`): pages the
   PickleDeals channel's products via GraphQL (private token in `Shopify-Storefront-Private-Token`)
   and reads title, vendor, tags, productType, variants (price, compareAtPrice, sku, **barcode**,
   availableForSale, quantityAvailable) and the product URL. Emits standard offer records → `ingest_offers`.
   An `ingestion_sources` row (adapter `shopify-storefront`, every 30 min) with the usual backoff and freshness.
2. **Retailer "Pickleball Grip Doctor"** with a retailer-level shipping rule applied to every offer, and
   `utm_source=pickledeals` on outbound links (Shopify analytics shows app traffic).
3. **Vendor → brand mapping** (e.g. `EngagePickleball` → Engage), managed in admin and learned from staff decisions.
4. **"Ships from {supplier}"** on offers tagged *Shopify Collective* (existing detail line; no new design elements).
5. **Admin: "Create product" from a feed item.** The review queue today can only match or reject.
   Unmatched items get a one-click action that pre-fills brand, name, category, variants and barcode
   as a **draft** product; staff add MSRP and a licensed image, publish, and the offer links. Later
   imports match by barcode.
6. **Guards and tests**
   - compare-at price never becomes a "was" price or deal reference
   - ownership disclosure on this retailer's offers ("PickleDeals' owner also owns this store")
   - documented tie-break for equal delivered prices: in stock → lower shipping → name
   - ranking stays price-only (pgTAP), adapter mapping unit tests
7. **Dry run first** against the real store, locally: admin shows what would match, go to review, or be created, before anything goes live.

## C. Decisions for the user
1. **Primary source**: new feed items become **draft** products that staff approve (recommended), or auto-publish?
2. **Timing**: before the rest of Phase 13, or after?
3. **Scope**: only products published to the PickleDeals channel (recommended), or the whole store?

## Related notes
- Disclosure (FTC material connection) applies because the app owner owns a listed store; wording to be confirmed by a lawyer.
- Amazon: once the Associates tag is live, check whether earning commission on the owner's own Grip Doctor Amazon listings is allowed, or leave the tag off those (Amazon Attribution may fit better).
- Collective pricing is often the supplier's retail price, so ties with the brand's own store are expected; check whether Collective allows discounting.

## Sources
- [Getting started with the Storefront API (Headless channel tokens)](https://shopify.dev/docs/storefronts/headless/building-with-the-storefront-api/getting-started)
- [Manage the Headless channel](https://shopify.dev/custom-storefronts/building-with-the-storefront-api/manage-headless-channels)
- [Per-storefront publishing (changelog)](https://changelog.shopify.com/posts/each-headless-storefront-supports-unique-resource-publishing-and-order-attribution)
- [Storefront API 2026-10: ProductVariant](https://shopify.dev/docs/api/storefront/2026-10/objects/ProductVariant)
- [Shopify API authentication](https://shopify.dev/docs/api/usage/authentication)
- [Custom apps after Jan 2026 (CartCoders)](https://cartcoders.com/blog/shopify-apps/shopify-custom-apps-after-january-1year-dev-dashboard-and-legacy-app-guide/)
