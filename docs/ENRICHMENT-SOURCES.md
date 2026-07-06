# Free enrichment sources — research (2026-07-06)

Multi-agent research pass on what card metadata we can scrape/ingest **for free** to fill the gaps in our TCGPlayer-productId-keyed catalog (see `docs/DATASET-ENRICHMENT.md`), the coverage of each, and how to join it. Claims were live-verified via `curl` against each API (not from memory).

## TL;DR — the join answer

**Yes, there is a reliable universal join, and it comes from exactly one source: TCGdex.**

- **TCGdex exposes the TCGPlayer product id directly** — `pricing.tcgplayer.<condition>.productId` (verified: base1-4 → 42382, swsh3-20 → 219233, sv03.5-006 → 502558), **one productId per priced printing** (holo/normal/reverse/1st-ed). That maps **1:1 to our catalog id**, and because it's per-variant it *resolves* the 28k-products → ~23k-cards "collapse": index every productId across all variants and each of our 28k rows attaches to the right card. **This is the primary join.**
- **Nobody shares a card surrogate id with us** (pokemontcg.io and TCGdex both use `base1-4`-style ids; neither is our key).
- **set/number join works only for pokemontcg.io**: our `set_code` **is** the PTCGO code (BS/PRE/MEG verified as `ptcgoCode`), so `set_code == ptcgoCode` + normalized number (strip leading zeros, drop `/total`). But it's **1-card-to-many-products** (can't disambiguate holo vs reverse vs 1st-ed) and loses 25/173 code-less sets (incl. SV "151"). Good for card-level *facts*, not for pinning a productId.
- **Where it fails:** productId join is only populated where TCGdex price-matched TCGPlayer → a minority tail of newest-week sets, many promos, obscure/vintage variants, and all TCG Pocket cards fall to the set+number fallback or go unjoined. Code cards (`number=""`) are largely unjoinable. **Plan for ~high-90s% on mainstream English printings + a manual/unjoinable tail concentrated in promos & code cards.**

## Source comparison

| Source | Gap fields it fills | Coverage | License (commercial) | Join to our productId | Bulk |
|---|---|---|---|---|---|
| **TCGdex** (api.tcgdex.net/v2, `github.com/tcgdex/cards-database`) | illustrator, dexId, HP, types, stage+evolveFrom, subtypes (parse), attacks/abilities, flavor, **jumbo size enum**, variant flags, regulationMark | ~23,315 EN cards | **MIT** ✅ clean w/ attribution | **STRONG — direct TCGPlayer productId** | ✅ clone MIT repo / GraphQL (REST list is briefs-only) |
| **pokemontcg.io** (TCG API v2) | artist, hp, types, supertype, **clean subtypes[]**, evolvesFrom, dex#, attacks, flavor(partial), ptcgoCode | 20,359 EN cards | ⚠️ **no license grant** — facts only, not images/verbatim text | PARTIAL — no productId; `ptcgoCode`+number (1→many) | ✅ `pokemon-tcg-data` GitHub |
| **PokeAPI** (pokeapi.co) | **species/Nat-Dex#, evolution stage + line length (flagship), types (proxy), genera** | ~1000 species = Pokémon-card subset (~55-70% of catalog); 0% Trainer/Energy | **BSD-3** ✅ facts low-risk (don't ship sprites) | NONE — fuzzy card-name → species slug (+ alias table) | ✅ `PokeAPI/api-data` GitHub |
| **Bulbapedia** (+Serebii) | **jumbo/oversized list (only source)**, V-UNION segmentation, residual illustrator blanks | >95% existence, unstructured wikitext | ❌ **CC BY-NC-SA (NonCommercial)** / Serebii all-rights-reserved — **not for commercial bulk** | NONE — name+set+number | ❌ page-by-page crawl |

## Per-gap plan

| Our gap | Best free source | Coverage | Join |
|---|---|---|---|
| **illustrator** | TCGdex → pokemontcg.io backfill | ~99% | direct productId; fallback set_code+number |
| **dominant color** | **none — compute from our own stored images** (k-means/avg on art crop) | 0% from any source | n/a (PokeAPI species color is a weak 10-bucket proxy for the *species*, not the art) |
| **species / Nat-Dex #** | TCGdex `dexId[]` (rides productId join) or PokeAPI | ~100% of Pokémon cards | TCGdex productId; PokeAPI needs name→slug + alias table |
| **energy types** | TCGdex `types[]` / pokemontcg.io | ~100% of Pokémon cards | productId join |
| **evolution stage / how-many-evolutions** | PokeAPI evolution-chain depth (the "water Pokémon with 2 evolutions" query); TCGdex for printed stage | 100% of species once name resolved | TCGdex productId for stage; PokeAPI name→species→chain depth |
| **subtypes (VMAX/V-UNION/ex/Tag Team/GX)** | pokemontcg.io `subtypes[]` (cleanest single array) or parse TCGdex | ~100% modern | pokemontcg.io set_code+number (facts identical across variants → 1→many OK) |
| **HP** | TCGdex `hp` / pokemontcg.io `hp` | 100% of Pokémon cards | productId join. ⚠️ NOT PokeAPI base-stat HP (game stat ≠ printed HP) |
| **jumbo / segmentable** | **derive ourselves** — jumbo via our `"Jumbo Cards"` set + name; V-UNION via name+consecutive `SWSH###` (we already do this, more completely than the "3 V-UNIONs" Bulbapedia lists) | our data ✅ | our own catalog |

## Recommended ingest stack

1. **TCGdex (PRIMARY)** — MIT + the only direct productId join. Clone `cards-database` (not the briefs REST list). One pass fills illustrator, dexId, HP, types, stage/evolveFrom, attacks, flavor, variant flags, regulationMark. Build a flat `{productId → tcgdex card + variant}` map to attach onto our 28k rows.
2. **PokeAPI (SECONDARY, additive)** — BSD-3, safe. Use for evolution-line length + canonical dex/genera, joined by card-name→species slug (alias table for Alolan/Galarian/Mega/Tag-Team forms). Filter to Pokémon cards first via `card_type[]`. Don't use its HP or treat its types as authoritative.
3. **pokemontcg.io (TERTIARY, targeted backfill)** — only for cards TCGdex didn't price-match + its clean `subtypes[]` cross-check. Facts only; **do not redistribute its images/verbatim text commercially.**

## Risks / cautions
- **License is the headline risk, not coverage.** Only TCGdex (MIT) + PokeAPI (BSD-3) are cleanly commercial. pokemontcg.io = facts only. Bulbapedia = NonCommercial, Serebii = all-rights-reserved → barred from commercial bulk embedding. The one gap only Bulbapedia lists (jumbo) we sidestep by deriving from our own data.
- **Treat all card IMAGES from every source as Pokémon IP** — enrich metadata, don't rehost scans.
- **Two easy mis-uses:** PokeAPI HP is the video-game stat (≠ printed card HP); PokeAPI/game types only partially map to TCG energy types. Both corrupt data if fed in raw.
- **dominant color** must be computed from our stored art (no source provides it).
- Static bulk clones freeze community state — newest sets/corrections lag; re-sync periodically.

Cross-ref: `docs/DATASET-ENRICHMENT.md` (the gaps), `docs/CARD-DB-INTEGRATION.md` (catalog seam these ingests would flow through).
