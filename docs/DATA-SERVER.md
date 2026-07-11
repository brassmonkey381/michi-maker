# Data-server integration — state & handoff (2026-07-07)

The app consumes the shared **tcgscan-data** Supabase project (org "TCGScan",
project ref `bmhjizcmwtmcrstadqto`) for ALL card data. That server and its
pipeline live in the `tcgscan-data` repo (`C:\Users\Brian\source\repos\tcgscan-data`)
and are owned by the data/training session — this app is a pure consumer.

## Integration points (all shipped)

The browse kit itself now lives in the shared **`tcgscan-browse`** package (see
item 5); the app-side seams below are the shims that configure and consume it.

| Concern | Where |
|---|---|
| Catalog + images + art origin | `src/lib/catalogConfig.ts` (app shim) — `EXPO_PUBLIC_CATALOG_BROWSE_URL`, `_IMG_BASE` (see `.env.example`); `configureBrowse()`s the package |
| Catalog data access | `src/lib/catalog.ts` (app shim) — re-exports the package client + keeps the `DemoCard` adapter |
| Prices (latest values) | `src/lib/prices.ts` (app shim) — re-exports the package price client; keeps binder/page value totals (badges in `BinderScreen`) |
| Search grammar + "?" manual | `tcgscan-browse` package (`query.ts`) — `QUERY_MANUAL` must be updated there when new fields become searchable |
| Find similar (embeddings RPC) | `tcgscan-browse` package — needs `EXPO_PUBLIC_CATALOG_API_KEY` (publishable), injected via `catalogConfig.ts` |
| Trainer/Pokémon partner tables (✨ Fill composer) | `src/data/trainerPartners.ts` / `pokemonPartners.ts` — load-once REST fetch of `trainer_partners` / `pokemon_partner_groups` (curated rows live in tcgscan-data `supabase/migrations/20260711_19_partner_tables.sql`); TAG-TEAM co-appearances stay name-parsed client-side |
| Card action modal | `tcgscan-browse` package (`CardActionModal`) — place/replace/similar/view-set; app-specific actions injected via props |
| Catalog browser UI | `tcgscan-browse` package (`CatalogBrowser`) — imported by `src/components/binder/CardPicker.tsx` |
| Session browse state | `tcgscan-browse` package (`state.ts`) |

Catalog cards carry size tiers: `image_small` (245px webp — grids use it),
`image_medium` (640px webp), `image` (full, served from our bucket;
`image_cdn` = TCGPlayer fallback URL).

## Pending items this session may pick up

1. **Vercel prod env vars** — ✅ DONE (2026-07-07). The three
   `EXPO_PUBLIC_CATALOG_*` values (in `.env.example`) are set in the Vercel
   dashboard, so prod no longer points at local paths. Re-check them if the
   browse/img/API endpoints ever move.
2. **Binder pages → 640 tier** — ✅ effectively DONE (2026-07-07). Binder covers now
   resolve their image straight from the card id via `cardThumbUrl(id, tier)`
   (`src/lib/catalogConfig.ts`): `card-thumbs/245/<id>.webp` for grids/covers,
   `card-thumbs/640/<id>.webp` for the binder-page view, with an on-error fallback
   to `card-imgs/<id>.jpg`. So a card renders WITHOUT the ~25 MB catalog.json —
   `BinderGrid` only reads the catalog (passively, `useCatalog(false)`) to enrich
   the jumbo/V-UNION badge. If some 640s are still missing, the full-jpg fallback
   covers them automatically.
3. **Catalog first-load perf** (data-server side, recommended). `catalog.json` is
   **25.7 MB** raw; Supabase already serves it **brotli (~1.36 MB on the wire)** with
   `Cache-Control: public, max-age=3600`. The remaining first-load cost is the
   client-side `JSON.parse` + index build. To cut repeat-load cost, bump the cache
   TTL and content-hash the filename (e.g. `catalog.<hash>.json` with
   `max-age=31536000, immutable`) so returning users never re-download or re-parse a
   stale copy; a smaller id→image "lite" manifest would let the app defer the full
   catalog even further. The app already keeps it off the render critical path
   (item 2), so this only affects the editor's browse/search readiness.
4. **Auth + saved binders** — ✅ DONE (2026-07-07). The app now has its own
   Supabase project, **tcgscan-michi-maker** (org "TCGScan", ref
   `piikwvntldytjejxmcla`), holding only user data (profiles/binders/pages/slots)
   under RLS. Full auth (email+password, email code, Google/Apple, guest+upgrade)
   is wired — see `docs/AUTH.md` for the remaining dashboard config (enable OAuth
   providers, add redirect URLs, flip the anonymous toggle). User tables were
   deliberately kept OUT of the shared tcgscan-data project.
5. **Shared browse package (`tcgscan-browse`)** — ✅ DONE (2026-07-07). The
   browse kit (`CatalogBrowser`, `CardActionModal`, query grammar + manual,
   catalog/prices/similarity clients, session browse state) was extracted
   verbatim into `github:brassmonkey381/tcgscan-browse` (MIT) and this app now
   consumes it (see commit `07e66ec`). App-side shims are the seam:
   `src/lib/catalogConfig.ts` reads `EXPO_PUBLIC_*` env and `configureBrowse()`s
   the package (node_modules can't see Expo's inlined env); `src/lib/catalog.ts`
   keeps the `DemoCard` adapter; `src/lib/prices.ts` keeps binder/page totals.
   App-specific actions are injected via props. Remaining: have `tcgscan-app`
   consume the same package.

## Retired (do not resurrect)

`scripts/ingest.mjs` (TCGdex scraper), `scripts/build-catalog.mjs`, the
`public/card-imgs` junction, local `public/browse/` copies — the pipeline
publishes everything now. `scripts/README.md` has the history.
