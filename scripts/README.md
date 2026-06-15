# Scripts

## `ingest.mjs` — catalogue ingestion from TCGdex

Populates the reference tables (`card_sets`, `illustrators`, `cards`) from the
[TCGdex API](https://tcgdex.dev/). It's a standalone Node script (no extra dependencies —
uses Node's built-in `fetch` and the already-installed `@supabase/supabase-js`) and is **not**
part of the shipped app.

### Why TCGdex

It's a documented, MIT-licensed (metadata) Pokémon TCG API with **illustrator** data and a card
image CDN — so we don't scrape, and we don't reverse-engineer an undocumented backend. See
[docs/DATA-MODEL.md](../DATA-MODEL.md) for the full rationale and the image strategy.

### Setup

Add the server-side variables to your gitignored `.env` (see `.env.example`):

```bash
SUPABASE_URL=https://YOUR-ref.supabase.co        # or it falls back to EXPO_PUBLIC_SUPABASE_URL
SUPABASE_SECRET_KEY=sb_secret_xxxxxxxxxxxx        # Settings → API. Server-only, bypasses RLS.
```

> The secret key is safe in `.env` (Expo never ships non-`EXPO_PUBLIC_` vars to the app), but it
> must **never** go in an `EXPO_PUBLIC_` variable.

You must have applied the schema first (see [../supabase/README.md](../supabase/README.md)).

### Usage

```bash
# Specific sets (TCGdex set ids, e.g. swsh3, base1, sv03):
npm run ingest -- swsh3 base1

# Try it with no writes and no credentials needed:
npm run ingest -- swsh3 --dry-run --limit=5

# Mirror images into a public Supabase Storage 'cards' bucket (hybrid model):
npm run ingest -- swsh3 --cache-images

# Everything (large — tens of thousands of cards):
npm run ingest -- --all
```

(`npm run ingest -- <args>` — the `--` passes the args through to the script.)

| Flag             | Effect                                                                |
| ---------------- | --------------------------------------------------------------------- |
| `<setId...>`     | One or more TCGdex set ids to ingest                                  |
| `--all`          | Ingest every set                                                      |
| `--cache-images` | Download images into the Supabase Storage `cards` bucket             |
| `--limit=N`      | Cap cards per set (testing)                                           |
| `--dry-run`      | Fetch + log only; no writes, no credentials required                  |

### What it does

1. `GET /sets/{id}` → upserts a `card_sets` row (name, series, release date, symbol URL).
2. `GET /cards/{id}` for each card → collects illustrators (deduped, upserted before cards so the
   FK resolves) and builds `cards` rows.
3. Images (hybrid): by default `image_url`/`image_small_url` point at the TCGdex CDN
   (`.../high.webp` and `.../low.webp`) and `source_url` keeps the base URL. With `--cache-images`
   it mirrors both qualities into Supabase Storage and points the columns at your bucket instead.

Re-runs are idempotent (upsert by stable `id`). `dominant_color` and `pokemon_id` are left null —
they're later enrichment steps (compute colour with `sharp`/`node-vibrant`; map `dexId` → `pokemon`).
