# Search & enrichment — lighting up the new catalog fields

The TCGScan pipeline now **enriches** every card with the aesthetic/gameplay facts the
full-migrate lost (`docs/DATASET-ENRICHMENT.md`). Several items on that backlog are now
**delivered upstream** and just need wiring in. This doc says exactly what changed, what's
now unblocked, and the minimal edits to surface it — mostly through the facet **extension
seam** already reserved in `CatalogBrowser.tsx`.

> This is the michi-maker cut of the shared "metadata search / facets" upgrade. The sibling
> `tcgscan-expo` got the same feature (`docs/search.md` there), but michi-maker already has
> the catalog data layer **and** a data-driven facet framework, so here it's a plug-in, not
> a build-from-scratch.

> ⚠️ **Location note (2026-07-07):** the browse UI referenced throughout this doc —
> `CatalogBrowser`, its `FACETS` array + extension seam, the query grammar — was extracted
> into the shared **`tcgscan-browse`** package (`github:brassmonkey381/tcgscan-browse`; see
> `docs/DATA-SERVER.md` item 5). New facets are now added *in that package*, not in a local
> `src/components/binder/CatalogBrowser.tsx` (which no longer exists here). The app-side seam
> is `src/lib/catalog.ts` / `catalogConfig.ts`.

## What the enrichment delivers (vs `docs/DATASET-ENRICHMENT.md`)

New per-card fields now present in the pipeline `catalog.json` (all additive, all optional):

| enrichment field (catalog.json) | type | backlog item it closes | unblocks (michi style) |
|---|---|---|---|
| `illustrator` | string | **#2 illustrator** ✅ | `artist` pages |
| `dex` | number[] | **#3 pokemon / species** ✅ | `single_pokemon` ("every Charizard" = share a dex #) |
| `evolution_line` | string[] | (bonus) | `themed_story` (e.g. an Eevee line) |
| `evolution_line_length` / `evolution_stage_index` | number | (bonus) | evolution-stage facets |
| `types` | string[] | (bonus) | Pokémon-type facet / galleries |
| `subtypes` | string[] | (bonus) | ex / V / VMAX / Supporter facets |
| `hp`, `stage`, `regulation_mark` | — | (bonus) | extra facets / card detail |
| `jumbo` | bool | #5 jumbo (redundant) | — you already derive `kind:'jumbo'` in build-catalog.mjs; keep yours |

**Still NOT delivered — descoped upstream:**
- **`dominant_color`** (backlog **#1**) — remains absent, so `color_theme` spreads + the
  per-slot tint backing stay blocked. If you want it sooner, compute it client-side from the
  local `/card-imgs/<id>.jpg` during a one-time index pass, or push to re-scope it into the
  pipeline. `catalogCardToDemoCard` keeps leaving `dominantColor` undefined for now.
- `orientation` (#4), V-UNION grouping (#6) — unchanged; you already derive V-UNION groups
  in build-catalog.mjs.

> Species note (backlog #3's subtlety): `dex` cleanly separates *species* from *card name* —
> "Charizard ex" and "Charizard" both carry `dex:[6]`, so a single-Pokémon binder is just
> "all cards whose `dex` includes 6." No name normalization needed.

## Data flow — no build-catalog.mjs change required

`scripts/build-catalog.mjs` writes each card object back **whole** (it only rewrites `image`,
deletes `set_url_name`/`product_url`, and adds `kind`). So the enrichment fields **already
pass through** to `public/browse/catalog.json` — nothing to change there. Two caveats:

1. It reads the pipeline's `dist/dev/catalog/catalog.json`. The DS side must have run
   `build_catalog` (unions enrichment) → `assemble` after enriching. Field **coverage** grows
   as the ~23k-card TCGdex crawl completes (overnight); trainers/energy and any uncrawled tail
   just have empty fields — treat all as optional.
2. Optional: if catalog size matters, `delete` the enrichment fields you don't use in
   build-catalog.mjs (same pattern as `set_url_name`), or keep them all — they're small.

## Wiring (all in `src/lib/catalog.ts` + `CatalogBrowser.tsx`)

### 1. Surface the fields on `CatalogCard`

Add to `RawCard` (snake_case) and `CatalogCard` (camelCase), then map them in the
`LocalCatalog` constructor next to the existing fields — all optional:

```ts
// CatalogCard
illustrator?: string;
dex?: number[];
types?: string[];
subtypes?: string[];
stage?: string;
hp?: number | null;
regulationMark?: string;        // raw_c.regulation_mark
evolutionLine?: string[];       // raw_c.evolution_line
evolutionLineLength?: number;   // raw_c.evolution_line_length
evolutionStageIndex?: number;   // raw_c.evolution_stage_index
```
```ts
// LocalCatalog constructor, per card:
illustrator: raw_c.illustrator ?? undefined,
dex: raw_c.dex ?? undefined,
types: raw_c.types ?? undefined,
subtypes: raw_c.subtypes ?? undefined,
stage: raw_c.stage || undefined,
hp: raw_c.hp ?? undefined,
regulationMark: raw_c.regulation_mark || undefined,
evolutionLine: raw_c.evolution_line ?? undefined,
evolutionLineLength: raw_c.evolution_line_length ?? undefined,
evolutionStageIndex: raw_c.evolution_stage_index ?? undefined,
```

### 2. Add facets — the one-line-each seam you already documented

Per the `EXTENSION SEAM` box on `FACETS` in `CatalogBrowser.tsx`, each new facet is one
descriptor. A facet with no data auto-hides (its `available()` returns `[]`), so these are
safe to add before the crawl finishes:

```ts
{ key: 'illustrator', label: 'Illustrator',
  valuesOf: (c) => (c.illustrator ? [c.illustrator] : []),
  available: (cards) => distinctSorted(cards, (c) => (c.illustrator ? [c.illustrator] : [])) },
{ key: 'pokemonType', label: 'Type',           // energy type — distinct from your 'cardType' facet
  valuesOf: (c) => c.types ?? [],
  available: (cards) => distinctSorted(cards, (c) => c.types ?? []) },
{ key: 'subtype', label: 'Subtype',            // ex / V / VMAX / Supporter …
  valuesOf: (c) => c.subtypes ?? [],
  available: (cards) => distinctSorted(cards, (c) => c.subtypes ?? []) },
{ key: 'evoStages', label: 'Evolutions',       // family size: 1 / 2 / 3 …
  valuesOf: (c) => (c.evolutionLineLength ? [String(c.evolutionLineLength)] : []),
  available: (cards) => distinctSorted(cards, (c) => (c.evolutionLineLength ? [String(c.evolutionLineLength)] : [])) },
```

`applyFacets` (AND across facets, OR within) needs no change. Note there will now be two
"Type"-ish facets — your existing `cardType` (Pokémon/Trainer/Energy) and the new
`pokemonType` (Fire/Water/…); label them distinctly ("Category" vs "Type") to avoid confusion.

### 3. Adapt into `DemoCard` — unlock artist & single-Pokémon binders

`catalogCardToDemoCard` currently leaves `illustrator`/`pokemon`/`dominantColor` undefined
("not present in the TCGScan catalog"). Two of the three are now present:

```ts
illustrator: c.illustrator,                       // → artist pages
pokemon: c.dex?.length ? { dexId: c.dex[0] } : undefined,  // → single_pokemon (species identity)
// dominantColor: still absent (descoped) — leave undefined
```

Adjust to `DemoCard`/`Illustrator`/`Pokemon`'s actual shapes in `src/data/binderTypes.ts` /
`src/types/domain.ts`. National-Dex-# is the species key for "every Charizard"; Japanese
name + sprite (the old `Pokemon` entity's extras) still aren't shipped — derive a sprite from
the dex # client-side if a style needs it.

### 4. (Optional) richer search + style generators

- Extend `search()` to also match `illustrator` (a second pre-lowercased field on the search
  index) so typing an artist name finds their cards — cheap, and it's what the `artist` style
  browse wants.
- `themed_story` / `single_pokemon` example-binder generators (`scripts/build-example-binders.mjs`)
  can now group by `evolution_line` / `dex` — e.g. an auto-built Eevee-line spread.

## Suggested order

1. Fields on `CatalogCard` + constructor (step 1) — everything else depends on it.
2. Facet descriptors (step 2) — immediate filter UI win, auto-hides until data lands.
3. `DemoCard` adapter (step 3) — unlocks `artist` + `single_pokemon` layout styles.
4. Optional search/illustrator + generators (step 4).
5. Decide `dominant_color`: client-side compute vs. re-scope upstream (blocks `color_theme`).

Cross-refs: `docs/DATASET-ENRICHMENT.md` (the backlog this closes), `docs/CARD-DB-INTEGRATION.md`
(the migration + facet framework status), `src/components/binder/CatalogBrowser.tsx` (FACETS seam),
`src/lib/catalog.ts` (CatalogCard + adapter).
