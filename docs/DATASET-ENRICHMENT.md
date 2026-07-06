# Dataset enrichment backlog

Features the **old bundled 70-card dataset** (`src/data/sampleData.ts`, `DemoCard`, `cardSizing.ts`) carried that the **new 28k TCGScan catalog** (`public/browse/catalog.json`) does NOT. Captured 2026-07-06 during the full-migrate. "Augment later" — none of this blocks P1–P4, but each gap disables a michi feature for the 25k cards until backfilled.

New catalog per-card fields: `id, name, number, rarity, card_type[], set_id/name/code, series, release_date, image`. Plus side files: `prices-summary.json`, `alternates.json`. That's it — a TCGPlayer *catalog/commerce* view, not a gameplay/aesthetic one.

## A. Per-card semantic fields missing

| # | Old field (`DemoCard`) | What it powered | New catalog |
|---|---|---|---|
| 1 | `dominantColor` (hex) | **color-theme spreads** + the per-slot tint backing behind every card | ❌ absent |
| 2 | `illustrator` | **artist pages / artist-feature binders** | ❌ absent |
| 3 | `pokemon` (species identity) | **single-Pokémon binders** ("every Charizard"); distinct from card `name` (e.g. name "Charizard ex" vs pokemon "Charizard") | ❌ absent — only the card name string |
| 4 | `orientation` (portrait/landscape) | landscape-aware layout (full-art trainers, some energy) | ⚠️ new adapter hardcodes `'portrait'` for all |

Related reference entities the old schema modeled (`src/types/domain.ts`) and the new data lacks: **Pokémon** (National Dex #, `name_ja`, `sprite_url`), **Illustrator**, per-set **symbol** art (new has set *logos* via set-art, not symbols).

## B. Card-size / multi-pocket assembly metadata missing (`CardKind`, `cardSizing.ts`)

| # | Old concept | Footprint | New catalog |
|---|---|---|---|
| 5 | `kind: 'jumbo'` | oversized promo → **2×2** pocket footprint (`footprintForKind`) | ❌ no size class; every card treated standard 1×1 |
| 6 | `kind: 'vunion'` | **V-UNION**: one card split into **4 quarter-pieces tiled into a 2×2**, with verified spatial order `[topLeft, topRight, bottomLeft, bottomRight]` (`VUNION` tuples) — the "breaks into 4 cards oriented together to form 1" | ❌ the 4 pieces may exist as individual products, but there is no grouping linking them, no piece order, no assembly metadata |
| 7 | General multi-piece / oriented groupings | any card set meant to tile together (V-UNION today; extensible to panorama/oversized promo sets) | ❌ no grouping concept |

**Note — still works in-app today:** because full-migrate *deferred* retiring `sampleData.ts`, the ~20 bundled jumbo + V-UNION cards keep the editor's 2×2 jumbo and V-UNION flows functional. What's missing is the ability for any of the **25k catalog cards** to be flagged jumbo or grouped as a V-UNION until enriched.

## C. Curation quality (hand-authored, hard to auto-derive)

- Aesthetically hand-tuned `dominantColor` hexes (not just a naive average pixel).
- Verified/curated jumbo list and V-UNION piece tuples with correct spatial order.

## What the new catalog GAINED (for balance)

Full 28k coverage · `rarity` · `card_type[]` · `release_date` (real, per card) · `set_code` · **market prices** (`prices-summary.json`) · **reprint/alternate groups** (`alternates.json`). These unlock the P4 taxonomy/price/reprint binders that the 70-card set could never support.

## Suggested backfill order (when we augment)

1. **`dominantColor`** — cheapest + highest visual payoff. The pipeline already decodes every image; add a dominant-color extraction pass keyed by product id. Unlocks color-theme binders + restores card tint. See [[artwork-sourcing]].
2. **`pokemon` species link** — map each card to a National Dex species (name normalization or an external join). Unlocks single-Pokémon binders + sprite use.
3. **`illustrator`** — external join (TCGdex / pokemontcg.io by set+number). Unlocks artist binders.
4. **`jumbo` flag** — detectable from TCGPlayer product name / dimensions or a curated list.
5. **V-UNION / multi-piece grouping** — grouping table + piece order; small curated set.
6. **`orientation`** — derivable from image aspect ratio during the color pass.

Cross-ref: `docs/CARD-DB-INTEGRATION.md` (the migration), `src/data/binderTypes.ts` (`DemoCard`, `CardKind`), `src/data/cardSizing.ts` (`VUNION`, `JUMBO`).
