# Fill methods

Every way content lands in a binder page, in one place. Two families:

1. **Auto-fill ("✨ Fill page")** — curate a page's *empty* pockets around a seed card, michi-method
   style. Code: `src/data/pageComposer.ts` (`composePage`), UI: `src/components/binder/AutoFillSheet.tsx`.
2. **Manual insert** — the user places one pocket at a time from the "Add to pocket" sheet. Code:
   `src/components/binder/CardPicker.tsx` (+ `SliceStudio.tsx` for artwork).

Auto-fill only ever touches **empty** pockets; anything already placed (the seed included) is left
alone, and the whole fill is a single store commit → one Undo.

---

## 1. Auto-fill compose methods

Defined in `COMPOSE_METHODS` and dispatched in `composePage(method, seed, catalog, page, pool?)`.
`availableMethods(seed, catalog)` decides which are offered for a given seed. All selection is
deterministic except `moreLikeThis` (embedding RPC): standard 1×1 cards only, never a card already
on the page, each `(name, set)` print at most once, and "variety ranking" (round-robin across
series/eras so a page samples styles instead of dumping one set's run).

| Method | Label | What it does | Data source | Offered when |
|---|---|---|---|---|
| `moreLikeThis` | ≈ More like this | Frames the seed with its most visually similar cards (anchor page). | `findSimilar` embedding RPC (tcgscan-browse) | similarity RPC available |
| `samePokemon` | Same Pokémon | The seed's species across sets and art styles. | catalog scan by name/species | species resolvable |
| `evolutionLine` | Evolution line | The seed's family, Basic → final stage, reading left→right (column-major cells). | catalog scan over `evolutionLine` | family length > 1 |
| `pokemonFriends` | Friends & partners | Curated duos / TAG-TEAM lore + species proven to share card art. | `pokemonPartners` (tcgscan-data) + catalog | partners exist for species |
| `trainerPage` | Trainer page | A trainer's signature partner(s), trainer cards, and canonical team. | `trainerPartners` (tcgscan-data) + catalog | `trainerFor(name)` matches |
| `sameArtist` | Same artist | More cards by the same illustrator, sampled across eras. | catalog scan by `illustrator` | illustrator known |
| `colorTheme` | Color theme | The seed's energy colour across eras, with scattered tonal inserts (the michi negative-space look). | catalog scan by type + `TYPE_STYLES` tones | seed has a type in `TYPE_STYLES` |
| `fullPageSpread` | Full-page spread | **⚠️ DISABLED.** One background artwork sliced across every empty pocket, cards reading as accents. | ~~bundled Art of Pokémon (`searchArt`)~~ removed | **never (see below)** |

### "Fill from my collection" (pool)

`composePage`'s optional `pool` arg restricts every **card** candidate to ids the user owns
(`user_cards`, tcgscan-fed). Artwork slices and tonal inserts aren't cards, so they're unaffected.
The AutoFillSheet shows the "From my collection (N)" toggle only when the inventory has cards, and
tags placed pockets `fromCollection: true` so inventory accounting / Reclaim sees them. The
preference sticks for the session.

### ⚠️ `fullPageSpread` is disabled — needs a replacement art source

As of **2026-07-23** we removed the bundled **Art of Pokémon** (artofpkm.com) integration. That was
the only art source `fullPageSpread` had (`searchArt` → seed species, energy-type theme fallback),
so the method can no longer produce a background image. It is:

- **not** listed in `availableMethods` (so the UI never offers it), and
- guarded to `return []` in the `composePage` branch (belt-and-braces).

**TODO(fill): replace the art source and re-enable.** To reinstate:

1. Give it a rights-cleared art source — options: our procedural `themeBackgrounds` (fully owned),
   a user-supplied Slice Studio image, or a licensed gallery pipeline.
2. Restore the placement/crop shape kept in the branch comment (each pocket shows its window of the
   whole image via `imageCrop`).
3. Re-add `out.push('fullPageSpread')` in `availableMethods` (gated on the new source being ready).

`TYPE_STYLES[...].scenery` (the theme words) is retained for exactly this reinstatement.

---

## 2. Manual insert (Add to pocket sheet — `CardPicker`)

Three tabs:

- **Cards** — the unified Series → Set → Card browse (`CardBrowse`, shared `tcgscan-browse`).
  Size (Standard / Jumbo / V-UNION) is a filter; the placed footprint derives from the card's kind
  at drop time.
- **Artwork** — **embeds the Slice Studio** (`SliceStudio embedded`). Bring art in by **URL paste,
  drag-and-drop, image drag, or client upload**, frame/slice it, and save the pieces to your slice
  tray. There is **no art search** here. The studio slices the whole page (its grid = the binder's
  page size); the tray pieces are then dragged/tapped into pockets.
- **Insert** — a tonal negative-space tile, a **themed background** (procedural, fully owned
  `themeBackgrounds` — no external art, no licensing), or "Leave empty".

Art brought in via URL/drag is **PRIVATE** (provenance we can't verify) and hosted in the user's own
bucket, never hotlinked; only a file the user uploads + attests to can go in a public binder. See
`ShareSheet` for the public-binder gate and per-page visibility.

### Slice tray "New"

`SliceTray`'s **New** button opens the **standalone** (full-screen) Slice Studio via
`BinderScreen.openStudioForPage` — same component, `embedded` off. Same save-to-tray flow.
