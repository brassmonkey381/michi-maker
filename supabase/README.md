# Supabase backend

The database is the source of truth for poke-michi's data model. This folder holds the SQL
migrations and seed data; the live schema should always match what's here.

```
supabase/
├── migrations/
│   └── 20260615120000_init_schema.sql   # tables, enums, triggers, RLS, grants
├── seed.sql                             # tiny sample catalogue for local dev
└── README.md                            # you are here
```

## What's in the schema

Two layers (full details in [../docs/DATA-MODEL.md](../docs/DATA-MODEL.md)):

- **Reference data** — `pokemon`, `illustrators`, `card_sets`, `cards`. Global and read-only to
  clients; written only by the ingestion pipeline running as the `service_role`.
- **User data** — `profiles`, `binders`, `binder_pages`, `binder_slots`. Owned by a signed-in
  user and protected by Row Level Security.

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
