# Supabase backend

The database is the source of truth for michi-maker's data model. This folder holds the SQL
migrations and seed data; the live schema should always match what's here.

```
supabase/
├── migrations/
│   └── 20260707055603_init_user_schema.sql   # tables, enums, triggers, RLS, grants
├── seed.sql                                  # no-op placeholder (nothing to seed)
└── README.md                                 # you are here
```

The live project is **tcgscan-michi-maker** (org "TCGScan", ref `piikwvntldytjejxmcla`).

## What's in the schema

This project holds **only user data** — `profiles`, `binders`, `binder_pages`, `binder_slots`,
owned by a signed-in user and protected by Row Level Security (full details in
[../docs/DATA-MODEL.md](../docs/DATA-MODEL.md)).

Reference/catalogue data (pokemon, illustrators, sets, cards, images, prices, embeddings) is **not**
here — it lives in the shared **tcgscan-data** server and is consumed read-only over HTTP (see
[../docs/DATA-SERVER.md](../docs/DATA-SERVER.md)). Binder slots reference a card by its source id as
plain `text` (no FK), so binders save independently of catalogue completeness.

## How the app persists binders

The auth store (`src/store/auth.tsx`) owns the Supabase session; the binder store
(`src/store/binders.tsx`) loads and saves *user* binders for the current user through
`src/data/binderRepo.ts`. Every table has RLS, so writes are scoped to `auth.uid()` automatically.
The bundled example binders are local to the app and are never written to the database.

**Auth methods:** email + password, a 6-digit email code (OTP), and Google / Apple OAuth, plus an
optional anonymous **guest** mode that can be upgraded to a real account keeping the same user id
(so a guest's binders carry over). See [../docs/AUTH.md](../docs/AUTH.md) for the required dashboard
configuration (enabling providers, redirect URLs, and the anonymous toggle).

## First-time setup

Install the [Supabase CLI](https://supabase.com/docs/guides/local-development) and log in:

```bash
npm install -g supabase   # or: brew install supabase/tap/supabase
supabase login
```

Initialize the local Supabase config (creates `supabase/config.toml`; keep the existing
`migrations/` and `seed.sql`):

```bash
supabase init
```

### Option A — run against the Supabase cloud project

```bash
supabase link --project-ref <your-project-ref>
supabase db push                 # apply migrations to the linked project
```

### Option B — run locally with Docker

```bash
supabase start                   # boots Postgres + the full stack locally
supabase db reset                # applies migrations, then runs seed.sql
```

`supabase start` prints local URL + keys — put them in `.env` as
`EXPO_PUBLIC_SUPABASE_URL` / `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY` to develop fully offline.

## Generating TypeScript types

`src/types/database.ts` is hand-written to match the initial migration. Once your project is
linked, regenerate it from the real schema so the two never drift:

```bash
# from a linked cloud project
npx supabase gen types typescript --linked > src/types/database.ts

# or from the local stack
npx supabase gen types typescript --local > src/types/database.ts
```

## Making schema changes

1. Iterate on the schema with `supabase db query` (CLI) or the SQL editor / MCP `execute_sql` —
   these run SQL without writing migration history, so you can experiment freely.
2. When happy, capture it as a migration:
   ```bash
   supabase migration new <descriptive_name>   # creates a timestamped, empty SQL file
   # …paste/author the SQL…
   supabase db push                            # or: supabase db reset (local)
   ```
   Or, if you changed a linked DB directly, diff it into a migration with
   `supabase db pull <name>`.
3. Run the security/performance advisors and fix anything they flag:
   ```bash
   supabase db advisors            # or the MCP get_advisors tool
   ```
4. Regenerate types (above) and commit the migration + updated `database.ts` together.

## RLS rules of thumb (followed by the initial migration)

- Enable RLS on **every** table in `public`.
- Reference tables: a single `select` policy `to anon, authenticated using (true)`, no write
  policies — only the `service_role` (which bypasses RLS) ingests data.
- User tables: scope writes `to authenticated` with an ownership predicate, e.g.
  `(select auth.uid()) = owner_id`. Child tables (pages, slots) check ownership via `exists`
  against the parent binder.
- UPDATE policies declare **both** `using` and `with check` so a row's owner can't be reassigned.
- Never use `user_metadata` / `raw_user_meta_data` in an authorization decision — it's user-editable.
