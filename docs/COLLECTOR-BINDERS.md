# Collector binders

`/collect` (owner's ask, 2026-10-26): the binders serious collectors keep, built from the
catalogue by rule. The page asks for a set or a Pokémon and a shape, shows the count, pages and
how many the viewer owns, then prints the placeholders free or makes a binder in the account.

## Shapes (`src/data/collectorBinders.ts`, pure, tested)

| Shape | Rule | Order |
| --- | --- | --- |
| Complete set | every standard-footprint card in the set | collector number; lettered runs (TG, GG) after the plain run, so secret rares sit at the end |
| Master set | the complete run, then one reverse-holo pocket per card the price summary knows as `Reverse Holofoil` | run, then reverse holos (collectors keep them after the run) |
| One Pokémon | every card whose species is the one asked for (`speciesOf`) | release date, then set, then number |
| Evolution line | each species in the card's `evolutionLine`, or, when the catalogue carries none (the gated catalogue the live app downloads has no `evolution_line`), the family walked from `evolvesFrom`: up to the root, then every descendant breadth first (`familyFromEvolvesFrom`) | by era: release date, then set, then the family's stage order, then number, so Charmander, Charmeleon and Charizard of one set sit together |
| Living Pokédex | one card per species, #001 to #1025, newest or oldest print, plainest name on a tie | dex number; species with no card are reported as gaps |

`speciesOf` strips regional and form prefixes, owner prefixes ("Lt. Surge's"), tag-team partners
and mechanic suffixes (ex, GX, V, VMAX, VSTAR, BREAK, Prism Star, LV.X) before looking the name
up in `src/data/pokedex.json`, the 1025 National Pokédex names (from PokéAPI's species list, with
the awkward spellings written out: Mr. Mime, Farfetch'd, Nidoran♀, Type: Null, Flabébé). Trainers
and energies resolve to '' and never join a species binder.

Jumbo and V-UNION pieces are skipped everywhere: they have no pocket in a 3x3 page.

## Out of the page

- **Print placeholders, free.** Builds an unsaved binder from the pockets (9 a page) and runs the
  same `buildFillSheetPdfs` the paid print uses, with the viewer's owned ids so owned pockets are
  marked. No account, no art, no customising. Web only.
- **Make it a binder.** `store.createBinder` with `pagesForPockets` (nine a page, plain) or, with
  the "Michi layouts" toggle on, `michiPages`: one single-page michi layout drawn at random per page
  from `src/data/artTemplates.ts` (the 3x3 compositions keeping five to seven card pockets: Corner
  Post, Wall Text, Cornerstone, Diagonal Channel), cards in order around the art panels, no two
  neighbouring pages alike, the last page the smallest layout that still fits. Seeded by title and
  pocket count, so the page count shown is the page count built. Reverse-holo pockets carry
  `finish: 'Reverse Holofoil'` on the slot, so the finish chip and the print agree. Caps are
  respected: over the plan's page cap or binder cap the page says so and points at PRO, and the
  free print is offered instead. The binder then prints like any other ($1.99 unlock or a plan's
  included prints).

## Controls (owner, 2026-10-26)

| Control | Shapes | Rule |
| --- | --- | --- |
| EN / JP / EN + JP | all | `inLanguage`: cards (and set search) in that printing; starts from the browser's language preference |
| Include secret rares | complete, master | `isSecretRare`: a number past the printed total ("200/165"); lettered runs are not secrets |
| Reverse holos after / beside | master | after the run (collectors' default) or each beside its card |
| Add cameo cards | one Pokémon, evolution line | the kit's `cameo:<species>` search on the data server, merged by `withCameos` after the result in release order, marked `cameo`; metered like the browser (a free plan gets the top few and the page says so) |
| Sort: Release, Rarity, Value, Artist, Name | one Pokémon, evolution line | `sortPockets`, a key and a direction; tapping the active chip flips it; Rarity uses `RARITY_RANK`, Value the price summary's headline |
| Filter: Rarity, Series, Set, Artist, Type | all (Series and Set only for the Pokémon shapes) | multi-select facets from `facetOptions`, which names only values the result has, with counts; `filterPockets` |
| Full art, Pokémon only, Owned all / only / missing | all | `isFullArt` (kit flag, else the Arrange module's full-art kinds), `isPokemonCard` (card class, else the species rule), the Owned data |
| Newest / oldest print | living dex | which print stands for the species |

The result shows 18 thumbnails and a "Show all N" button; an evolution line also lists the count
per species ("62 Charmander · 45 Charmeleon · 42 Charizard").

Every control's label is ten words or fewer (owner, 2026-10-26).

## Not done yet

- Spread layouts (the 18 two-page compositions): collector pages are built one page at a time.
- Filling the art pockets automatically. Licensed sources only when it comes (presets, stock art);
  never third-party fan art (docs/roadmap/ART-RIGHTS.md).
- Cameo coverage depends on the data project's cameo tags; the community sheet import
  (docs/roadmap/CAMEO-SHEET-IMPORT.md) would widen it.
- Set progress on the Set page of the browser.
