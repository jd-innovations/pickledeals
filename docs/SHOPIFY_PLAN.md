# Shopify direct-store feed (Pickleball Grip Doctor) — plan

Status: **proposed, waiting for the user's go-ahead** (Oct 5, 2026).

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
