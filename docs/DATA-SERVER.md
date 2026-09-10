# Data-server integration — state & handoff (2026-07-07)

The app consumes the shared **tcgscan-data** Supabase project (org "TCGScan",
project ref `bmhjizcmwtmcrstadqto`) for ALL card data. That server and its
pipeline live in the `tcgscan-data` repo (`C:\Users\Brian\source\repos\tcgscan\tcgscan-data`)
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
| Gated catalog download (2026-07-20) | `src/lib/catalogSource.ts` — with a session, the catalog is fetched via the data server's `catalog-key` edge function (AES-256-GCM `catalog.enc` in a PRIVATE bucket, decrypted client-side) and cached encrypted-at-rest (`src/lib/catalogCache.ts`); no session / native / any failure falls back to the public `catalog.json`, which stays published during the migration |

Catalog cards carry size tiers: `image_small` (245px webp — grids use it),
`image_medium` (640px webp), `image` (full, served from our bucket;
`image_cdn` = TCGPlayer fallback URL).

## Pending items this session may pick up

1. **⚠️ THE PAID DATA IS PUBLICLY READABLE** (data-server side, 2026-09-10, UNRESOLVED). PostgREST
   publishes every column the `anon` role can select, so the derived data the paid tiers are sold on
   is downloadable by anyone holding the publishable key — which ships in the web bundle. Measured
   with `npm run check:exposure`:

   | Readable as anon | What it is |
   | --- | --- |
   | `cards.embedding`, `cards_en.embedding`, `card_embeddings_candidate.embedding` | the 64-d artwork vectors behind Find Similar (23.6k rows live, 23.5k candidate) |
   | `cards.scene_caption`, `cards_en.scene_caption` | the artwork descriptions themselves |
   | `cards.scene_tags`, `cards_en.scene_tags` | the theme vocabulary and every card it applies to (28.5k rows in `cards_en`) — the whole of theme search |
   | `cards.color_art`, `cards_en.color_art`, `cards_en.color_neighbors_art` | the palette vectors and precomputed neighbours behind colour search |
   | `cards.full_art_score`, `cards_en.full_art_score` | the full-art scoring |
   | `cards.art_text`, `cards_en.art_text` | **generated** as `scene_caption \|\| scene_tags`; reproduces theme search by itself |

   The page cap is 1000 rows, so the full set is ~59 requests; the rate limiter (PT429) paces a
   scraper, it does not stop one. It also makes the theme meter cosmetic: `search_cards` clamps a
   free caller to `search_config.free_theme_depth` (3), but
   `GET /cards_en?scene_tags=cs.{"storm"}&limit=1000` returns all 63 matches with no clamp at all,
   which is exactly the query `theme-search` exists to charge for.

   **A BARE REVOKE IS NOT THE FIX — it would blank browse and search for every user of both apps.**
   The first version of this note said a revoke breaks nothing, on the evidence that no client
   selects these columns. That is true and beside the point: what matters is what the SERVER selects
   on the client's behalf. Corrected by the data session, 2026-09-10, and confirmed here:

   - **`anon` is the role EVERY catalog request arrives as, signed in or not.** Both apps
     authenticate against the app project (`piikwvntldytjejxmcla`) and read the data project
     anonymously — michi's data-project calls send `apikey` and no `Authorization` (see
     `dist/search.js`; the only bearer token in the kit goes to michi's own `theme-search`
     function). So `authenticated` is nearly a no-op here and `anon` is the breaking half, not the
     safe one. There is no half of this that can ship on its own.
   - **`search_cards` is SECURITY INVOKER and does `select c.*`** from `cards_en`, and the
     `public.cards` union view is `security_invoker = true` naming these columns in its definition.
     Revoking any of them from `anon` therefore breaks the RPC and the view for everyone.
   - **`art_text` must be in the list.** It is a generated column, and a generated column carries
     its own grant: revoking its sources does nothing for it. After the SQL below,
     `GET /cards_en?select=id,name&art_text=ilike.*storm*` still returns 51 rows (measured).

   So this needs a real migration, not a grant statement: recreate the view without the columns,
   give `search_cards` an explicit column list (or make it definer with a JWT-claim check — note
   migration 43's finding that `sb_secret` keys may present no JWT role at all), and carry the
   revoke in the same migration.

   ```sql
   -- The columns that must end up unreadable by anon and authenticated, on cards AND cards_en
   -- (a view does not inherit its base table's revoke), plus card_embeddings_candidate wholesale:
   --   embedding, scene_caption, scene_tags, color_art, color_neighbors_art, full_art_score, art_text
   ```

   Leave the RPCs' own EXECUTE grants alone (TCGScan-DS's request, and correct: revoking a column
   has no business touching execute on `find_similar_candidate`).

   **Cleared by tcgscan-data-science (2026-09-10).** Every reader of these columns over there takes
   the service-role key (`SUPABASE_SECRET_KEY` via `register_model._load_env`), and service role
   bypasses column grants, so `coverage_report.py` / `embed_new.py` keep working; the candidate
   table is only written from there and its evaluation reads go through `find_similar_candidate`
   and `list_candidate_models`. No dedicated evaluation role is needed. Their one request: leave
   the RPCs' own grants alone - revoking a column must not touch execute on the functions.

   **Client side is fully cleared.** The data session grepped `tcgscan-app`, `tcgscan-browse` and
   `michi-maker` and found no direct select of any of these columns anywhere; only the data repo's
   own apply scripts read them, with the secret key. So both roles can be revoked once the view and
   the RPC are fixed.

   **Status: DEFERRED, pending Brian.** He was offered this choice on 2026-09-10 and chose to leave
   it; the data session holds the change and will not act on a relayed request. Unblocking it takes
   one instruction from him in THAT session. Re-run `npm run check:exposure` after: it exits 1
   while any column is still public (14 today, across 3 relations).

2. **Vercel prod env vars** — ✅ DONE (2026-07-07). The three
   `EXPO_PUBLIC_CATALOG_*` values (in `.env.example`) are set in the Vercel
   dashboard, so prod no longer points at local paths. Re-check them if the
   browse/img/API endpoints ever move.
3. **Binder pages → 640 tier** — ✅ effectively DONE (2026-07-07). Binder covers now
   resolve their image straight from the card id via `cardThumbUrl(id, tier)`
   (`src/lib/catalogConfig.ts`): `card-thumbs/245/<id>.webp` for grids/covers,
   `card-thumbs/640/<id>.webp` for the binder-page view, with an on-error fallback
   to `card-imgs/<id>.jpg`. So a card renders WITHOUT the ~25 MB catalog.json —
   `BinderGrid` only reads the catalog (passively, `useCatalog(false)`) to enrich
   the jumbo/V-UNION badge. If some 640s are still missing, the full-jpg fallback
   covers them automatically.
4. **Catalog first-load perf** (data-server side, recommended). `catalog.json` is
   **25.7 MB** raw; Supabase already serves it **brotli (~1.36 MB on the wire)** with
   `Cache-Control: public, max-age=3600`. The remaining first-load cost is the
   client-side `JSON.parse` + index build. To cut repeat-load cost, bump the cache
   TTL and content-hash the filename (e.g. `catalog.<hash>.json` with
   `max-age=31536000, immutable`) so returning users never re-download or re-parse a
   stale copy; a smaller id→image "lite" manifest would let the app defer the full
   catalog even further. The app already keeps it off the render critical path
   (item 2), so this only affects the editor's browse/search readiness.
5. **Auth + saved binders** — ✅ DONE (2026-07-07). The app now has its own
   Supabase project, **tcgscan-michi-maker** (org "TCGScan", ref
   `piikwvntldytjejxmcla`), holding only user data (profiles/binders/pages/slots)
   under RLS. Full auth (email+password, email code, Google/Apple, guest+upgrade)
   is wired — see `docs/AUTH.md` for the remaining dashboard config (enable OAuth
   providers, add redirect URLs, flip the anonymous toggle). User tables were
   deliberately kept OUT of the shared tcgscan-data project.
6. **Shared browse package (`tcgscan-browse`)** — ✅ DONE (2026-07-07). The
   browse kit (`CatalogBrowser`, `CardActionModal`, query grammar + manual,
   catalog/prices/similarity clients, session browse state) was extracted
   verbatim into `github:brassmonkey381/tcgscan-browse` (MIT) and this app now
   consumes it (see commit `07e66ec`). App-side shims are the seam:
   `src/lib/catalogConfig.ts` reads `EXPO_PUBLIC_*` env and `configureBrowse()`s
   the package (node_modules can't see Expo's inlined env); `src/lib/catalog.ts`
   keeps the `DemoCard` adapter; `src/lib/prices.ts` keeps binder/page totals.
   App-specific actions are injected via props. Remaining: have `tcgscan-app`
   consume the same package.
7. **Set/series `language` field (data-server side, RECOMMENDED — 2026-07-18).**
   Cards already carry `language` (`'en' | 'ja'`), and the browse surfaces filter by
   it (EN/JP toggles on Home Recent & Upcoming and `/browse`). But `browse/taxonomy.json`
   and `catalog.json` do **not** carry a language on their **sets** or **series**, so the
   kit currently DERIVES it from the series name (Japanese series are suffixed `" -JP"`,
   e.g. `"Scarlet & Violet -JP"`) — see `resolveLanguage` / `languageFromName` in the kit's
   `catalog.ts`. This is a stopgap heuristic. **The proper fix: emit an explicit
   `language: 'en' | 'ja'` on every set (and series) in `taxonomy.json` and `catalog.json`.**
   The kit is already wired to PREFER it: `RawSet`/`RawSeries`/`RawTaxSet`/`RawTaxSeries`
   accept an optional `language`, and `resolveLanguage(explicit, name)` uses it when present
   and only falls back to the `-JP` name heuristic when absent. So this is a pure additive
   data change — no kit or app change needed once the field ships; the heuristic keeps
   working until then. (Also note: the app's committed `public/browse/catalog.json` is
   EN-only right now; JP data currently lives only on the server/cold path.)

## Retired (do not resurrect)

`scripts/ingest.mjs` (TCGdex scraper), `scripts/build-catalog.mjs`, the
`public/card-imgs` junction, local `public/browse/` copies — the pipeline
publishes everything now. `scripts/README.md` has the history.
