# Arrange: seating cards on a page so the page reads

Spec for an **Arrange** button in the binder editor. Status: approved for a v1 on 2026-10-20
("we can always move forward with this and make improvements after we see how it turns out").
Nothing is built yet. The visual demo of each mode on real pages is at
https://claude.ai/artifact/LS4NwvX98QTMbqDmLa58ax (owner-private artifact; the generator is in the
session scratchpad, not this repo). The demo pool is 24 lava cards whose depth comes from their
tags, not hand labels. Lines marked **[owner]** are decisions that are theirs.

## What it is

A page or spread holds a set of cards the owner already chose (say, 24 lava cards on a 3x4 spread).
Arrange proposes several finished layouts for those cards, each one a pairing of:

- a **template** from the michi layout catalogue (`src/data/artTemplates.ts`: 33 compositions, 15
  single-page and 18 spread), which decides which pockets are art and which are cards, and
- an **arrangement mode**, which decides which card sits in which card pocket.

Arrange never invents a composition. The template catalogue is the whole set of compositions it
can offer, so a proposed page is always one a curator named, with art panels that each have a role
and a brief (`ART_ROLE_GUIDE`). Spending pockets on art is the point of this app, and Arrange keeps
that preference: among the candidates it shows, at least one spends more pockets on art than the
page does now.

Arrange seats the cards the page has. A template with fewer card pockets than the page has cards
is still offered; the cards it cannot seat are listed as held for the next page, never dropped.
It may **suggest** one card the page does not have, sparingly (owner, 2026-10-20: "a good feature,
but should be used sparingly"): at most one per candidate, only when a single card completes a row
or a band (the missing middle stage of a line that is otherwise on the page; the one card short of
a depth band), drawn from the same theme the page came from. A suggestion is a chip, not a change.

## The four modes

Each mode has hard rules (a seating that breaks one is not a candidate) and soft rules (a score).
Two rules hold in every mode:

- **Connected art is adjacent**, in the orientation the art continues. Hard.
- **Shared minor themes touch.** Two cards that share a tag the rest of the page lacks (the same
  species, the same illustrator, "night") score higher as neighbours. Soft, and the lightest weight
  of all, so it breaks ties rather than bending a gradient.

### Strata

Rows are depths. The eye reads the page as a cross-section: sky, surface, below. Three rows is the
natural case; a 2x4 page gets two bands.

- Hard: every card in a row shares the row's stratum, where the card has one.
- Hard, **row purity** (owner, 2026-10-20: "make sure the themes at the top row are not present
  in the other rows"): a row owns its band's words, so no other row may show them. The **first**
  depth word in a card's caption decides its band, because it is what the picture is mostly of:
  Galarian Moltres flying over a volcano is a sky card (owner, 2026-10-20, after a draft held it
  out: "a bad decision"). Each card is then one of:
  - **clean**: all its depth words are in one band;
  - **transition**: a later word names another band ("partially underground, mostly above
    ground"). Allowed in its own row, seated at the row's ends, and marked so the user can see
    which cards carry a little of the next depth.
- Nothing is borrowed across bands. A pocket stays open rather than hold a card from the wrong
  depth, and that open pocket is what earns the one sparing suggestion (a clean card of the short
  band, same theme, a species the page does not have).
- Soft: palette flows left to right within a row; brighter rows above darker ones.
- Offered only when each band has enough clean and transition cards to fill its row, or is at most
  one short (then with the suggestion). Otherwise the two-band version, or not at all.
- Evolution lines go **vertical** here, one stage per row, only when the stages' own scenes climb
  with the stage (Magikarp underwater, Gyarados at the surface). When they do not, the line is
  left to Lines.

Stratum from tags, in caption rank order (the first matching tag wins):

| Band | Tags |
| --- | --- |
| Above | sky, clouds, stars, moon, space, storm, lightning, rainbow, sunset, airborne |
| Surface | grass, field, meadow, forest, trees, jungle, beach, desert, city, town, road, mountain, volcano, lake, river, ocean (surface), snow, ice |
| Below | underwater, seaweed, coral, cave, underground, ruins (when with cave), lava (when with cave or underground) |

Not depth words: **rocks** (they are in every band) and **smoke** (it rises; a smoking volcano is a
surface card). Both were in the first draft and mis-sorted real cards.

A card with no stratum word is **free** and can sit in any band; free cards fill whatever the
strata leave short. A free card whose connected partner is seated goes under or over it first
(the Legend's bottom half sits under its top half, in the row below).

### Lines

Rows are evolution lines, read left to right in stage order.

- Hard: a line's stages are in one row, adjacent, ascending.
- Soft: a two-stage line sits at a row's edge and its third cell goes to kin (the same species in
  another era, its trainer, its partner). Lines of the same type share a page.
- Offered when at least two rows can be full lines.

### Flow

One palette gradient across the whole page or spread, no grouping.

- Soft: minimise total palette distance between horizontal neighbours, and between vertical
  neighbours at half weight. A spread is one canvas, so the gradient crosses the gutter.
- Always offered. It is the mode that needs nothing from the cards but their pictures.

### Mirror

Symmetric weight across the gutter, or across a single page's centre column.

- Soft: the two strongest cards (full art, then rarity) in mirrored cells: the outer corners, or
  the centre of each leaf. The same illustrator in the same cell on each leaf. Palette mirrored
  rather than flowing.
- Offered on spreads, and on single pages with an odd column count.

## Pairing a mode with a template

Some panel roles make a mode read better; some fight it. The pairing score is added to the
seating score, so a fighting pair is ranked down rather than banned.

| Role | Strata | Lines | Flow | Mirror |
| --- | --- | --- | --- | --- |
| title (top band) | strong: the art is the sky | neutral | neutral | neutral |
| band (between rows) | strong: it is the horizon or the waterline | weak: it cuts a line | weak: it breaks the gradient | neutral |
| footer | neutral | neutral | strong: caption under the run | neutral |
| rail | neutral | strong: frames the list | neutral | strong when on both leaves |
| anchor | weak if it spans bands | weak if it eats a row's middle | weak | strong when centred |
| post | neutral | neutral | neutral | strong in matching corners |
| plate | not offered (no cards) | | | |
| accent | neutral | neutral | neutral | neutral |

Examples that should rank high for a lava spread: Establishing Tier with Strata (sky band above,
lava fields, caves below); Titled Run with Flow; Twin Anchors or Bookends with Mirror; Triptych
Rails with Lines on a single page.

## The candidate sheet

One button on a page or spread. It opens a sheet of **four to six** candidates as thumbnails of
the actual cards in the actual pockets, each named by its pairing with a one-line reason the user
can check against the picture:

- "Establishing Tier · strata: sky above, lava fields, caves below"
- "Titled Run · flow: dark basalt left to white heat right"
- "Twin Anchors · mirror: the two full arts in the corners"

Rules for the list:

- The page as it is now is always the first card, so looking costs nothing.
- Ranked by score, but **diverse**: never two of the same mode in the top three, and at least one
  candidate with more art than the current page.
- Tapping one rearranges the page with undo. Hand placements made afterwards are never overridden;
  Arrange is run again by choice.
- Each pick is recorded (template, mode, rank shown, rank picked) so the weights can be tuned
  later from what the owner actually chooses.

## Signals and where they come from

| Signal | Source | Notes |
| --- | --- | --- |
| Evolution line, stage | catalog `evolution_line`, `evolves_from`, `evolution_stage_index` | already selected by the kit's `CARD_COLS` |
| Scene and object tags, ranked | `cards_en.scene_tags` (`scene:`, `object:` namespaces) | the puzzle scheduler reads the same column |
| Palette | `color_art` vectors, `color_neighbors_art` | public Storage files; the tri-color search uses them |
| Art likeness | 64-d art embeddings behind Find Similar | for connected art and minor-theme ties |
| Full art, rarity | catalog `full_art_kind`, `rarity` | weight for Mirror |
| Illustrator, set, number | catalog | connected-art proxy, mirror pairs |

**Connected art has no flag anywhere.** Proxy: same set, same illustrator, consecutive numbers,
art embeddings very close. It will catch most and miss some.

## Solver

24 cells and 24 cards is small. Seed each mode's seating (strata: bucket then sort by palette;
lines: rows by line; flow: nearest-neighbour chain from the darkest card; mirror: strongest to the
corners), then improve by pairwise swaps until no swap raises the score, with a few random
restarts. Milliseconds in the browser, no server. Pure functions in `src/data/arrange.ts` with
`node --test` coverage, like `pageComposer.ts`.

## Effort

| Piece | Estimate |
| --- | --- |
| Scoring, four modes, solver, tests | 1 day |
| Candidate sheet with thumbnails, undo, pick log | 1 day |
| Stratum table and connected-art proxy, tuned on real pages | 1 day |
| Template pairing weights, tuned by eye | half a day |

## Open for the owner

- Add cards: decided, one sparing suggestion per candidate, see above.
- **[owner]** When Strata and Lines both fit the same cards, both are offered. Agreed?
- **[owner]** Spread as one canvas for Strata and Flow (default yes).
- **[owner]** Stratum table above: words to add, move, or remove.
