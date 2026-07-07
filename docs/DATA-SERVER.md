# Data-server integration — state & handoff (2026-07-07)

The app consumes the shared **tcgscan-data** Supabase project (org "TCGScan",
project ref `bmhjizcmwtmcrstadqto`) for ALL card data. That server and its
pipeline live in the `tcgscan-data` repo (`C:\Users\Brian\source\repos\tcgscan-data`)
and are owned by the data/training session — this app is a pure consumer.

## Integration points (all shipped)

| Concern | Where |
|---|---|
| Catalog + images + art origin | `src/lib/catalogConfig.ts` — `EXPO_PUBLIC_CATALOG_BROWSE_URL`, `_IMG_BASE` (see `.env.example`) |
| Prices (latest values) | `src/lib/prices.ts` — `prices-summary.json` from the browse bucket; binder/page value badges in `BinderScreen` |
| Search grammar + "?" manual | `src/browse/query.ts` — `QUERY_MANUAL` must be updated when new fields become searchable |
| Find similar (embeddings RPC) | `src/lib/similar.ts` — needs `EXPO_PUBLIC_CATALOG_API_KEY` (publishable) |
| Card action modal | `src/components/binder/CardActionModal.tsx` (place/replace/similar/view-set) |
| Session browse state | `src/browse/state.ts` |

Catalog cards carry size tiers: `image_small` (245px webp — grids use it),
`image_medium` (640px webp), `image` (full, served from our bucket;
`image_cdn` = TCGPlayer fallback URL).

## Pending items this session may pick up

1. **Vercel prod env vars** — before the next `npm run deploy`, set the three
   `EXPO_PUBLIC_CATALOG_*` values (in `.env.example`) in the Vercel dashboard,
   or the deployed app points at local paths that no longer exist.
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
5. **Shared browse package (`tcgscan-browse`)**: `src/browse/*` is deliberately
   app-import-free — the plan is to extract it (plus `CatalogBrowser`) into a
   shared package consumed by this app and `tcgscan-app`, with app-specific
   actions (find-similar, portfolio-add) injected via props. Coordinate with
   the data/training session before starting this.

## Retired (do not resurrect)

`scripts/ingest.mjs` (TCGdex scraper), `scripts/build-catalog.mjs`, the
`public/card-imgs` junction, local `public/browse/` copies — the pipeline
publishes everything now. `scripts/README.md` has the history.
