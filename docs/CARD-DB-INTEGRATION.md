# Card DB Integration — Scope

Integrating the **TCGScan** 25k-card catalog into **michi-maker**, with a path to production Supabase.

Source repos:
- Pipeline (data): `C:\Users\Brian\Desktop\data-science-projects\TCGScan-data-science\pipeline`
- Browse app (reference impl): `C:\Users\Brian\Documents\github projects\_scanner\tcgscan-expo`
- This app: `C:\Users\Brian\source\repos\poke-michi` (michi-maker)

## The central tension: two card universes

| | TCGScan | michi-maker (today) |
|---|---|---|
| Canonical ID | TCGPlayer product id (`"479686"`) | TCGdex id (`"base1-4"`) |
| Cards | 28,032 | ~70 hardcoded (`src/data/sampleData.ts`) |
| Fields | name, number, rarity, `card_type[]`, set_id/name/code, series, release_date, image URL, product_url | name, illustrator, dominant_color, orientation, image_url, kind |
| Extra | prices (562k rows), alternates, embeddings | — |
| Images | TCGPlayer CDN URLs baked into catalog (+2.9GB local jpgs) | TCGdex CDN URLs |

**Consequence:** michi's color-theme and artist binder styles depend on `dominant_color` + `illustrator`, which TCGScan lacks. All other integration points align (both Expo SDK 56/57, both key slots by string id, `binder_slots.card_id` FK already dropped in `20260615130000_decouple_card_refs.sql`).

## DECISIONS (locked)

1. **Catalog strategy = FULL MIGRATE to TCGScan.** The 25k TCGPlayer catalog becomes the *only* catalog. The ~70 bundled TCGdex cards in `sampleData.ts` are retired. **Single id space (TCGPlayer product ids).**
2. **Images v1 = HOST LOCAL JPGS.** Serve the 2.9GB `work/card-imgs/<id>.jpg` pool from `poke-michi/public/card-imgs/`; rewrite `catalog.json` image URLs to local `/card-imgs/<id>.jpg`. (Later → Supabase Storage, behind the same config seam.)

### Knock-on effects of full migrate (must handle)
- **No `dominant_color`** → the color tint backing (`BinderGrid.tsx:39-46`) and color-theme binders lose their data source. Short term: leave tint undefined/neutral. Fast-follow: add `dominant_color` extraction to the pipeline (it already decodes every image — cheap) to restore color features across all 25k.
- **No `illustrator`** → artist pages/binders unbuildable until an external join (TCGdex/pokemontcg.io) is added to the pipeline.
- **Existing example binders break.** `src/data/content/*` reference TCGdex ids (`base1-4`, `sv1-001`, …) that don't exist in the TCGPlayer catalog → dangling `cardId`s. **The example/showcase binders must be regenerated against the new catalog** (see Phase 4). Color/artist-themed examples are retired until enrichment; replace them with taxonomy-driven examples the new data supports.

## TCGScan data shapes (authoritative)

`catalog.json` (~11–14MB): `{ productLine, counts, cards, sets, series }`.

```
cards["479686"] = {
  id, name, number, rarity, card_type: string[],
  set_id, set_name, set_code, set_url_name,
  series, release_date, image, product_url
}
sets[2282]   = { id, name, code, url_name, series, card_count }
series[name] = { name, set_ids: [...], card_count }
```
- 17 series, 212 sets. `card_type` distribution: Pokemon 22k, Supporter 1.9k, Item 1.6k, Energy 1.3k, Stadium 465, Trainer 409, Tool 331.
- Images: flat pool `work/card-imgs/<productId>.jpg`, ~1000px, ~130KB each. **But absolute CDN URLs are already in `catalog.json`**, so local hosting is optional.
- Prices: `prices.parquet` cols `product_id, date, variant, market_price, avg_sales_price, quantity`.
- Alternates: `alternates.json` keyed by productId — "hard to tell apart" reprint groups.
- No live DB/API in the pipeline repo — it emits static bundles under `dist/<version>/`. A `to_supabase.py` publisher is described in its README but not yet built.

## tcgscan-expo browse layer (the pattern to port)

- `src/config.ts` → `config.browseUrl = '/browse'` (single seam).
- `src/lib/cards.ts` → `loadCatalog()` fetches `catalog.json` once, caches the promise, normalizes snake_case → `CatalogCard`/`CatalogSet`/`CatalogSeries`, holds `Map`s behind a `Catalog` interface.
- `src/hooks/use-catalog.ts` → singleton hook (one fetch/parse app-wide).
- Screens: Series grid → Set grid → Card list, all plain virtualized `FlatList`. **Taxonomy is the pagination — never renders a flat 25k list.** Search capped (cards 40–60, sets 12–14, series 4–6), prefix-boosted substring.
- Images: `expo-image` with built-in memory+disk cache; URL taken directly from `card.image`.
- `metro.config.js` blocklists `public/browse/**` so the files serve statically but aren't bundled/watched.

## michi-maker integration points

- Card model: `DemoCard` (`src/data/binderTypes.ts`) is the UI type; `Card` (`src/types/domain.ts` ← `database.ts`) is the persistence type. Cards today come from `CARDS` / `CARDS_BY_ID` in `src/data/sampleData.ts`.
- Slots reference cards by string id (`DemoSlot.cardId` → `CARDS_BY_ID`; DB `binder_slots.card_id`), OR a raw `imageUrl`, OR an `insertColor`. FK to `cards` already dropped.
- Card picker: `src/components/binder/CardPicker.tsx` — filters the in-memory 70-card array, **no search, no pagination** → the main thing to rebuild.
- Rendering: `src/components/binder/BinderGrid.tsx`, `expo-image`, fixed 63:88 card aspect, `dominant_color` used as a tint backing.
- Example binders (`src/data/content/*`) use TCGdex ids and will NOT exist in the TCGScan catalog → both id spaces must coexist.

---

## Status (2026-07-06)

**P0 + P1 landed and verified** (ultracode workflow `card-db-foundation`):
- `scripts/build-catalog.mjs` → generates `public/browse/catalog.json` (28,032 cards / 212 sets / 17 series, 9.87MB, image URLs rewritten to `/card-imgs/<id>.jpg`). Run: `node scripts/build-catalog.mjs`.
- Images provisioned via a Windows directory **junction** `public/card-imgs` → pipeline `work/card-imgs` (26,968 jpgs; no 2.9GB copy). Both `public/browse/` and `public/card-imgs/` are gitignored + metro-blocklisted.
- Data layer: `src/lib/catalog.ts` (Catalog interface, load-once promise cache, pre-lowercased search index, `catalogCardToDemoCard` adapter), `src/lib/catalogConfig.ts` (browseUrl/imgBase seam), `src/hooks/use-catalog.ts` (singleton hook).
- Wiring: `src/data/cardResolver.ts` `resolveCard(id)` (catalog-first, bundled-fallback); `BinderGrid`/`BinderScreen` resolve through it; `CardPicker` 1×1 list is catalog-backed with a debounced name search across all 25k.
- Verified: `tsc --noEmit` clean; lint clean except one pre-existing warning; adversarial review's 1 major (poisoned promise cache) + 3 minor findings all fixed.
- Known tail: 1,098 cards lack a local scan → render the existing image fallback. `sampleData.ts` intentionally retained (retirement deferred to P4).

**P2 + P2b landed** (`card-picker-taxonomy`, `catalog-browser-redesign`): `src/components/binder/CatalogBrowser.tsx` — Series→Set→Card drill-down with **compact text nav** (no dependence on set/series logo assets, which we don't have), a **dense card grid** (numColumns computed from measured width, ~72px tiles — packs many cards vs. the old 3-col stretch), and a **data-driven Facet framework** (rarity/cardType/year/series/set now; documented one-line seam to add `illustrator`/`pokemonType`/`evolutionStage` later — see facetExtensionNote in `catalog.ts` ~L17-29 + `CatalogBrowser` FACETS array). Single virtualized FlatList (`flex:1`, `getItemLayout`, windowing).

**P3 landed** (`catalog-caching` partial + folded into P2b): lazy background `prefetchCatalog()` (off first-paint via `InteractionManager`), `useCatalog(enabled)` visibility gating, `expo-image` `memory-disk` + `recyclingKey` on all card images (BinderGrid + browser), FlatList windowing/`getItemLayout`, first-row `Image.prefetch`. Graduation path (expo-sqlite / PostgREST) still documented for when the single 9.87MB parse hurts.

**P4 landed** (`example-binders`): `scripts/build-example-binders.mjs` generates **9 catalog-driven example binders** → `src/data/generatedBinders.json` (443 card slots, only cards with a local image), wired into the gallery via `src/data/content/generated.ts` alongside the untouched ukiyo-e binders; home screen (`src/app/index.tsx`) prefetches the catalog so they render. Validated hard: 0 missing card ids / 0 missing images / 0 grid errors; adversarial review clean. The 9: Base Set: All 102 · S&V: One from Every Set · Prismatic Rarity Ladder · The Grail Wall (top-18 by price, $10k Shadowless Charizard hero) · Dollar-Bin Holos · Same Art, Different Set (cross-set reprints) · 1999 vs Now Grail Face-Off · The Support Cast · Newest Era: Mega Evolution 01.

**Done through P4.** Remaining: **P5** (three-project Supabase — the shared `poke-cards` reference DB + Storage for images/catalog, replacing the local junction + static JSON behind the same `loadCatalog`/`catalogConfig` seam). Deferred by design: full retirement of `sampleData.ts`/bundled cards (the curated ukiyo-e binders still reference them; retiring needs those re-authored against the catalog), and the enrichment backlog (`docs/DATASET-ENRICHMENT.md`) that unlocks color-theme / artist / single-Pokémon / jumbo / V-UNION binders for the 25k.

## Phased plan

### Phase 0 — Publish the browse bundle + images (pipeline, no Supabase)
- Run the pipeline's `to_app_public.py` / `browse_data.py` to emit `catalog.json` (+ `alternates.json`, optional `prices/<id>.json`, `prices-summary.json`).
- Copy `work/card-imgs/*.jpg` (26,968 files, 2.9GB) → `poke-michi/public/card-imgs/`.
- Rewrite each card's `image` in `catalog.json` from the TCGPlayer CDN URL to local `/card-imgs/<id>.jpg` (or resolve at load time via a config `imgBase`).

### Phase 1 — Catalog data layer in michi-maker (Q2)
- Add `public/browse/catalog.json` + `public/card-imgs/`; blocklist both in `metro.config.js`.
- Port `src/lib/cards.ts` (`loadCatalog`, `Catalog` interface, `Map`s) + `src/hooks/use-catalog.ts` + a config seam (`browseUrl`, `imgBase`). Keep the whole data source behind `loadCatalog()` for a later Supabase/Storage swap.
- Adapter `CatalogCard → DemoCard`: map fields; image → `${imgBase}/card-imgs/<id>.jpg`; `dominantColor` absent (neutral tint / derive later), `illustrator` absent, `orientation` default portrait, `kind` default standard.
- **Replace `CARDS`/`CARDS_BY_ID` usage** (single id space now): `BinderGrid.tsx`, `CardPicker.tsx` read from the Catalog instead of the bundled array. Retire `sampleData.ts` card literals.

### Phase 2 — Rebuild CardPicker for 25k (Q3)
- Series→Set→Card drill-down (port tcgscan-expo screens' logic into the picker sheet).
- Name search (prefix-boosted substring, capped) + filter chips: rarity, card_type, series, release year, price range.
- Virtualized `FlatList`; preserve existing shape-picker (1×1…3×3), V-UNION, artwork, insert flows.

### Phase 3 — Caching / dynamic loading (Q4)
- v1: one `catalog.json` fetched+parsed once (singleton promise + `Map`s); `expo-image` cache; prices lazy per-id + summary map.
- Graduation (behind the same seam) when the 11–14MB parse hurts: **expo-sqlite** (indexed, no giant parse) or **PostgREST + react-query** (server-side search).
- Consider a smaller thumbnail derivative for grid density.

### Phase 4 — Regenerate example binders + custom taxonomy binders (Q5)
Full migrate broke the old TCGdex-based examples → **regenerate the showcase/example binders against the TCGScan catalog.** Build these (all supported by current data):
- Set-completion (collector-number grid) · Series showcase · Rarity ladder · Vintage-vs-modern (release era) · Grail/chase (top market_price) · Budget rainbow (price tiers) · Reprints (alternates.json) · Type galleries (Trainer/Energy/Stadium).

Retired until enrichment (pipeline work):
- Color-theme binders → add `dominant_color` extraction to the pipeline (it already decodes every image — cheap).
- Artist pages → add `illustrator` via external join (TCGdex / pokemontcg.io).

### Phase 5 — Supabase productionization (Q1)
Three projects:
- **`poke-cards`** (shared reference): `cards`/`sets`/`series`/`prices`/`model_versions` + Storage bucket for images and generated `catalog.json`. Public-read RLS, service-role write, populated by pipeline `to_supabase.py`. Both apps read it.
- **`michi-maker`**: binders/pages/slots (existing schema).
- **`tcgscan`**: user scans/collection/portfolio.
- Apps read the static `catalog.json` from Storage/CDN for browse; hit PostgREST for dynamic queries. Same `loadCatalog()` seam as Phase 1, so the swap is one file.

## Open decisions (remaining)
- **Graduation target** if/when the 11–14MB static-JSON parse hurts: expo-sqlite vs. PostgREST. (Deferred — v1 ships static JSON behind the seam.)
- **Enrichment priority**: whether to add `dominant_color` (and later `illustrator`) to the pipeline as a fast-follow to restore michi's color/artist binder styles across all 25k.

(Resolved: catalog = full migrate to TCGScan; images v1 = host local jpgs. See DECISIONS above.)
