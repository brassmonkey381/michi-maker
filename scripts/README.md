# Scripts

## Retired: `ingest.mjs` (TCGdex ingestion) and `build-catalog.mjs`

Removed 2026-07-06. The card catalogue, images (with 245px/640px size tiers),
and prices are now served by the shared **tcgscan-data** data server (Supabase
Storage + Postgres, populated by that repo's pipeline). The app consumes them
through `src/lib/catalogConfig.ts` (`EXPO_PUBLIC_CATALOG_BROWSE_URL` /
`EXPO_PUBLIC_CATALOG_IMG_BASE` — see `.env.example`), so there is nothing to
ingest or transform locally anymore. History: `git log -- scripts/ingest.mjs
scripts/build-catalog.mjs`.

## `build-example-binders.mjs` — regenerate the bundled example binders

Builds `src/data/generatedBinders.json` (curated example binders) from catalog +
price + alternates data. ⚠️ It still reads those as LOCAL files under
`public/browse/` — since the hosted cutover those no longer exist locally, so to
re-run it, first download `catalog.json`, `prices-summary.json`, and
`alternates.json` from the data server's `browse` bucket into `public/browse/`.
(The generated JSON is committed, so this is rarely needed.)

## `reset-project.js`

Expo's stock scaffolding reset (unused in normal development).
