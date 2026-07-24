# Data model

How michi-maker represents the [Michi Method](https://woahpoke.com/michi-method/) and where the
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

## Entities

### Reference data (the catalogue) — external, read-only

The card catalogue (cards, sets, series, illustrators, prices, embeddings) does **not** live in
this app's database. It is served by the shared **tcgscan-data** Supabase project and consumed
read-only through the `tcgscan-browse` kit — see [DATA-SERVER.md](DATA-SERVER.md). Binder slots
reference a card by its catalog id as plain `text` (no FK), so binders save independently of
catalogue completeness.

### User data — Row Level Security protected

| Table          | Purpose                                                                 |
| -------------- | ----------------------------------------------------------------------- |
| `profiles`     | One row per auth user (created automatically on signup); permanent immutable @username, avatar, preferences |
| `binders`      | A user's binder, with a `layout_style` and an `is_public` flag          |
| `binder_pages` | Ordered pages within a binder; each carries grid dimensions             |
| `binder_slots` | Placements on a page (card / insert / artwork / empty), with spans, image fit/transform, and art attribution |
| `user_cards`   | The shared collection — written by tcgscan-app scans and CSV import, read by the Build-a-binder wizard ([TCGSCAN-PORTFOLIO.md](TCGSCAN-PORTFOLIO.md)) |
| `entitlements` | Paid grants (PRO/VIP, per-binder PDF unlocks, cross-app products) — no client writes ([PAYMENTS.md](PAYMENTS.md)) |
| `saved_slices` | Reusable artwork slices from the Slice Studio (soft-deleted)            |
| `print_events` / `binder_pdf_snapshots` | Included-print metering and snapshot-licensed PDF archives |
| `billing_customers` | Stripe customer mapping                                            |

(Plus likes/upvotes, content reports, scan feedback, and the PRO-trial/reclaim machinery —
the migrations in [`supabase/migrations/`](../supabase/migrations) are the authoritative list.)

### Relationships

```
auth.users 1──1 profiles
auth.users 1──* binders 1──* binder_pages 1──* binder_slots
auth.users 1──* user_cards          binder_slots.card_id (text) ─▶ catalog card id
auth.users 1──* entitlements                 (resolved against tcgscan-data)
```

## Sourcing the catalogue

Everything catalog-side — ids, images (245px / 640px / full-size tiers), prices, and the
enrichment fields (`illustrator`, `dex`, `types`, evolution lines) that light up the artist /
single-Pokémon / story layout styles — comes from the **tcgscan-data** pipeline and server.
[DATA-SERVER.md](DATA-SERVER.md) documents the integration seams;
[search-and-enrichment.md](search-and-enrichment.md) documents the enrichment fields. The
earlier TCGdex ingestion script was retired 2026-07-06 (history in
[`scripts/README.md`](../scripts/README.md)) — never resurrect local catalog builds or
scrapers in this repo.

### A note on rights

Card artwork and Pokémon are © Nintendo / Creatures Inc. / GAME FREAK inc. michi-maker is a fan
project for personal collection display. The rights posture for user-placed artwork
(attribution, DMCA agent, takedowns) is tracked in [roadmap/ART-RIGHTS.md](roadmap/ART-RIGHTS.md).
