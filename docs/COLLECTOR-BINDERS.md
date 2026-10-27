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
- **Make it a binder.** `store.createBinder` with `pagesForPockets` (nine a page, Plain pages) or,
  with Michi layouts or Curated chosen, `michiPages`: one single-page michi layout drawn at random per page
  from `src/data/artTemplates.ts` (the 3x3 compositions keeping five to seven card pockets: Corner
  Post, Wall Text, Cornerstone, Diagonal Channel), cards in order around the art panels, no two
  neighbouring pages alike, the last page the smallest layout that still fits. Seeded by title and
  pocket count, so the page count shown is the page count built. Reverse-holo pockets carry
  `finish: 'Reverse Holofoil'` on the slot, so the finish chip and the print agree. Caps are
  respected: over the plan's page cap or binder cap the page says so and points at PRO, and the
  free print is offered instead. The binder then prints like any other ($1.99 unlock or a plan's
  included prints).
- **Curate pages** (owner, 2026-10-26: "a story binder from my collection, but my collection is
  instead just this subset"). The Story Binder page planner (`src/data/storyPages.ts` →
  `planPages`) runs over the result: it finds identities in the pool (an evolution family, one
  illustrator, one palette, a clique whose art reads alike), seeds a page with three to six of
  them, fills only while the page stays one idea, trims to an exact-fit 3x3 layout and arranges it.
  `src/data/collectorCurate.ts` turns the result into the planner's pool (one candidate per card,
  strength from the rarity ladder plus a full-art bonus, the evolution family from `evolvesFrom`
  via `evolutionFamilies` when the catalogue carries no lines) and takes the leftovers back: the
  pockets no curated page seated follow, in the result's order, in michi layouts. Nothing
  is dropped, so a set stays complete. Likeness is read from the data server per page, so the
  build takes up to a minute; the page count is known only after the plan, and the page cap is
  checked then. The binder description says how many pages are curated.

## Controls (owner, 2026-10-26)

| Control | Shapes | Rule |
| --- | --- | --- |
| EN / JP / EN + JP | all | `inLanguage`: cards (and set search) in that printing; starts from the browser's language preference |
| Include secret rares | complete, master | `isSecretRare`: a number past the printed total ("200/165"); lettered runs are not secrets |
| Reverse holos after / beside | master | after the run (collectors' default) or each beside its card |
| Add cameo cards | one Pokémon, evolution line | the kit's `cameo:<species>` search on the data server, merged by `withCameos` after the result in release order, marked `cameo`; metered like the browser (a free plan gets the top few and the page says so) |
| Sort: Number / Dex / Release, Rarity, Value, Artist, Name | all | `sortPockets`, a key and a direction; tapping the active chip flips it; Rarity uses `RARITY_RANK`, Value the price summary's headline. Each shape offers the keys that mean something for it (`sortKeysFor`) and starts in its natural order (`naturalSortKey`: a set by number, the dex by Pokédex number, a Pokémon by release); the natural key in its default direction leaves the result as built, so a master set's reverse run stays where its control put it |
| Filter: Rarity, Series, Set, Artist, Type | all (Series and Set only for the Pokémon shapes) | multi-select facets from `facetOptions`, which names only values the result has, with counts; `filterPockets` |
| Full art, Pokémon only, Owned all / only / missing | all | `isFullArt` (kit flag, else the Arrange module's full-art kinds), `isPokemonCard` (card class, else the species rule), the Owned data |
| Newest / oldest print | living dex | which print stands for the species |
| Plain pages / Michi layouts / Curated | all | one choice (owner, 2026-10-27: the earlier In order / Curated switch plus a Michi layouts box were two toggles nobody could tell apart). The sort always decides the sequence; this decides how a page is laid. Plain: nine a page. Michi layouts: `michiPages`, art panels on every page. Curated: `planPages` over the result's pool, pass after pass over what no page took, at most one page per five cards (40 at the outside); the leftovers follow in order in michi layouts. Every in-order page is titled by the span it covers under the sort (`titleTailPages`: "Nos. 010 to 018", "#133 to #134", "2018 to 2016", rarities, illustrators, names) with a one-line description of what it is |
| Fill the art panels with stock photos | michi layouts or curated | after the binder is created, each reserved panel gets a Pexels or Pixabay photo searched by the page's MOOD, not its species (owner, 2026-10-27: stock sites return plush and cosplay for a species name). `pageMood` reads the energy types of the page's cards: Water gets the sea, Fire embers, Psychic a nebula, two scenes a type alternating by panel, a neutral mood for a mixed page. One at a time with a progress note, 60 panels at most; the rest stay panels |
| Admin test: where the art comes from | admins only, with Fill on | `profiles.is_admin` only: Stock photos (the default, everyone's), DeviantArt, Art of Pokémon or both, searched by each page's species through the `fan-art` edge function, which refuses non-admins. The owner's test of an automatic fan-art fill before any decision (2026-10-27); docs/roadmap/ART-RIGHTS.md still stands for users |
| Card view / Art window black / white | all | sets `artView: 'window'` on every page, so the binder opens in the art view; the free print is withdrawn (mats are part of the paid print) and the binder's Print sheet opens with mats on, black by default |

The result shows 18 thumbnails and a "Show all N" button; an evolution line also lists the count
per species ("62 Charmander · 45 Charmeleon · 42 Charizard").

Every control's label is ten words or fewer (owner, 2026-10-26).

## Not done yet

- Spread layouts (the 18 two-page compositions): collector pages are built one page at a time.
- Curated pages for the whole binder: today the planner curates what holds together and the rest
  follows in set order. A chaptered pass (families, then artists, then palette, every card placed
  under some idea) would curate the tail too.
- Filling the art pockets automatically. Licensed sources only when it comes (presets, stock art);
  never third-party fan art (docs/roadmap/ART-RIGHTS.md).
- Cameo coverage depends on the data project's cameo tags; the community sheet import
  (docs/roadmap/CAMEO-SHEET-IMPORT.md) would widen it.
- Set progress on the Set page of the browser.
