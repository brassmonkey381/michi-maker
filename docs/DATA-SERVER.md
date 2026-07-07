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
2. **Binder pages → 640 tier**: the 640px thumb upload was still running at
   handoff. Once `https://…/card-thumbs/640/<id>.webp` serves 200s, switch the
   binder-page image in `src/data/cardResolver.ts` (`catalogCardToDemoCard`) to
   prefer `imageMedium ?? image`. Grids (245) and the action modal (full) are
   already tiered. Do NOT flip early — missing files don't fall back.
3. **Auth + saved binders** — ✅ DONE (2026-07-07). The app now has its own
   Supabase project, **tcgscan-michi-maker** (org "TCGScan", ref
   `piikwvntldytjejxmcla`), holding only user data (profiles/binders/pages/slots)
   under RLS. Full auth (email+password, email code, Google/Apple, guest+upgrade)
   is wired — see `docs/AUTH.md` for the remaining dashboard config (enable OAuth
   providers, add redirect URLs, flip the anonymous toggle). User tables were
   deliberately kept OUT of the shared tcgscan-data project.
4. **Shared browse package (`tcgscan-ui`)**: `src/browse/*` is deliberately
   app-import-free — the plan is to extract it (plus `CatalogBrowser`) into a
   shared package consumed by this app and `tcgscan-app`, with app-specific
   actions (find-similar, portfolio-add) injected via props. Coordinate with
   the data/training session before starting this.

## Retired (do not resurrect)

`scripts/ingest.mjs` (TCGdex scraper), `scripts/build-catalog.mjs`, the
`public/card-imgs` junction, local `public/browse/` copies — the pipeline
publishes everything now. `scripts/README.md` has the history.
