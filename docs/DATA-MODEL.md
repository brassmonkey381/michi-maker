# Data model

How poke-michi represents the [Michi Method](https://woahpoke.com/michi-method/) and where the
card data comes from. The authoritative schema is
[`supabase/migrations/`](../supabase/migrations); this document explains the *why*.

## The Michi Method, modeled

The Michi Method treats a binder page as a **canvas**, not a storage grid. The data model is
built around that idea:

- A **binder** is a curated collection with a chosen layout *style*.
- A binder has ordered **pages**; each page is a grid (default 3×3 — a standard 9-pocket page).
- Each **slot** is a placement on a page. Crucially, a slot can:
  - **span multiple pockets** (`row_span` / `col_span`) for artwork or multi-slot panels,
  - hold different **content** (`slot_type`): a real `card`, a custom `insert`, spanning
    `artwork`, or deliberately stay `empty` to preserve negative space,
  - carry an **orientation** (portrait / landscape).

### Layout styles (`michi_layout_style`)

Mirrored in `src/types/domain.ts` as `MICHI_LAYOUT_STYLES` (with labels + descriptions for the UI):

| Value              | Meaning                                                        |
| ------------------ | ------------------------------------------------------------- |
| `anchor`           | One or two hero cards surrounded by complementary cards        |
| `single_pokemon`   | One species across many art styles                            |
| `themed_story`     | A narrative spread (e.g. an Eevee evolution line)             |
| `artist`           | A page of one illustrator's work                              |
| `trainer`          | Built around a specific trainer character                     |
| `full_page_spread` | Large artwork spanning the page, cards as accents             |
| `color_theme`      | A unified colour palette                                      |
| `freeform`         | No fixed style                                                |

The `cards.dominant_color` field exists specifically to power `color_theme` pages and palette
suggestions.

## Entities

### Reference data (the catalogue) — read-only to clients

| Table          | Purpose                                                                |
| -------------- | ---------------------------------------------------------------------- |
| `pokemon`      | Species: dex number, English + Japanese names, sprite                  |
| `illustrators` | Card artists (the Michi Method loves artist pages)                     |
| `card_sets`    | Sets / products / packs                                                |
| `cards`        | Individual cards: name, set, illustrator, species, image, `dominant_color`, orientation |

### User data — Row Level Security protected

| Table          | Purpose                                                                 |
| -------------- | ----------------------------------------------------------------------- |
| `profiles`     | One row per auth user (created automatically on signup)                 |
| `binders`      | A user's collection, with a `layout_style` and an `is_public` flag      |
| `binder_pages` | Ordered pages within a binder; each carries grid dimensions             |
| `binder_slots` | Placements on a page (card / insert / artwork / empty), with spans      |

### Relationships

```
auth.users 1──1 profiles
auth.users 1──* binders 1──* binder_pages 1──* binder_slots
                                                   │
card_sets 1──* cards *──1 illustrators             │ (slot_type = 'card')
                  │  └──────────── referenced by ──┘
              pokemon 1──* cards
```

## Sourcing the catalogue from artofpkm.com

[The Art of Pokémon](https://www.artofpkm.com/pokemon) organizes content by **Cards, Products,
Artwork, Illustrators, Pokémon, and Characters** — which maps directly onto the reference tables
above. It is the intended source for populating `pokemon`, `illustrators`, `card_sets`, and `cards`.

### Ingestion approach (planned)

A standalone server-side script (not part of the shipped app) will populate the catalogue:

1. Collect card/illustrator/set/species records from artofpkm.com.
2. Normalize them into the reference-table shapes (stable `id`s so re-runs upsert cleanly).
3. Compute `dominant_color` per card from its artwork to power colour-theme layouts.
4. Upsert via the Supabase **`service_role`** key, which bypasses RLS (reference tables have no
   client write policies).

> The `service_role` / secret key must live **only** in this script's environment — never in the
> app, never in an `EXPO_PUBLIC_` variable, never committed. The app itself only ever reads the
> catalogue.

Until the pipeline exists, [`supabase/seed.sql`](../supabase/seed.sql) loads a tiny hand-picked
sample so the UI has something to render.

### A note on rights

Card artwork and Pokémon are © Nintendo / Creatures Inc. / GAME FREAK inc. poke-michi is a fan
project for personal collection display. Respect artofpkm.com's terms when ingesting; prefer
caching references/metadata and linking out over rehosting artwork wholesale.
