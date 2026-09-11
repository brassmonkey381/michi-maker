# Protecting the data the paid tiers are sold on

Proposal, 2026-09-10. From a 19-agent audit over all five repos (tcgscan-data, tcgscan-data-science,
tcgscan-browse, tcgscan-app, michi-maker), three competing designs, three independent judgements,
four adversarial consumer verifiers and a final critic, plus live read-only probes against the
production data project. Every number below was measured, not inferred. Nothing was changed.

**Status: nothing has been executed. This is a proposal awaiting Brian's decision.**

---

## 1. The answer in five sentences

Anyone holding the publishable key that ships in our own web bundle can download the artwork tagging
corpus (3,272 captioned cards) in four requests, which is the whole of theme search, permanently and
offline. That corpus is the only one of the three "proprietary" data sets worth protecting, because
the embeddings and the colour vectors are already public files in Storage that two shipped products
fetch with no key at all. The fix is a grant boundary, not an architecture: flip the `public.cards`
view to definer semantics, replace its blanket `grant select` with a column grant, and respec two
functions as `SECURITY DEFINER` so they can still read what their callers no longer can. We are
deliberately not moving any column, not building a second Supabase project and not gating the model
bundles, because each buys either nothing or a silent failure. Two days, not six, and two things
that are not database work at all come first.

**The most urgent item is not in the database.** The single line keeping the tagging corpus out of a
publicly downloadable daily bundle exists only in an uncommitted working-tree file that an
unattended job reads every day. Commit that before anything else.

---

## 2. What was measured

### The corpus is smaller than first reported, and the first number was wrong

| Query (anon, publishable key) | Rows |
| --- | --- |
| `cards_en?scene_caption=neq.` (captions that exist) | **3,272** |
| `cards_en?art_text=neq.` (the concatenated caption + tags) | **1,476** |
| `cards_en?scene_tags=not.is.null` | 28,533 |
| `cards_en?scene_caption=not.is.null` | 58,686 |

The last two are the trap, and an earlier version of this document reported 28,533 as the exposure.
`scene_caption` defaults to `''` and `scene_tags` to `'{}'`, not to NULL, so `not.is.null` matches
every row in the table and measures nothing. The real corpus is **3,272 captioned cards**. At the
1000-row page cap that is four requests. The exposure is no less total for being smaller; it is just
cheaper to take than we thought.

### Two of the three data sets are already public files, verified by bare GET with no key

| URL | Status | Size |
| --- | --- | --- |
| `…/object/public/models/data/v3-e95/embeddings.json` | 200 | **34,035,953 bytes**, 24,720 vectors, dim 64 |
| `…/object/public/models/data/v3-e95/catalog.json` | 200 | **8,515,407 bytes** |
| `…/object/public/models/data/v3-e95/alternates.json` | 200 | 608,876 bytes |
| `…/object/public/browse/color/card_colors.bin` | 200 | 657,960 bytes, 27,415 cards |
| `…/object/public/models/classifiers/v3-e95/*_float16.tflite` | 200 | the trained model itself |

Six model versions are listed in that bucket. The phone app fetches `embeddings.json` bare at
`tcgscan-app/src/lib/native-scanner.ts:218`; it IS the offline scanner's anchor index. The kit
fetches the colour blob bare at `tcgscan-browse/src/color.ts:144-146`.

The mechanism is not the `storage.objects` policy everyone cited. It is
`20260706_02_init_storage_buckets.sql:4-10`, which inserts the buckets with `public = true`. A public
bucket serves `/object/public/...` with no auth and bypasses object RLS entirely, so revoking that
policy would be a no-op.

**So revoking `cards.embedding` or `cards.color_art` from anon confers zero confidentiality.** It
hides a convenience copy of a file anyone can download. This is a deliberate reversal of the fix
originally proposed to the data session.

### The exposure is three RLS policies and the absence of any column grant

There is no column-level GRANT or REVOKE anywhere in tcgscan-data's 50 migrations. `cards_en`,
`cards_jp` and `card_embeddings_candidate` each carry an unconditional `using (true)` select policy
(`01:125`, `22:114-115`, `35:72-73`), and anon holds table-level SELECT through Supabase defaults.

### The function boundary already exists

Of roughly 30 callable functions, exactly one returns a raw proprietary value: `tagged_cards`, and it
is already revoked from anon/authenticated and granted to service_role alone (`44:69-71`).
`search_cards` returns 21 columns with nothing proprietary in them. **Verified live** as anon:
`id, name, number, rarity, card_type, set_id, set_name, series, release_date, illustrator, types,
stage, hp, evolution_stage_index, evolves_from, evolution_line, jumbo, language, cur, score,
total_count`. So "make functions the only door" describes the doors that already exist.

### Other relations open to anon, none of which anyone had questioned

| Relation | Rows | What it is |
| --- | --- | --- |
| `prices` | (count times out) daily closes back to at least 2026-04-20 | **the only asset nobody can regenerate** |
| `alternates` | 3,669 | the recognition confusability map, with `reason`, `difficulty`, `hint` |
| `dataset_versions` | 7 | including `dedup_params`, the dedup recipe |
| `model_versions` | 4 | `bundle_url`, `backbone`, `epoch`, `embedding_dim` |

`docs/DATA-SERVER.md` explicitly said "Leave alone: `prices`". That instruction deserves revisiting;
see section 6.

### Settled negatives, so nobody re-checks them

- **`graphql_public` is not a second door.** `POST /graphql/v1` answers 200 but with
  `{"errors":[{"message":"pg_graphql extension is not enabled."}]}`. The schema is exposed, the
  extension is off.
- `free_theme_depth` is **3**, read live from `search_config`.
- `search_cards` has **never** returned `full_art_kind`, so the kit's `rowToCard.fullArtKind` is
  permanently `''` on the cold path. Pre-existing, unrelated to any fix, and it means the client
  contract in `DATA-SERVER.md` overstated the requirement.

---

## 3. The two findings that outrank the original question

### 3.1 The caption gate is not committed to git

`SHIP_CAPTIONS_IN_BUNDLE = False` appears **3 times in the working tree** of
`tcgscan-data/pipeline/tcgscan/publish/to_supabase.py` and **0 times at HEAD**. Verified with
`git show HEAD:...`.

`tcgscan-data/orchestration/scripts/run_daily.ps1` is uncommitted too, and it runs
`to_supabase --catalog --browse` daily and unattended. So a `git checkout` of one file, a `git stash`,
a clean clone on a new machine, or any agent that reverts it puts the captions back into the bundle,
and within 24 hours the corpus is a permanent offline unmetered download for every registered user of
both apps. The client half is already shipped: `tcgscan-browse/src/catalog.ts:362-363` parses
`scene_caption`/`scene_tags` out of the bundle and `src/query.ts:396-406` answers `theme:` against
them on-device, free and unclamped, in `dist`.

One comment in the codebase is flatly wrong about this. `to_supabase.py:1429` says flipping the gate
back "is just a republish; nothing about it is one-way." It is one-way for anyone who fetched during
the window, because `tcgscan-app/src/lib/catalogSource.ts:156` writes the decrypted plaintext catalog
to the device with a 24-hour TTL.

**Fix, ten minutes:** commit the file; turn the constant into an env var the unattended lane does not
set; add a publish-time assertion. This outranks every grant in this document.

Working-tree state across the five repos, measured: **tcgscan-data 63 dirty files, tcgscan-app 33,
tcgscan-data-science 6, tcgscan-browse 4, michi-maker clean.** Three of those four dirty repos are
dirty in load-bearing files: the publisher and the daily lane, the theme grammar (`src/query.ts`),
and the public bundle publisher.

### 3.2 The 50 migrations are not the schema

Two migrations that were applied to the data project live in a different repo, at
`tcgscan-data-science/pipeline/work/20260824_39_scan_flows.sql` and `20260824_40_scan_flows_batching.sql`.
Both files exist; both are numbered 39 and 40, **colliding with tcgscan-data's own 39 and 40**. They
create a table, three functions and a policy that appear nowhere in tcgscan-data's migrations, and
`tcgscan-app/src/lib/scan-flow.ts:86` calls `get_scan_flows` on the data project in production. The
migration ledger they should be recorded in is inserted by hand from printed instructions.

So every statement of the form "I grepped all 50 migrations, therefore only these functions touch
these columns" rests on a file set that does not describe production. **Before any grant work, dump
`pg_proc` (prosrc, prosecdef, proacl) and `information_schema.column_privileges` from the live
database and derive the blast radius and every column list from that.** Two hours, and it is the
precondition for the rest.

---

## 4. The mechanism, and the trap in the obvious version

### 4.1 A column revoke against a table-level grant does nothing

`20260906_41:106` issues `grant select on public.cards to anon, authenticated`. A relation-level
SELECT covers every column, and a later column-level REVOKE does not chip away at it. The correct
form is to revoke the relation grant and re-grant the allowed columns by name. Every early version of
this fix, including the one already sent to the data session, would have appeared to succeed and
protected nothing.

### 4.2 The view must become definer, or the fix blanks browse for everyone

`public.cards` is `security_invoker = true` (`41:75`), so a read through it checks the caller's
privilege on every column the **view body** references, not only those the query selected. Carve
columns out of the base table and the view breaks for all remaining columns, and the kit's three
direct reads (`src/search.ts:291`, `:325`, `:445`) each return `[]` silently. `alter view public.cards
set (security_invoker = false)` is the line that makes the boundary safe, and no design contained it.

Its cost, for the migration comment: RLS on `cards_en`/`cards_jp` stops applying to reads through the
view. A no-op today (both policies are `using (true)`) but a future row-hiding policy will silently
not apply.

### 4.3 ALTER FUNCTION expires within days

The plan's original mechanism was `alter function ... security definer`, praised because "not a
character of the body is retyped." That property is exactly what makes it expire. `search_cards` is
re-specced with a bare `create or replace function` in **7 of the 50 migrations**, and only one of
those files contains the string `security definer` anywhere. Postgres assigns all unspecified
properties on replace, so the next respec silently reverts the function to invoker, and a reverted
invoker `search_cards` is `42501` for anon on `select c.*`, which every kit read turns into an empty
grid.

**So: carry the security clause in a full `create or replace function`, and add a machine assertion on
`pg_proc.prosecdef` and `proconfig` to the detector.** A fix that expires on the next unrelated
migration is not a fix.

---

## 5. What I recommend, in order

**Day 1, entirely outside the database.**

1. Commit the three dirty load-bearing repos. Turn `SHIP_CAPTIONS_IN_BUNDLE` into an env var the
   unattended lane does not set, with a publish-time assertion (section 3.1).
2. `revoke execute ... from public` plus `grant execute ... to service_role` on the eight to ten
   writer functions that revoke from `anon, authenticated` but never from `PUBLIC`, so anon still
   holds EXECUTE by default. They include `set_scanner_rollout`, whose own comment says it "decides
   what scans for everyone", and the two orphans in `pipeline/work/`. This is integrity, not
   confidentiality, and it is the most serious thing in the pile after 3.1.
3. Make **both** `SchemaNotReady` raises in `push_colors.py` fatal. Today `colors_new.py:46-49`
   catches it, prints "DB push skipped" and exits 0, so the daily lane logs success twice a day while
   colour stops being published forever. Every verification of everything else is worth less while
   that is true.
4. `drop function public.find_similar_by_color`. Measured at roughly 3.2 seconds and returning
   HTTP 500 / 57014 on every call: an anonymous, unmetered, un-rate-limited multi-second query that
   is already broken for users and only costs money. Migration 33 contains seven functions and zero
   `rl_check` calls. Do not try to rate-limit it: all seven are `language sql`, so `perform` will not
   parse, and adding a leading statement disables inlining on the family that is already timing out.
5. Fix the exposure detector's three blind spots (section 7).

**Day 2, the reconciliation.** Dump the live `pg_proc` and column privileges (section 3.2). File the
two orphan migrations into tcgscan-data. Establish a psql connection over the session pooler so
statements can be grouped in a transaction and reverted, replacing the clipboard-to-dashboard apply
path. Port `michi-maker/supabase/tests/grants_audit.sql` to the data project.

**Then, and only then, the grant boundary.** One transaction: `alter view public.cards set
(security_invoker = false)`; revoke the relation grant and re-grant the 47 allowed columns by name
(the view's 50 minus `scene_caption`, `scene_tags`, `art_text`); revoke and column-grant the base
tables; full `create or replace function` for `search_cards` and `search_facets` carrying
`security definer set search_path = public, extensions, pg_temp`; `notify pgrst, 'reload schema'`.
Rehearse it first as a rolled-back transaction under `set local role anon`, with **savepoints or DO
blocks around each negative assertion**, because the first expected `42501` otherwise aborts the
transaction and every later assertion returns `25P02` instead of its real answer. Include a privileged
arm in the rehearsal: the failure that costs money is the meter inverting, and it is silent.

**Decide `prices` in the same sitting.** It is the one dataset here nobody can regenerate.

---

## 6. What we are not doing, and why

**No duplicate database, and no dev/prod split for this.** Three reasons. The setting that decides
half the exposure surface (the exposed-schema list) has no repo representation at all, so a clone
would answer the question you cloned it to answer with a green light. What this change needs verified
is grants, row shapes and function resolution, and `set local role anon` inside a rolled-back
transaction tests all three against real grants and real data, where a 2,000-row clone tests them
against a fiction. And the honest sizing is 58,686 cards across two arms, six model bundles, a 34 MB
artifact and price history, only as true as the day it was cloned.

What to spend instead: **$0 for the psql connection**, which is the highest-value item in this
document independent of the moat, and **$0 to $10 per month later** for a schema-only scratch project
the first time a migration has to touch a view body, or to prove the 50 migrations apply from zero,
which nobody has ever done. Neither catches query plans at 58,686 rows, pgvector recall, or the phone
app's 24-hour plaintext catalog cache, which shows green on any smoke test for a full day after a
genuine break.

**No schema move.** `art_text` is a STORED GENERATED column and cannot be moved; it would become a
trigger. Removing a column from `public.cards` is a DROP and CREATE of a 50-column union view applied
by hand into a dashboard editor. Five data-science read paths self-select their work through PostgREST
and none sets an `Accept-Profile` header anywhere, so they cannot reach a non-exposed schema and would
all have to become RPCs. Two to three weeks whose worst outcome is invisible.

**No bundle gating now.** It would take an entitlement ticket minted on the app project, a verifier on
the data project, private buckets, a version-keyed disk cache and a phone release: five to six weeks.
And "member" would mean "any free account", so the barrier reduces to one sign-up, while the
`.tflite` stays dumpable from app memory by anyone who can run the app. Two parts of that work pay for
themselves with no security argument (a disk cache, and repacking `embeddings.json` from 34 MB of JSON
to roughly 3.2 MB of packed float16) and are worth doing on product grounds alone.

**Not closing the facet oracle, for now.** After the grant boundary the caption prose is unreadable,
but `total_count` is computed before the LIMIT and `search_facets` returns exact unclamped counts, so
an anonymous caller can partition metered results into buckets of three and reconstruct which cards
carry which tag. One judge demonstrated 46 of 52 pairs for a theme in 35 calls. The cheap half is
free: the kit discards the facet count `n` entirely (`tcgscan-browse/src/search.ts:374-379` pushes
only `r.value`), so returning `n: 0` for unprivileged themed queries costs nothing and keeps the
chips. The other half, bucketizing `total_count`, breaks the kit: `search.ts:250` is
`Number(rows[0].total_count) || cards.length`, so a bucketized 0 is falsy and the meter and the entire
upsell disappear for any theme under the bucket. Take the free half, leave the rest.

---

## 7. The detector is not trustworthy yet

`michi-maker/scripts/check-data-exposure.mjs` needs four fixes before it can gate anything.

1. **It cannot tell "closed" from "broken."** `readable()` returns false on every non-2xx, so a 429
   from the rate limiter, a 500 from a statement timeout, or a total outage all read as "protected"
   across every probe. Assert the status code, and report 200-with-zero-rows as **inconclusive**, not
   as pass.
2. **Add a positive control.** All 18 `CARD_COLS` columns must come back 200 with a row, or the run is
   void. Without it a total outage scores perfectly.
3. **Split `GUARDED`** into `CLOSED` and `PUBLIC_BY_DECISION`, with section 2's reasoning inline.
   `embedding`, `color_art` and `full_art_score` are deliberately staying readable, so "exits 0" is
   unsatisfiable as the list stands, and the tempting fix (delete them) would delete the record of the
   decision. Add `cards_jp` and `model_versions` to `RELATIONS`, and `color_noborder` and
   `color_neighbors_noborder` to the closed list.
4. **Assert the meter and the gate.** That `rpc/search_cards` with the publishable key returns exactly
   `free_theme_depth` rows for a theme with more matches and that `total_count` exceeds it; that
   `pg_proc.prosecdef` is true for `search_cards` and `search_facets`; and that the publisher still
   sets `SHIP_CAPTIONS_IN_BUNDLE` false.

And put it in the right repo. What reopens these columns is `grant select on public.cards to anon`
inside the next view respec, following the pattern the repo itself documents at `41:106`, and that
lands in tcgscan-data, which a michi-maker hook never sees.

---

## 8. Loose ends worth a line each

- **`search_facets` and `search_cards` disagree about what a theme is.** Facets still matches
  `art_text like '%w%'` (`39:320`) while search_cards uses a word-start regex (`49:135-137`), so chip
  counts and result counts differ today and a "+38 more" upsell can read as a bug. Align them in a
  separate migration from the definer flip, not the same one.
- **Migration 46 is staged and unapplied** (`46:3`) and nothing would have said so. Live
  `tagged_cards` is migration 44's shape.
- **`color_neighbors_art` / `color_neighbors_noborder` are write-only dead columns**; their only
  reader was dropped at `33:265-267` and they are not in the view. Drop them.
- **The model bundle republishes a catalog spine publicly**: `catalog.json` (8,515,407 bytes) and
  `alternates.json` into the public models bucket. A second public copy of most of what retiring
  `browse/catalog.json` was meant to protect. Stop publishing those two there.
- **`config.toml` is ten lines** with no `[api] schemas` and no `[db] major_version`, so the Postgres
  version that decides whether generation expressions can be altered is recorded nowhere. Write both
  down even though the CLI does not apply them here.
- **A private-bucket pattern already exists and shipped**: `browse-private` was created with
  `public = false` at `20260711_18:6-7` and `catalog-key/index.ts:55-60` mints signed URLs from it.
  Any future gating should start there rather than from scratch.
- **`catalog-key/index.ts:13` hardcodes the APP project's publishable key inside the DATA project's
  repo**, so rotating the app key silently kills offline catalog for every user, in a repo nobody
  would think to look in.
- **The catalog key is rotated per publish** (`20260711_18:11`) and the lane republishes daily, so a
  leaked catalog key self-expires in about 24 hours. That is a real existing defence; write it down
  before someone replaces it with something weaker.
- **Nobody has checked whether this has already happened.** No step reviews the data project's
  PostgREST logs for a caller that pulled `scene_caption` in bulk. Supabase log retention is short,
  so that check has a deadline.

---

## 9. The uncomfortable part

**Theme search is not what anyone is paying for.** `docs/PAYMENTS.md` sells PRO on print and higher
limits and VIP on unlimited plus priority. Theme search appears nowhere in the tier table, the Stripe
lookup keys, or the product descriptions (grep for "theme" in that file returns nothing). In
tcgscan-app it is locked for every tier including VIP, by owner decision. So the corpus this work
protects gates one unadvertised perk in one of two apps.

Meanwhile the daily price series, the only dataset here that cannot be regenerated from public images
and a GPU, is anon-readable by explicit instruction, and the line keeping the corpus out of a public
daily bundle is uncommitted.

This plan buys cost asymmetry and time, not secrecy. A competitor with a vision model and our public
card images reproduces a usable approximation of the tagging for a few hundred dollars of inference.
What is actually durable was never in either database and was never at risk: the blind tagging
protocol, michi's theme vocabulary in `src/data/storyThemes.ts`, the evaluation corpus, and the
binder-upload flywheel.

Which is the argument against walking through the big door. This is not an architecture problem. It is
a bookkeeping problem wearing an architecture problem's clothes: an uncommitted gate, two migrations
filed in the wrong repo, a hand-typed migration ledger, a clipboard apply path with no transaction,
and a detector that reports success when the server is down. Two days of that is worth more than
three weeks of schema work.

---

## 10. Decisions needed from Brian

1. **Commit the dirty repos and gate the caption constant?** Recommend yes, today, before anything
   else. Ten minutes.
2. **The eight to ten anon-executable writer functions?** Recommend yes, today. One hour.
3. **psql connection before any grant work?** Recommend yes. Half a day, and it is the highest-value
   item here regardless of what is decided about the moat.
4. **The grant boundary itself?** Recommend yes, after days 1 and 2, as one transaction with a
   rehearsed rollback. Roughly two days including the reconciliation.
5. **Duplicate database / dev-prod split?** Recommend no for this. Revisit as a $0 to $10 per month
   scratch project when a migration has to touch a view body.
6. **`prices`?** Recommend a decision in the same sitting as the grant boundary. It is the only asset
   a competitor cannot reproduce, and it is the one table the handoff doc said to leave alone.
7. **Check the logs for a prior bulk pull?** Recommend yes, and soon, because retention is short.
