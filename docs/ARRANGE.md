# Arrange: seating cards on a page so the page reads

Spec for an **Arrange** button in the binder editor. Status: approved for a v1 on 2026-10-20
("we can always move forward with this and make improvements after we see how it turns out").
Built 2026-10-21 as a first version: `src/data/arrange.ts` (pure seating, tests),
`src/lib/depth.ts` (depth words via the server), `ArrangeSheet.tsx` (the sheet) and an **Arrange**
button in the page tools; `reseat_slots` (migration 20261021120000) lands a whole rearrangement
in one transaction. A template with fewer pockets than the page has cards is offered too: the
cards it cannot seat go to the binder's **tray** (2026-10-22, see docs/DATA-MODEL.md), from where
they go back into any pocket. Not yet: the card lookup behind a suggestion (the chip names what
would complete the row; it does not yet fetch the card), and the connected-art embedding proxy. The Arrange Lab (below) is the blind test bench for
what is built. The visual demo of each mode on real pages is at
https://claude.ai/artifact/LS4NwvX98QTMbqDmLa58ax (owner-private artifact; the generator is in the
session scratchpad, not this repo). The demo pool is 24 lava cards whose depth comes from their
tags, not hand labels. Lines marked **[owner]** are decisions that are theirs.

## Scope (owner, 2026-10-21; the product's constraints, not only the lab's)

- **Single pages only.** No facing spreads as one canvas. The module can still seat a spread
  (`ArrangeInput.spread`, kept for the tests); the sheet and the lab never ask it to.
- **One art class per page**, read by majority. Full art is `full_art_kind` special_illustration_rare,
  illustration_rare, named_full_art, measured or double_rare; the rest is windowed. The catalogue's
  kinds miss some full arts (2,651 `scene_tagged` rows are full art by the data server's own flag,
  which the app's catalogue does not carry), so a page is read as whatever most of its cards are
  and never refused: refusing blocked the owner on an all-full-art page (2026-10-22). The sheet says
  when it had to decide. `artClassOf`, `pageArtMix` and `readsWindowed` in `src/data/arrange.ts`
  are the one definition. Since kit 0.9.31 the catalogue carries `CatalogCard.fullArt` (the Full
  art filter's own flag, Pokémon only) and it wins over the kind wherever it is present; the kind
  rule remains for cards without it.

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
is still offered; the cards it cannot seat go to the binder's tray, named on the candidate ("2 to
the tray"), never dropped.
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
- Soft: inside a row, on a **windowed** page the frame colours group first in colour-wheel order
  (owner, 2026-10-22: "windowed cards should favor color groupings, THEN themes / strata"), an
  evolution line's stages lead their group in stage order ("evolution lines of course at a high
  priority"), and the palette order (`Tuning.strataOrder`, hue) settles the rest. A full-art row
  keeps lines together and flows by palette. Transition cards sit wherever their colour falls (lab
  run 1 preferred that to forcing them to the ends).
- Soft: brighter rows above darker ones.
- Offered only when each band has enough clean and transition cards to fill its row, or is at most
  one short (then with the suggestion). Otherwise the two-band version, or not at all.
- Evolution lines go **vertical** here, one stage per row, only when the stages' own scenes climb
  with the stage (Magikarp underwater, Gyarados at the surface). When they do not, the line is
  left to Lines.

Stratum from tags, in caption rank order (the first matching tag wins):

| Band | Tags |
| --- | --- |
| Above | sky, clouds, stars, moon, space, rainbow, aurora, airborne, flying |
| Surface | grass, field, meadow, forest, trees, jungle, beach, desert, city, town, road, mountain, volcano, lake, river, ocean (surface), snow, ice |
| Below | underwater, seaweed, coral, cave, underground, mine, sewer, dungeon, deep sea |

Not depth words: **rocks** (they are in every band) and **smoke** (it rises; a smoking volcano is a
surface card), both from the first draft; and, from the first lab run (2026-10-21), **weather and
light** (storm, lightning, sunset, sunrise: a storm over a city is a city card, a sunset on a beach
is a beach card) and **tunnel** (a mouse in a road tunnel is not underground).

A card with no stratum word is **free** and can sit in any band; free cards fill whatever the
strata leave short. A free card whose connected partner is seated goes under or over it first
(the Legend's bottom half sits under its top half, in the row below).

### Lines

Rows are evolution lines, read left to right in stage order.

- Hard: a line's stages are in one row, adjacent, ascending.
- Soft: a two-stage line sits at a row's edge and its third cell goes to kin (the same species in
  another era, its trainer, its partner). Lines of the same type share a page.
- Offered from one line of two or more stages onward (2026-10-22; it used to want two).

### Flow

One palette gradient across the whole page, no grouping, on a full-art page. On a **windowed**
page the frame is what the eye reads, so Flow groups by energy type first (owner, 2026-10-21:
"fires should go in a row or column together, as should waters, etc ... the art comes
secondary"): each type is one group, the groups run round the colour wheel (fire, fighting,
dragon, lightning, grass, water, metal, psychic, fairy, darkness, colorless, trainer), the art
gradient runs inside each group, and the sequence is cut into the page's rows or its columns,
whichever leaves more lines of one type. Inside a group the evolution lines lead in stage order,
then sky before ground before underground, the art gradient inside each depth: colour first, then
lines, then depth. A typed Flow ranks level with Strata (no fallback prior) because on a windowed
page it is the structure the eye reads first. `Tuning.flowByType`, on by default; the lab's variants
test puts it against the plain gradient on windowed pages.

- Soft (full art): minimise total palette distance between horizontal neighbours, and between
  vertical neighbours at half weight.
- Soft (windowed): lines of one type; fit is the share of lines that are.
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

Why the lab preferred six-card templates on windowed pages (owner, 2026-10-22): fewer cards make
clean colour groups likelier, so a template that sends three cards to the tray can read better than
the full nine. The ranking lets that happen (art x4, the tray nearly free).

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
- Ranked by score: a **mode prior** (`MODE_PRIOR`: Lines +1, Strata 0, Mirror -0.25, Flow -0.5,
  from the lab runs, where the owner read structure before gradient), then fit x3, pairing x0.5,
  art share x4, less 0.1 per card sent to the tray and 0.25 per open pocket (`SCORE_WEIGHTS`).
  The art weight and the near-free tray come from run 2, where an art template beat the plain page
  7 times in 8 and every pick sent cards to the tray.
- **Diverse**: never two of the same mode in the top three, and at least one
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

## The arranger: one score, tuned to the owner's eye

Owner, 2026-10-22: "What if we just had one optimal arranger, and we just worked iteratively on
tuning it? Kind of like an AI, arrange this page." So since then there is ONE arranger
(`src/data/arranger.ts`) and the four modes above are the seatings it starts its search from.

One score, the weighted sum of terms a collector reads a page by, each 0 to 1 and absent where it
cannot apply: **palette** (neighbours close in colour), **similar** (neighbours that look alike:
Find Similar's art likeness, colour, geometry and style), **rowSimilar** (each row one family),
**depth** (rows by depth, pure, sky above ground above underground), **lines** (a line's stages
adjacent and in order), **type** (on a windowed page, lines of one frame colour), **art** (pockets
the template spends on art), less **held** (cards sent to the tray) and **open** pockets.
Connected art is adjacent, hard. A template must seat at least half the page's cards.

The search: on every layout the shape allows (the page as it is, then each template), climb from
each mode's seating, the page as it is and a plain fill, let a held card trade in while that reads
better, keep the best; the best across layouts is the answer, the next two that differ are the
other takes. One weight set, `ARRANGER_WEIGHTS`, is the champion.

**The lab is champion against challenger.** `scripts/arrange-lab/`: `build.mjs` makes duel rounds
(the champion's answer beside a copy with one weight halved or doubled, on the owner's own pages
and the theme pools, only where the nudge changes the answer; likeness read off
`cards_en.embedding`) and misses rounds on the champion's answers; `serve.mjs` serves `lab.html` on
127.0.0.1:8766; `results.mjs` tallies per nudge and `--adopt` moves the champion
(`state/out/arrange-lab/weights.json`, which the next build duels from; `ARRANGER_WEIGHTS` is
brought in line by hand). Launcher `state/out/arrange-lab.ps1` (`-SkipBuild`, `-Results`,
`-Adopt`). Run it as often as the arranger needs; every run only ever moves it toward the owner's
eye. The two runs before the arranger are kept below for the rules they settled.

### Lab run 1 (2026-10-21, 47 rounds, all answered)

| Test | Result | Change made |
| --- | --- | --- |
| modes | Mirror won 3 of 5 columns, Strata 6 of 11, Flow 3 of 12, Lines 0 of 1 | with sheet: `MODE_PRIOR` |
| sheet | the app's #1 picked 3 of 10, its #2 7 of 10; Lines 2 of 2, Mirror 5 of 8, Flow 2 of 10, Strata 1 of 5 | `MODE_PRIOR` Lines +1, Mirror -0.25, Flow -1.5: the pick ranks first in 17 of 22 decided rounds, 8 before |
| variants | hue 1, chain 1, light 0 (2 ties); mixed transitions 1, at ends 0 (2 ties); vertical 0.5 wins 2 of 4; dark seed 2 of 3; illustrator twin 2 of 2 | `transitionsAtEnds` default off; the rest unchanged |
| misses | Strata 4 of 66 cards wrong (storm, tunnel, sunset, one beach); Flow 3 of 30 | storm, lightning, sunset, sunrise, tunnel out of the table |

The sheet rounds were all 3x3 pages, where no art template seats nine cards, so they ranked modes
only. Templates with art were not tested; a page with held cards (the lab's Strata column on a
lopsided pool) was picked anyway in three modes rounds, which is what led to the tray: since
2026-10-22 the sheet offers every template for the page's shape and the displaced cards go to the
tray, and the lab's sheet rounds do the same.

### Lab run 2 (2026-10-22, 52 rounds, all answered; templates and the tray in play)

| Test | Result | Change made |
| --- | --- | --- |
| modes | Strata 5 of 11, Flow 3 of 12, Mirror 1 of 5, Lines 0 of 2; one tie, two "none" | none |
| sheet | the app's #1 picked 2 of 10, #3 picked 4; Wall Text won 5 of 7, Establishing Tier 1 of 1, the plain page 1 of 8; the pick sent 3 to 5 cards to the tray every time | art share x4, tray cost 0.1 per card, Flow prior -0.5: the pick ranks first in 9 of 17 decided rounds, 5 before |
| variants | every knob but one tied in nearly every round; `flowByType` on won 3 of 5 against the plain gradient | `flowByType` stays on; the other defaults stay |
| misses | Strata 1 of 69 cards (a Shellos at the sea surface whose first word was sky); Flow 3 of 27 | none |

### Lab run 3 (2026-10-22, 36 of 38 rounds; the first duel run, champion against one nudge)

| Nudge | Record | Adopted |
| --- | --- | --- |
| depth x2 | 1 won, 1 none | yes: depth 4 |
| type x2 | 2 won | yes: type 3 |
| lines x0.5 | 2 won | yes: lines 1 |
| similar x0.5 | 1 won, 1 equal | yes: similar 0.75 |
| held x0.5 | 1 won, 1 none | yes: held 0.125 |
| art x0.5 and art x2 | 2 won and 1 won | both won, so art stays 1 |
| palette, rowSimilar | ties or lost | unchanged |

Misses: 4 of 33 cards on the arranger's answers (a Hiker and a Skarmory in a sky row on
clouds-first captions; a rainbow Togekiss; a Patrat on a field). The clouds and rainbow words
want watching in run 4.

### Lab run 4 (2026-10-22, 39 of 39 rounds)

Adopted: held x2 (back to 0.25), similar x2 (back to 1.5), rowSimilar x2 (1), palette x0.5 (0.5),
open x2 (0.6). Thirteen of seventeen nudges tied or were "none", and type x2 lost 2 to 0 where it
had won 2 to 0 the run before: the champion is settling, and two-round records swing. Rule from
here: a weight that flips twice in a row is left alone on the next run. Misses: 4 of 36 (Ralts in a
garden, Annihilape under trees with clouds, Metang and Masquerain on ice): no word pattern yet.

## Complete page (2026-10-22)

Owner: "clicked on an empty cell of the page and clicked a button 'complete page'. It would show
the output of completing the page, taking all the other already existing slotted cards on the page
into account, and doing a similarity fill, color palette fill, theme fill, or other fill." Fill
page takes one seed card; this takes the whole page as the seed and fills only the empty pockets,
in reading order; placed cards never move and Arrange stays a separate tap ("arrange comes later").

`src/data/pageCompleter.ts` (pure; the similarity and palette providers are passed in) and
`CompletePageSheet.tsx`, opened from the page tools (Complete) and from the Cards side when an
empty pocket is aimed at. Fills: like the whole page (Find Similar over the page's ids, the
server averages the vectors; PRO), same palette (every placed card's colours against the device
index), same type, same artist, finish the lines (the missing stages, from the line's own set
when it has one), same theme (the data server's `theme_fill`, migration 85: the scene words two or
more of the page's cards share, cards sharing at least two of them, ids only; `lib/themeFill`).
The page's art class steers which prints come first and is passed to theme fill. Theme fill has no
paid gate on either side yet (owner undecided).

## Binder building: identity-seeded pages (2026-10-21)

The owner asked for a few private full-art theme binders built with the arranger, to inspect. The
first cut dealt a theme's full arts onto pages by depth band and arranged each page: "the cards on
a page did not belong together ... half the page is clearly one theme, and then the others seem
random." The second cut is the one the owner rated **one of the best binder-building methods so
far**, and named as a possible feature (a story-binder type, with more pages and cards to draw on):

1. **Pool**: the theme's full arts (scene words), ranked by how strongly each is the theme.
2. **Identity**: tight groups found in the pool, each one page's reason: an evolution family, one
   illustrator, one palette family (a 30-degree hue bin of the dominant colour, or the darks, or
   the pales), or a clique whose art reads alike (embedding cosine). Three to six seed cards go
   down first: the owner's "load 25-50% of the page with intentionality".
3. **Fill only while the identity holds**: candidates by the page's own method (same family or
   same hand first, then likeness to the seeds' centre, or palette distance to the seeds); a card
   that reads less like the seeds than the seeds do to each other is not placed. Pages stop
   short rather than take a random card.
4. **Trim to a template size** (6, 8, 9, 12 on 3x4), then the shipped arranger with exact-fit
   templates only: no hole, nothing to the tray.
5. **Order** pages by mean hue so the binder flows. Page title is the identity, page notes say
   seeds, fill method, where the fill stopped and the arranger's reason.

At the strict floor (0.68 cosine) most pages come out as six cards and a poster panel; the
twelve-card pages are the palette ones. The dial is the fill floor. The three inspection binders
were deleted on request, and the method shipped the same day as the Story binder's "Curated pages"
mode: `src/data/storyPages.ts` (docs/STORY-BINDERS.md, "Curated pages"), which also drives
`scripts/arranged-binders.mjs` (dry run prints every page; `--apply` writes private binders on
fakemichi, replacing same-titled ones).

## Open for the owner

- Add cards: decided, one sparing suggestion per candidate, see above.
- **[owner]** When Strata and Lines both fit the same cards, both are offered. Agreed?
- Spread as one canvas: decided no, single pages only (2026-10-21).
- **[owner]** Stratum table above: words to add, move, or remove.
