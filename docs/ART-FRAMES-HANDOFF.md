# Art frames: an accurate art window for every card, every game (handoff, 2026-10-29)

**Who does what.** `tcgscan-data-science` measures (it holds the image set and the Python
pipeline that already scores full art). `tcgscan-data` publishes two fields through the browse
bundle and the `tcgscan-browse` kit. `michi-maker` consumes them in `src/data/artView.ts`, where
one constant does the whole job today. Written by the michi session; owner asked for it after the
2026-10-24 art views shipped with a single uniform window.

## What michi has now, and why it is not enough

- `ART_WINDOW = { x0: 0.086, y0: 0.103, x1: 0.917, y1: 0.462 }`: ONE rectangle in card
  fractions, the intersection of thirteen Pokémon scans across seven eras. It never shows frame
  and trims up to 2 percent of art from the widest windows.
- `ART_FULL_TRIM` and `ART_FULL_GAP_OVER_W`: the silver border of a full-art card, measured on 34
  Saboteri promos, used when a connected page is all full art.
- Cards that are neither windowed nor full (V, ex bleed, Radiant, Gold Star, LV.X, Prime, BREAK)
  are cut like a windowed card and look wrong. Trainer windows are shorter than Pokémon windows
  in every era, so a Trainer shows a sliver of text box. Landscape cards (BREAK, Lorcana
  locations, Riftbound battlefields, Magic battles) are cut as if portrait.
- The other games have no window at all: the art window hides for them in Set Binders and the
  renderer falls back to the full card.

## The model: frame classes, not per-card rectangles

Every card gets a **frame class**. A small table maps class to geometry. Per-card rectangles
would be 100k measurements that disagree by a pixel each; per-class rectangles are a few hundred
numbers that connected pages can line up on.

### Fields

In `catalog.json` cards (and `CatalogCard` in the kit):

| Field | Type | Meaning |
| --- | --- | --- |
| `frame` | string | the frame class id, e.g. `pk-sv-pokemon`, `mtg-2015`, `op-character` |

A new file beside the catalog, `frames.json`, one entry per class:

```json
{
  "pk-sv-pokemon": { "kind": "window", "orientation": "portrait",
                     "x0": 0.069, "y0": 0.090, "x1": 0.931, "y1": 0.480 },
  "pk-sv-trainer": { "kind": "window", "orientation": "portrait",
                     "x0": 0.069, "y0": 0.090, "x1": 0.931, "y1": 0.430 },
  "pk-sv-ex":      { "kind": "bleed",  "orientation": "portrait",
                     "x0": 0.000, "y0": 0.000, "x1": 1.000, "y1": 0.560 },
  "pk-full":       { "kind": "full",   "orientation": "portrait",
                     "x0": 0.047, "y0": 0.033, "x1": 0.958, "y1": 0.967 },
  "pk-break":      { "kind": "window", "orientation": "landscape", "...": "..." }
}
```

- `kind`: `window` (art inside a frame), `bleed` (art runs to the card edge on some sides, a
  text panel covers the rest), `full` (art is the whole card inside a border).
- `orientation`: `portrait` or `landscape`. A landscape rectangle is in fractions of the card as
  printed, before any rotation.
- Rectangles are fractions of the card image: left, top, right, bottom. The numbers above are
  illustrations of the shape, not measurements.

michi keeps `ART_WINDOW` as the fallback for a card with no class or a class with no entry, so
nothing breaks while the table fills.

### How a class is measured

1. Pick 10 to 20 scans of the class at random.
2. Run an edge finder for the window's border: the strongest axis-aligned rectangle of gradient
   inside the band where the frame is expected (for `window`), or the text panel's top edge (for
   `bleed`), or the border's inner edge (for `full`).
3. Take the median per side, then step half a percent inward. The scans vary by a pixel or two
   and a hairline of frame at a seam is worse than a hairline of lost art.
4. Keep the per-card measurement too. A card whose own edges disagree with its class by more than
   1 percent is flagged; the flagged list is where the odd promos and misclassifications turn up.

Validation: a contact sheet per class, 20 random cards cut to the class rectangle, eyeballed for
slivers. michi's `scripts/lab/windowed-stock-card.mjs` already renders this layout and can take
a rectangle.

## Classes expected

Where a class comes from existing data, say so; that is most of the work saved.

### Pokémon (25 to 30)

From set era, supertype, subtype and `full_art_kind`:

- Nine eras, each with a Pokémon window and a shorter Trainer window: WotC (Base to Neo),
  e-Card, EX, DP and Platinum, HGSS, BW, XY, SM, SWSH, SV. Energy cards take the era's Trainer
  window or a class of their own if the finder disagrees.
- Specials with their own geometry: V and VMAX and VSTAR (bleed), SV ex (bleed), Radiant, Gold
  Star, LV.X, Prime, Mega and GX (bleed), Tag Team (bleed), BREAK (landscape, gold).
- Full art: one `full` class, today's `ART_FULL_TRIM` numbers, covering IR, SIR, full-art
  trainers, Saboteri-style promos.

Three geometries (WotC, mid-era, modern) cover about 85 percent of cards, which is why the
single intersection has worked as well as it has.

### Magic: The Gathering (12 to 15)

No classifier needed: Scryfall carries `frame` (1993, 1997, 2003, 2015, future),
`frame_effects`, `full_art`, `border_color` and `layout` per card. Classes are those values
combined: the four frames, showcase, borderless, extended art, full-art lands, sagas (art on the
left half), planeswalkers, adventures, battles (landscape). Split, flip and double-faced cards
take the full card and no window.

### Yu-Gi-Oh! (3)

One window for every monster, spell and trap; Pendulum (taller window with the pendulum box);
Rush Duel. From `card_type`.

### One Piece (3 to 4)

Character and Event (bleed, text panel at the bottom), Leader, DON!!, Stage. Alternate and
manga arts are `full`. From `card_type` plus a parallel flag if the server has one.

### Disney Lorcana (3 to 4)

Character (bleed under the ink frame), Action and Item (shorter), Location (landscape),
Enchanted (`full`). From `card_type` and rarity.

### Digimon (4 to 5)

Digimon (bleed with the level band at the top), Tamer, Option, Digi-Egg, alternate art
(`full`). From `card_type`.

### Riftbound (4 to 5)

Unit and Champion Unit, Spell and Signature Spell, Gear and Rune, Battlefield (landscape),
Showcase (`full`). From `card_type` and rarity.

### Cyberpunk (2 to 3)

Unit and Legend, Program and Gear; too few cards to need more.

## Connected art with different windows

A connected sheet needs cells of one shape, so the PAGE picks the cut, which is what
`connectedCut` in michi does today for the full-art case. Generalised:

1. Every card on the page shares a class: cut its exact rectangle. The common case, since cards
   drawn to connect come from one set.
2. Mixed classes: cut every card to the intersection of their rectangles, in card fractions.
   On a mixed Pokémon page that trims under 3 percent of art and never shows frame.
3. Cells keep equal width, so horizontal alignment costs nothing. The width ratio between
   classes is under 3 percent, invisible at a seam.
4. A landscape class never joins a portrait sheet; it takes its own page or falls back to the
   window view.
5. The no-rescale rule (owner, 2026-10-24) holds: the class changes where the cut lands, not how
   the picture is scaled.

## Order and effort

| Step | Repo | Effort |
| --- | --- | --- |
| Pokémon classifier from set, supertype, subtype, `full_art_kind`; measure ~30 classes; flag list | data-science | 2 to 3 days |
| `frame` in `cards_en` and the catalog bundle; `frames.json` beside it; kit maps it to `CatalogCard.frame` | tcgscan-data, tcgscan-browse | half a day |
| `artView.ts` reads per-class rectangles, intersection for mixed pages, landscape rule, art window back on for the other games in Set Binders | michi-maker | 1 day |
| Magic from Scryfall fields, Yu-Gi-Oh! | data-science | 1 day together |
| One Piece, Lorcana, Digimon, Riftbound, Cyberpunk | data-science | 1 day each |

Pokémon alone lands in one session. The whole table is about two weeks of sessions.

## What michi will do the day the fields land

- `CatalogCard.frame` and a `frames.json` fetch next to the catalog, cached load-once.
- `windowPlacement(boxW, rect)` takes the rectangle; `ART_WINDOW` stays as the fallback.
- `connectedCut` returns a rectangle, not a kind: exact for one class, the intersection for
  several, and declines a landscape class.
- Set Binders shows the art window row for every game whose cards carry a class.

## Status: Pokémon measured (2026-10-29, data-science 7557fb6)

**Where the output is.** `tcgscan-data/pipeline/work/art_frames.json` (schema 1: `classes` and
`cards`), the file `tcgscan.catalog.art_frames` publishes. `--check` passes: 26,779 cards in 116
classes. Per-game working files sit beside it in `work/frames/pokemon/` (`frames.json` with
medians and spreads, `card_frames.json`, `measurements.json` with every edge the finder saw,
`flags.json`). Committed: contact sheets and `flags.csv` in data-science
`docs/art-frames/pokemon/`; code in `pipeline/tcgscan/analysis/frames/`
(`python -m tcgscan.analysis.frames.measure --game pokemon`, then `... .sheets`).

Where the result differs from the plan above:

- **116 classes, not about 30.** The base classes are the planned ones (11 eras, counting Mega
  Evolution, times Pokémon/Trainer/Energy, plus the specials and `pk-full`). A set whose cards sit
  more than 1 percent off their class splits off as `<class>-s<set id>`. That happens either
  because the set has its own frame (XY Evolutions is in the Base Set style, Base Set's window is
  narrower) or because TCGplayer cropped that set's scans differently (EX FireRed & LeafGreen sits
  1.6 percent off the other EX sets with the same printed frame). A page from one set still
  shares one class.
- **Rectangle = median over every scan of the class**, not over 10 to 20. A 20-scan sample sat
  more than half a percent off the full median in 19 of 116 classes.
- **Bleed bottoms are the weakness bar** (owner, 2026-10-29). The art of a V, VMAX, GX, EX or ex
  runs on behind the attack text, so the cut ends where the art ends: at about 0.84 of the card
  height, or about 0.89 for SV ex, whose art runs on behind the weakness row.
- **No class** for World Championship deck cards. They are not tournament legal and their scans
  carry a banner across the art (owner). Four undated cards with no scan also have no class.
- `pk-break` is `full`, landscape, given in printed orientation (the scans store it turned a
  quarter turn). `pk-legend` is `full`, portrait, as the scans store the halves.
- **Flags:** 3,144 to review (2 percent or more off, or more than one side off) and 2,853 minor
  (one side, 1 to 2 percent: the scan's own crop varying by a few pixels).

## Status: michi consumes the table (2026-10-30)

`src/lib/frames.ts` fetches `frames.json` once from the browse bucket; `src/hooks/use-frames.ts`
hands it to React. `src/data/artView.ts`: `cardFrame(card, frames)` is a card's own cut (its
class, else the measured full-art border when the catalogue flags full art, else `ART_WINDOW`);
`connectedCut(cards, frames)` returns a `SheetCut` (rect, aspect, gap) that is exact for one class,
the intersection for several, `full` only when every card is, and leaves landscape classes out.
The stock card, the connected sheet, the daily puzzle and the printed mats all go through it.
Guests have no catalogue, so their art views still use the fallback window.
