# Catalog seed

`catalog/*.csv` is the source of truth for the development catalog. `build-seed.ts` validates the
CSVs with the same rules as the admin importer (`@pickledeals/shared` → `buildCatalogPayload`) and
generates `../seed.sql`, which `supabase db reset` loads through `public.import_catalog`.

```bash
npm run catalog:seed          # regenerate seed.sql after editing a CSV
npm run catalog:seed -- --check   # CI: fail if seed.sql is stale
```

## Data status

- Brands and product models are real pickleball products.
- **MSRPs are development approximations.** Verify against brand sites before staging/production
  data entry; they are not shown as deal prices (offers arrive in Phase 3).
- No catalog images are seeded. D8 requires licensed images with provenance, so products render the
  design's placeholder art until images are uploaded through the admin with a source.

## Format

| File | Columns |
|---|---|
| `brands.csv` | `slug, name, website_url` |
| `categories.csv` | `slug, name, parent_slug, sort, variant_axes` (pipe-separated) |
| `products.csv` | one row per **variant**: `product_slug, brand_slug, category_slug, name, msrp_usd, variant, variant_msrp_usd, default, attributes, aliases` (+ optional `model_year, status, specs, gtin, upc, ean, asin, mpn`) |

Continuation rows of a product only need `product_slug` and the variant columns. `attributes` and
`specs` are `key=value;key=value`; `aliases` are pipe-separated. Money is dollars in the CSV and
integer cents in the database.
