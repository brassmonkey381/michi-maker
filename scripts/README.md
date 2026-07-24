# Scripts

## Retired: `ingest.mjs` (TCGdex ingestion) and `build-catalog.mjs`

Removed 2026-07-06. The card catalogue, images (with 245px/640px size tiers),
and prices are now served by the shared **tcgscan-data** data server (Supabase
Storage + Postgres, populated by that repo's pipeline). The app consumes them
through `src/lib/catalogConfig.ts` (`EXPO_PUBLIC_CATALOG_BROWSE_URL` /
`EXPO_PUBLIC_CATALOG_IMG_BASE` — see `.env.example`), so there is nothing to
ingest or transform locally anymore. History: `git log -- scripts/ingest.mjs
scripts/build-catalog.mjs`.

## Example-binder generators (output is committed JSON)

- **`build-example-binders.mjs`** — builds `src/data/generatedBinders.json` (curated
  example binders) from catalog + price + alternates data. ⚠️ It still reads those as
  LOCAL files under `public/browse/` — since the hosted cutover those no longer all exist
  locally, so to re-run it, first download `catalog.json`, `prices-summary.json`, and
  `alternates.json` from the data server's `browse` bucket into `public/browse/`.
- **`build-featured-binders.mjs`** — exports the owner's hand-picked REAL binders (must be
  public + owner profile public, read via PostgREST with the publishable key) into
  `src/data/featuredBinders.json`; these power the landing spread + gallery. Rerun after
  editing a source binder, then commit the JSON.
- **`build-release-binders.mjs`** — builds the "upcoming release" example binders (Chase
  Board / Set Showcase / etc. per configured set) into `src/data/releaseBinders.json`.

## Catalog & collection helpers

- **`enrich-catalog.mjs`** — refreshes the enrichment fields (types / illustrator /
  evolution lines) on the committed fallback `public/browse/catalog.json` by pulling them
  live from the tcgscan-data PostgREST `cards` table. The authoritative runtime catalog is
  the gated `catalog.enc` (`src/lib/catalogSource.ts`); this only keeps the local fallback
  and the build scripts from mining blind. Run: `node scripts/enrich-catalog.mjs`.
- **`build-example-collection.mjs`** — builds the "Try it out!" ~200-card example
  collection CSV → `src/data/exampleCollection.ts`, curated so the Build-a-binder wizard
  can demonstrate every page method. Run `enrich-catalog.mjs` first.
- **`build-art-library.mjs`** — builds the bundled art library `src/data/artofpkm.json`
  from artofpkm.com's curated gallery of official promotional artwork (rate-limited crawl;
  stores non-expiring original-blob URLs + species/character/illustrator tags).

## Brand & QA

- **`brand-assets.mjs`** — regenerates `assets/images/favicon.png` and `public/og.png`
  from the logo design (keep in sync with `src/components/brand/LogoMark.tsx`). Needs
  Microsoft Edge installed (Playwright `msedge` channel).
- **`screenshots.mjs`** — drives the local Expo-web build (localhost:8081) through the
  core surfaces with Playwright + Edge and screenshots each; the standard verification
  harness for UI changes. Usage: `node scripts/screenshots.mjs <outSubdir>`.
- **`compare.mjs`** — pixel-diffs two screenshot sets (`pixelmatch`). Usage:
  `node scripts/compare.mjs <dirA> <dirB> [name...]`.
- **`_freeze-profile.mjs`** / **`_hmr-freeze-repro.mjs`** — one-off performance
  reproductions (main-thread freeze on signed-in load / queued Fast Refresh on refocus);
  kept for reference, underscore-prefixed because they are not routine tooling.

## Build plumbing

- **`inject-meta.mjs`** — injects the social/share meta tags into the exported SPA shell
  (`dist/index.html`); runs automatically as part of `npm run build:web`.
- **`reset-project.js`** — Expo's stock scaffolding reset (unused in normal development).
