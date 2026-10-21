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

## The tray: a card in the binder but on no page

Added 2026-10-22 (owner: "a scratch work dock / tray"). A card taken off a page while rearranging,
or displaced from a full page by an Arrange template, waits in the binder's tray and goes back
into any pocket on any page from the Cards side of the editor.

A tray card is **a `binder_slots` row with `page_id` null and `binder_id` set**
(migration 20261022120000). The same row moves between a page and the tray by UPDATE, so it keeps
its id, its `source_entry_id` claim stamp and its `from_collection` flag; a separate tray table
would mean delete-and-insert on every move and a second place for those stamps to go wrong. The
check `binder_slots_page_or_tray` wants exactly one of the two set. `row_index` is 0 and
`col_index` is the position in the tray (only ever appended, never renumbered). The cell rule
`unique (page_id, row_index, col_index)` ignores null page ids, so the tray needs no cell
bookkeeping.

Owner-only by construction: the public-viewing policy reaches a slot through its page, and a tray
row has none. Everything that joins through `binder_pages` (discover, the shelf's face page, the
share image, puzzle sync, page counts) leaves tray rows out. The owner's own load embeds them
through `binder_slots!binder_slots_binder_id_fkey` and falls back to a load without trays on a
database the migration has not reached. Client side: `DemoBinder.tray`, the store's
`moveSlotToTray` / `moveSlotFromTray` / `removeTraySlot`, and `reseat_slots` moves pockets to and
from the tray in the same transaction as the rest of an Arrange. Undo writes the tray when only
the tray changed (`diffSnapshots` is tray-aware). A duplicate copies the tray with its stamps
stripped, like every page; the guest-to-account re-mint keeps them.
