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
| Evolution line | each species in the card's `evolutionLine`, family order | per species as above |
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
- **Make it a binder.** `store.createBinder` with `pagesForPockets`. Reverse-holo pockets carry
  `finish: 'Reverse Holofoil'` on the slot, so the finish chip and the print agree. The "keep the
  centre pocket for michi art" toggle lays 8 cards a page with (1,1) open; the per-page Arrange
  button does the rest. Caps are respected: over the plan's page cap or binder cap the page says
  so and points at PRO, and the free print is offered instead. The binder then prints like any
  other ($1.99 unlock or a plan's included prints).

## Not done yet

- Arranging every page at once after creation (the arranger is per page; see docs/ARRANGE.md).
- Filling the art pockets automatically. Licensed sources only when it comes (presets, stock art);
  never third-party fan art (docs/roadmap/ART-RIGHTS.md).
- Cameo binders: need per-set cameo tags on the data project (docs/roadmap/CAMEO-SHEET-IMPORT.md).
- Set progress on the Set page of the browser.
