# Story binders (early access, 2026-09-05)

A story binder is a whole binder built around a sequence of themes — Seasons, Day to night,
Habitats, Moods, Weather — one two-page spread per theme, with a cover page, every spread laid out
on its own and every reserved art panel dressed automatically from Pexels and Pixabay.

**Status: VIP-only experiment, deliberately unadvertised.** Nothing user-facing may mention the tagging (themes, moods, styles on every card): that is the secret sauce, and a VIP is meant to discover it. Descriptions say what a binder IS, not how it was made. No em-dashes in user-facing copy. The owner wants to play with it before
deciding how it is sold. Nothing on Home, Plans, Learn or the footer mentions it. The only entry
point is a small "Story binder" button beside "+ New" on My binders, shown when
`limits.multiPageCompose` is true (the VIP flag "pages around this card" uses). Do not add it to
the plans table or any marketing copy until the owner says so.

## The data it runs on

The catalog (`public.cards_en` on tcgscan-data, cold and warm) publishes illustration tags on
`scene_tags`, surfaced on `CatalogCard.sceneTags`. Each card carries bare and prefixed forms in
weight order, strongest first:

```
["snow","object:snow","scene:snow","foil-obscured","flag:foil-obscured","storm","scene:storm", …]
```

The planner reads only the prefixed forms (`object:` `scene:` `action:` `mood:` `style:` `flag:`)
and turns the order into a rank weight (1.0 for the first, −0.07 per rank, floor 0.25). The weights
themselves are not published; the order is. As of 2026-09-05: 2,524 tagged cards (504 Illustration
Rare, 224 Special Illustration Rare, 280 Ultra Rare, the rest lower rarities), 54 scenes, 33 moods,
60 actions, 65 objects, 18 styles, 9 flags. `scripts/` has nothing for this; the one-off survey
that produced those numbers was a scratch script over `cards_en?select=…&scene_tags=neq.{}`.

## Files

| File | Role |
|---|---|
| `src/data/storyThemes.ts` | The 24 themes (tags wanted, bonus, avoided; stock-art searches) and the 5 templates |
| `src/data/storyBinder.ts` | The pure planner: scoring, diversity, layout choice, seating, art jobs |
| `src/data/storyBinder.test.ts` | `node --test` coverage of the planner |
| `src/lib/stockArt.ts` | Client: search via the edge function, pick a hit for a panel, re-host, credit |
| `supabase/functions/stock-art/index.ts` | Pexels + Pixabay search; keys `PEXELS_API_KEY`, `PIXABAY_API_KEY` |
| `supabase/functions/art-proxy/index.ts` | Allowlist gained `pixabay.com` / `cdn.pixabay.com` (`*.pixabay.com`) |
| `src/data/storyCover.ts` | The pure cover planner: four surfaces of text, stickers and art placeholders |
| `src/data/storyCover.test.ts` | Cover layout within the layer cap; fill/drop placeholders; survives `normalizeCover` |
| `src/components/StoryBinderSheet.tsx` | The VIP sheet: template, shape, source, printings, art on/off, cover on/off; build + progress |
| `src/app/my-binders.tsx` | The entry button and the sheet mount, both behind `multiPageCompose` |

## How a binder is planned

1. **Every theme is ranked up front.** A card scores the sum of its matching `want` tags (rank
   weighted), half weight for `bonus` tags, minus 0.8× for `avoid` tags, plus a rarity ladder
   (Special Illustration Rare 0.7, Illustration Rare 0.6, other full arts 0.45, Ultra/Hyper/Secret
   0.3), minus 0.6 when the foil hides the art and 0.4 when no Pokémon is in the picture. A card
   qualifies on any `want` hit; two `bonus` hits make fallback material. "Illustration rares and
   full arts" (default) keeps only the picture rarities; "Any tagged card" admits everything tagged.
2. **The cover is page 0**, a right-hand leaf on its own (`pageSide`: even indexes are right pages).
   It takes the single-page art template with the most art that seats one hero card per theme, so
   the binder opens on a best-of.
3. **Spreads run (1,2), (3,4), …** so each theme is a true two-page spread in book view. The layout
   is a spread art template chosen by `spreadTemplate`: art-led (never a no-art layout while one
   with art fits), among the richer half, rotating per spread and never repeating the previous
   spread's layout. With the current 3×4 catalogue that cycles Centrefold, Splash and Grid,
   Reliquary and their neighbours.
4. **Cards are chosen by `pickDiverse`:** best first, once per card across the binder, at most one
   per species (`speciesKey`) and two per illustrator per spread.
5. **Seating (`seatingOrder`)** orders each leaf's free pockets by distance to the reserved art
   cells, so the strongest cards sit against the art; cards alternate leaves in score order so
   both pages carry equal weight. Page descriptions are the theme's one sentence, never the tags (owner decision 2026-09-05); `plan.topTags` keeps them for tuning.
6. **Art jobs**: every reserved panel becomes a job carrying the theme's searches and art kind.
   Nothing is capped — a six-theme template makes 13 pages and 15 jobs.

## How art is placed

`StoryBinderSheet.build` creates the binder first (`store.createBinder` with the planned pages, so
it exists and opens instantly), then works the jobs in order: `fetchStockArtForPanel` searches
each of the theme's phrases (landscape/portrait/square from the panel's span, Pixabay
`image_type` from the theme's `artKind`), picks the hit whose aspect is closest to the panel and
whose short side is ≥ 700px, skips hits already used in this binder, and **re-hosts the bytes into
the user's `binder-art` bucket** via `importRemoteArtToBucket` (direct fetch, then the art-proxy).
It then calls `store.placeArtPanels` with one spanning panel and a centred cover crop;
`legalizeArtPanels` splits it into physically insertable pieces exactly as Slice Studio does. The
credit is stamped `{ artist: photographer, sourceName: 'Pexels' | 'Pixabay', sourceUrl, origin:
'external' }`, which is what the sharing gate and the credit strip already understand.

Closing the sheet mid-build stops further fetches; placed panels stay and the rest remain reserved
gaps for Slice Studio.

## The cover (2026-09-05)

With "Dress the cover too" on (PRO/VIP `binderCovers`), `src/data/storyCover.ts` lays out the
four surfaces from the finished plan and the sheet writes it once with `updateBinder(id, { cover })`
(`createBinder` does not persist a cover). Colourway per story on the default Exo-Tec model:
Seasons forest green, Day to night royal blue, Habitats ocean blue, Moods fire red, Weather
sunrise yellow (light shell, dark ink).

| Surface | What goes on it |
|---|---|
| Front | Title in the display face, the story blurb in italic serif, a hero picture, a tag "Created by @user · date" |
| Inside front | A notecard table of contents (numbered themes), a post-it with the build date and counts, one square picture per theme with a caption (captions drop when a picture and a caption per theme would pass the 12-layer cap) |
| Inside back | "By the numbers" on a notecard (pages, spreads, cards, art panels, printings, source), a credits post-it. Nothing about how it was made |
| Back | A wide band of art, the hero cards fanned (up to three `cardId` stickers), the wordmark line |

Cover pictures are fetched like the panels' and share the binder's used-image set, so no picture on
the cover repeats one on a page. Placeholders are image decorations whose id is the job id;
`applyCoverArt` fills one, `dropCoverArt` removes one (with its caption), and anything left empty
is dropped before the write. Positions are computed in width units and converted with the model's
`coverAspect`, so the layout follows the model's proportions.

## Provider terms, in one place

- **Pixabay**: hotlinking its CDN is not allowed; we never do (re-host). Attribution is not
  required by its licence but we credit anyway. `safesearch=true` always.
- **Pexels**: photographs only (illustration searches skip it); attribution requested — we credit
  the photographer and link the photo page.
- Keys live in Supabase secrets, read by the edge function only. Never in `EXPO_PUBLIC_*`.

## History worth knowing

The in-app art search (`src/data/artSearch.ts`) once used Pexels and Pixabay and was moved to the
Art of Pokémon library because photo results looked too realistic against the cards. Story binders
bring stock imagery back on purpose, for themed backdrops rather than as "art of the Pokémon";
themes whose look is flat or drawn (Playful, the Moods cover) ask Pixabay for illustrations.

## Deploying

`stock-art` is a new function and `art-proxy` gained hosts, so both must be deployed and the two
secrets set. Both keep `verify_jwt` on (a plain `functions deploy` does). The owner runs the
one-shot script this session wrote to the scratchpad; it loads the keys from a file, never echoes
them, and deploys both functions.

## Ideas not built yet

- Custom stories: pick and order any of the 24 themes yourself.
- "Auto" story: choose the N strongest themes for the owner's collection.
- Tag search facets (`mood:cold`, `scene:snow`) in Browse, which the `theme:` field already half
  covers (it matches captions and tags).
- Colour harmony across a spread once the catalog exposes `color_art` on `CatalogCard`.
- Weight-aware scoring if the pipeline ever publishes the weights.
