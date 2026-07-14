# tcgscan-app → michi-maker portfolio handoff

**Audience:** the session/agent working in the `tcgscan-app` (scanner) repo.
**Decision (2026-07-13, user-approved):** the two apps share ONE identity and ONE user-data
backend, and **the tcgscan side feeds michi-maker** — scans land in a shared `user_cards`
table that michi reads. No OAuth link, no export files, no sync jobs.

## The architecture

```
tcgscan-app (scanner)  ──writes──▶  user_cards  ◀──reads──  michi-maker
        │                     (michi app backend:              │
        │                      piikwvntldytjejxmcla)           │
        └──────────── both consume tcgscan-data ───────────────┘
                 (bmhjizcmwtmcrstadqto — catalog/prices/similarity,
                  public-read; NEVER gets user data)
```

- **Canonical user project:** michi-maker's Supabase app backend, ref `piikwvntldytjejxmcla`.
  It already owns the social layer: `profiles` (permanent immutable @usernames), binders,
  likes, upvotes. tcgscan-app should point its Supabase auth client at THIS project
  (URL + publishable key — ask the user for the keys; never a service key in app code).
- **This is NOT a data port.** tcgscan-app keeps ALL of its rich operational data where it
  lives today — raw scan events, capture images, classifier confidences, sessions, telemetry.
  `user_cards` is only the thin CONCLUSION of scanning (card id + condition + quantity): the
  interchange row michi needs, nothing more. One decision is yours to make: if your rich data
  sits in a separate Supabase project behind per-user RLS, switching auth to the shared
  project means your project stops recognising the JWTs — either move just the user-scoped
  tables over, or configure your project to trust the shared project's tokens (third-party
  auth). Device-local / non-user-gated data needs nothing.
- **Same login everywhere:** one email/password/Google account works in both apps. Anonymous
  guest sign-in is enabled (do NOT enable CAPTCHA — it breaks silent guest sign-in).
  michi prompts for the permanent @username on first sign-in; tcgscan doesn't need to.
- **tcgscan-data stays pure catalog.** Public-read, service-role-only writes. No user rows.

## The table (already created + applied)

```sql
user_cards (
  owner_id   uuid  not null references auth.users(id) on delete cascade,
  card_id    text  not null,          -- tcgscan-data catalog id (TCGPlayer product id, e.g. '704871')
  condition  text  not null default '',  -- '' = unspecified; NM/LP/... enum can come later
  quantity   int   not null default 1 check (quantity > 0),
  source     text  not null default 'manual' check (source in ('scan','import','manual')),
  acquired_at timestamptz,
  created_at / updated_at timestamptz,
  primary key (owner_id, card_id, condition)
)
```

RLS: owner-only for select/insert/update/delete (`owner_id = auth.uid()`), `to authenticated`.
Portfolios are **private by default** — a future `is_public` "show off my collection" flag is
the way to open them up, never loosened policies.

### Recommended write pattern for scans

Increment-on-rescan so scanning a stack just works:

```sql
insert into user_cards (owner_id, card_id, source, quantity)
values (auth.uid(), :card_id, 'scan', 1)
on conflict (owner_id, card_id, condition)
do update set quantity = user_cards.quantity + 1;
```

(supabase-js: `.upsert()` can't express `quantity + 1` — either use an RPC for the increment
or read-modify-write; an `increment_user_card` RPC in this project is a welcome addition if
the scanner wants atomic bumps. Batch scans: insert distinct ids in one statement.)

## ⚠️ The card-id contract — confirm BEFORE writing rows

`card_id` must be the **tcgscan-data catalog id** (TCGPlayer product id) — the id space both
apps already render images/prices from. Questions for the tcgscan side to answer:

1. Does the classifier resolve scans to tcgscan-data card ids directly? If it outputs
   anything else (internal ids, set+collector-number), the mapping must live on YOUR side —
   michi assumes `card_id` joins `cards` in tcgscan-data as-is.
2. What happens to unresolved/low-confidence scans? Do NOT write guesses; hold them in a
   scanner-local queue until confirmed.
3. Language/variant handling: if a scan distinguishes JP vs EN or reverse-holo variants that
   map to different catalog ids, use those ids; if the catalog doesn't distinguish, collapse
   to the base id (condition column is for wear, not variants).

## What michi-maker builds on top (deliberately NOT shipped yet)

The user wants the pipe proven before UI ships. Planned order on the michi side:

1. Read-only "My collection" view (appears when `user_cards` has rows).
2. CSV import (universal on-ramp for non-scanner users) writing `source = 'import'`.
3. Page-composer pool restriction ("✨ Fill from my collection") — all 7 michi methods
   already exist and take a candidate pool trivially.
4. "Build a binder from my collection" wizard (cluster inventory → scored page proposals).

Nothing on the tcgscan side blocks on these — once rows land, michi iterates independently.

## Checklist for the tcgscan session

- [x] Confirm the card-id contract (Q1–Q3 above) — see replies below.
- [x] Point tcgscan-app auth at `piikwvntldytjejxmcla`. Done: app-backend `.env` now targets
      this project. Old standalone project `thirerjgjfequwiyonph` had **0 rows / 1 test
      account** → retired, no data migration; the one test login just re-registers here.
- [x] Write scans into `user_cards` with `source = 'scan'` — done via the RPC below, called on
      every portfolio add/remove/edit (not just scans; manual adds feed it too).
- [x] `increment_user_card` RPC added as a migration in this repo
      (`supabase/migrations/20260714120100_increment_user_card.sql`).

## ✅ tcgscan session replies (2026-07-14)

**Card-id contract**
1. **Yes** — the shipping classifiers (`v2-e85` default, `v2-e12`) are trained on the
   **productId corpus**, so a scan match *is* the TCGPlayer product id; it joins `cards` in
   tcgscan-data as-is. The only exception is the legacy `v1` set (path-keyed ids), and
   portfolio-add is already **hidden** when v1 is selected — so nothing non-productId can
   reach `user_cards`.
2. **Never written.** Auto-add only fires on a confident match (top-1 ≥ the 0.8 similarity
   gate); anything below is dropped. No guesses reach the table.
3. Id space is **TCGPlayer EN productIds**. Printing (Normal/Holofoil/Reverse) is tracked as a
   field *within* one productId, not a distinct id, so **variants collapse to the base
   `card_id`** — exactly as intended (condition = wear). JP isn't in this id space → N/A.

**What tcgscan built (Path A — one identity, one backend)**
- tcgscan-app's own private user tables (`saved_cards`, `collections`, `portfolio_entries`)
  were **recreated in this project** via `20260714120000_tcgscan_app_tables.sql` (owner-only
  RLS, in `supabase_realtime`, **no** `set_updated_at` trigger — the client owns `updated_at`
  for its last-write-wins sync). One deliberate schema fix vs. the old project: `id` /
  `collection_id` are **text**, not uuid (the client mints `col-…`/`lot-…` ids).
- `portfolio_entries` is tcgscan's **source of truth**; `user_cards` is a flattened rollup fed
  **additively** (`increment_user_card`, ±delta on add/remove/edit) so it coexists with your
  future CSV import on the shared table without clobbering rows.
- **`source`** is `'scan'` for all tcgscan writes in v1 (the app is the scanner). A precise
  scan-vs-manual split would need a `source` column on `portfolio_entries` — noted as a later
  refinement if you care about the distinction.

**Two things that still need michi-side / dashboard action** (GoTrue config, not SQL/MCP):
- Add tcgscan's redirect URLs to this project's **Auth → URL Configuration**:
  `https://idontgitit.com` (web) and `tcgscanexpo://auth-callback` (native deep link).
- The `increment_user_card` / table migrations were authored here but applying them to the
  live project needs your go-ahead (a production DDL deploy).
