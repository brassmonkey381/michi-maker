# Set drops: binder content the morning a set's cards appear

**Owner's ask (2026-10-27):** our dataset and pipelines let us publish binder content for a new
set the first day its card images exist on TCGPlayer. Set us up to use that, and make the content
unique enough to be reshared. This file is the plan, the runbook and the feasibility notes. The
alarm is `scripts/set-drop-watch.mjs`; the marketing brief is in `marketing-studio`
(`apps/michi-maker/set-drop-brief.md`); the measurement ask is in `analytics-studio`
(`requests/2026-10-27-set-drop-content.md`). The posting account is `@michimakerofficial`.

## Why this is ours to win

Nobody else can show a whole new set as finished binder pages on day one. Pack-opening channels
show one card at a time, hours after release. Price sites show a table. We can show the set laid
out as a collection before the first pack is opened, because:

- the data server's daily lane finds new TCGPlayer cards and publishes them by 05:30
  (`tcgscan-data`, `orchestration/`), with the TCGPlayer CDN picture as the fallback until the
  mirror catches up;
- Collect builds a complete set, a master set or a chase board as a binder in a minute, curated
  one idea a page, with art panels, in the art view with the dex number on every mat;
- the release-binder builder (`scripts/build-release-binders.mjs`) turns a set id into three
  public example binders (Chase Board, Showcase, Beautiful Bulk) that live under Explore;
- hot prices are refreshed daily for cards from sets under 180 days old, so a day-7 price view
  of the same page is one more post we can make and nobody else can.

## The pipeline, end to end

```
05:30  tcgscan-data daily lane publishes the new cards
06:00  scripts/set-drop-watch.mjs (Task Scheduler via scripts/set-drop-watch.ps1)
       → NEW SET / IMAGES LANDED in state/set-drop.log, with the next actions
06:10  build: Collect (complete set, Curated, Art window black) and/or build-release-binders
06:30  capture: the spread and the chase page at 1080x1080 and 1080x1350 (marketing-studio)
07:00  post: carousel + a 10 s reel, caption from the brief, fan-project line
day 7  repost the chase page with the week's price movement
```

The watcher covers every published game: Pokémon from the tables, One Piece, Lorcana, Riftbound, Digimon, Magic and the rest from their public browse bundles (the list is read from `src/lib/otherGameKeys.ts`). Collect builds Pokémon only; another game's set is laid out from the card picker.

The watcher only reports. Every build and every post is a human act, which is also what keeps
the claims honest (`marketing-studio` lints copy against `claims.yaml`).

### The day-one run

1. Read `state\set-drop.log`. A `NEW SET` or `IMAGES LANDED` line names the set, how many cards
   have pictures and how many are hits.
2. Signed in as the owner, Collect → Complete set → search the set → Curated → Art window black →
   Make it a binder. Make a second one: Master set, Michi layouts, Fill the art panels with
   stock photos. Make both public.
3. If the set is a main expansion, add the printed SET_CONFIGS stub to
   `scripts/build-release-binders.mjs`, fill the descriptions, run it, commit the JSON. The three
   release binders appear under Explore and in Home's release row.
4. Capture (marketing-studio `studio social michi-maker`, or Playwright on `/binder/<id>`): the
   open spread as the first frame, then one page per slide. Square for the feed, 4:5 for reach.
5. Post the carousel. Caption leads with the fact only we can state: "Every card in <set>, laid
   out as a binder, the morning the images landed." Link the public binder. Fan-project line.
6. Day 7: the same chase page with the hot prices as a before-and-after.

## What is live today, what is missing

| Piece | State | Gap |
| --- | --- | --- |
| New cards appear daily | live, 05:30 | none |
| Knowing the morning they appear | **`set-drop-watch.mjs`, new today** | schedule it (`set-drop-watch.ps1`) |
| Whole-set binders in one tap | live, Collect | none |
| Release example binders | live, hand-configured per set | a generic config is printed by the watcher; descriptions still hand-written |
| Instagram-sized renders of a binder | marketing-studio compose (1080 square and story), OG render 1200x630 | a one-command "render this binder's pages at 1080x1350" (ask in the marketing brief) |
| Price before-and-after | hot prices daily on the server | no render of a page with prices on the pockets (ask in the brief) |
| Measuring what a post did | share links are tracked (`ANALYTICS-SHARE-LINKS.md`) | a lane that reads them by set and by day (ask in the analytics request) |

## Feasibility of the ideas on the table (owner, 2026-10-27)

**Day-one set binders on Instagram.** Feasible now; four of the six pieces exist and the watcher
closes the detection gap. Risk: the first-day pictures are TCGPlayer's CDN copies, so a day-one
render shows whatever TCGPlayer shows (sometimes a placeholder for a few cards). The watcher's
"pictured" count says how complete a set is before you post.

**Mats combined with AI art extensions.** Technically easy, legally the worst version of the
idea. Extending a card's art outward onto the mat (outpainting) makes a derivative of Pokémon's
copyrighted illustration, and selling that derivative in a PDF is the clearest commercial use
there is. `docs/roadmap/ART-RIGHTS.md` already keeps the app from supplying Pokémon art for
free; selling it is a step further. Not recommended in that form.

**Mats as a purchasable product.** Feasible and recommended, in a form that stays ours:

- What a mat already is: the user's own card behind a window, the card's facts (set, number,
  illustrator, year), the dex number large and faint, black or white. All of that is fact and
  layout, nothing licensed.
- What to sell: mat **styles**. Energy-type palettes (the same moods the stock fill uses),
  paper and foil textures, gradients, a holo-pattern edge, a dark "gallery" style with a white
  rule, a light "museum label" style. Generated or designed once by us, no card art in them.
- How to sell: a mats style pack is a PDF the buyer prints and cuts at home, exactly like the
  binder PDF today, and the print sheet already lists mats as their own file with their paper.
  The simplest product is "this binder's mats in style X" at the binder PDF price, or a style
  pack unlock across binders at a higher one-time price. Decide after the first set-drop posts
  show whether mats get asked about.
- Where the AI fits without the rights problem: generating the **style** textures and the art
  panels (the stock and mood fill), never the picture behind the window.

**Marketing the mats.** The reel writes itself: the printed black mat, the window cut, the card
slid behind, the dex number showing. Physical, tactile, ASMR-adjacent content is the format that
travels best for paper products. Print one set of mats for a chase page and film the assembly.

## Standing out on Instagram, ranked by odds of being reshared

**Owner's call (2026-10-27):** 1, 2, 3 and 5 are go. 4 (build timelapses) is a maybe, last.

1. **The set as a binder, the morning it lands.** The only account that can. Make it a named
   series ("Day One Binder") so followers know to look for it the morning a set appears.
2. **The chase page with prices, day 1 vs day 7.** Price movement is the most shared card content
   there is, and ours is on a binder page instead of a spreadsheet.
3. **Colour pages** (`scripts/social/color-pages.mjs`, already built): a page that reads as one
   colour at thumbnail size. Add a game to it: "guess the set from the palette", answer in the
   comments.
4. **Build timelapses.** A 10 s screen recording of Collect turning a set name into a finished
   binder. Process videos outperform finished product shots; the app does the work on camera.
5. **The mat assembly reel** above, with a free mat sheet for one page of each new set as the
   download in the caption, the full set of mats paid.

Also worth doing, lower odds each: artist pages tagging the illustrator (illustrators reshare
when credited; the mats print their name); the daily puzzle as a story (it already lives on
Reddit); one page per set in the art window, black, nine cut windows and nothing else, which is
the most distinctive picture the app makes.

Format rules that hold for all of it: the first frame readable at thumbnail size, square or 4:5
for the feed, reels 7 to 15 s, post within hours of the images landing, the public binder link
in the caption, the fan-project disclaimer on everything, no tier or price-of-plan state in
frame (marketing-studio's rules), never say how a binder was made (copy rules).

## What each studio is asked for

- **marketing-studio** (`apps/michi-maker/set-drop-brief.md`): a `set-drop` social kit that
  takes a public binder id and produces the carousel slides and a reel cover; a caption
  template with the day-one claim added to `claims.yaml`; and a prices-on-pockets render for
  the day-7 post.
- **analytics-studio** (`requests/2026-10-27-set-drop-content.md`): a lane that, per set and per
  day from the images landing, counts share-link opens, Collect builds of that set, binder
  copies and signups, so the first few drops tell us which of the five formats to keep.
