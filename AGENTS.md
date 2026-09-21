# Working in michi-maker

Guidance for AI agents (and humans) contributing to this repo.

## ⚠️ Expo SDK 56 has changed

This project is on **Expo SDK 56** (React Native 0.85, React 19). APIs have changed from
earlier SDKs. **Read the exact versioned docs at https://docs.expo.dev/versions/v56.0.0/
before writing any Expo/React Native code** — do not rely on memory of older Expo versions.

## What this app is

michi-maker lets collectors build **digital "michi binders"** — aesthetically curated Pokémon
card layouts (anchor pages, single-Pokémon pages, color-themed spreads, artist pages, etc.)
for web, iOS, and Android from one codebase. See `README.md` and `docs/DATA-MODEL.md`.

**Card data (catalog, images, prices, similarity) comes from the shared tcgscan-data
Supabase server — read `docs/DATA-SERVER.md` FIRST for the integration points, pending
handoff items, and what must never be resurrected locally.** That server is owned by a
different session/repo; this app is a pure consumer. The browse UI (CatalogBrowser,
CardActionModal, query grammar) lives in the shared **`tcgscan-browse`** package
(`github:brassmonkey381/tcgscan-browse`) — shared browse code changes go THERE (separate
commit/push in that repo, then reinstall here), not in this repo.

**Billing is LIVE** (real cards charged since 2026-07-22). Tiers/entitlements, Stripe
checkout, trials, and the cross-app bundle with tcgscan-app are documented in
`docs/PAYMENTS.md`, `docs/PRO-TRIALS.md`, and `docs/SYNERGY.md` — read the relevant one
before touching anything monetization-adjacent. The `entitlements` table has **no client
write policies**; grants come only from the `payments-webhook` edge function or manual SQL.

## Conventions

- **Routing:** file-based via Expo Router. Routes live in `src/app/`. The `@/` alias maps to `src/`.
- **One codebase, three targets.** Prefer cross-platform APIs. When behaviour must differ, branch
  on `Platform.OS` or use `.web.tsx` / `.ios.tsx` / `.android.tsx` file variants (see
  `src/components/nav/AppRail.web.tsx` for the existing pattern).
- **Styling:** `StyleSheet` + the tokens in `src/constants/theme.ts` (`Colors`, `Spacing`, `Fonts`).
  Use the themed `ThemedText` / `ThemedView` components for light/dark support.
- **Types:** TypeScript strict mode. Entity types come from `src/types/domain.ts`, which derives
  from `src/types/database.ts`. Keep `database.ts` in sync with `supabase/migrations` (regenerate
  with `supabase gen types` once linked).

## Supabase

- The app backend is project **tcgscan-michi-maker** (`piikwvntldytjejxmcla`) — user data only
  (profiles, binders, entitlements, `user_cards`, …), **shared with tcgscan-app** (one account,
  one entitlements ledger). User data never goes into the tcgscan-data project.
- The schema and all Row Level Security live in `supabase/migrations/` — that is the source of truth.
- Server-side logic lives in `supabase/functions/` (edge functions): `stripe-checkout`,
  `payments-webhook`, `auth-handoff` (cross-app SSO), `art-proxy` (CORS image relay for PDFs).
- **Every table has RLS enabled.** Follow the existing patterns: write policies are scoped
  `to authenticated` with an ownership predicate, and UPDATE policies declare both `using` and
  `with check`. See `supabase/README.md`.
- **Never** reference the `service_role` / secret key from app code. Public client uses the
  publishable key via `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY`.
- For any non-trivial Supabase change, verify against the current docs/changelog rather than memory.

### Writing to the shared collection tables — read `tcgscan-app` first

`portfolio_entries`, `collections` and the rest of the tcgscan-owned tables are synced by the
**phone app**, which is a different repo (`../tcgscan-app`). Before writing a single column of
them from here, read its sync code (`src/lib/sync.ts`, `src/lib/sync-merge.ts`) — the merge rules
are not discoverable from this repo, and getting them wrong fails silently rather than loudly.

- **Every write must send `updated_at` itself.** There is deliberately no `set_updated_at` trigger
  on these tables; the client supplies it so the offline-first merge can resolve by it. tcgscan-app
  decides what to install by comparing **that column alone** and never looks at field content, so a
  bare `.update({ some_column })` succeeds in Postgres, looks correct in the SQL editor, and is
  then silently declined by every device — which re-pushes the old value. Send
  `updated_at = max(now, previous + 1ms)`; the max guards a browser clock running behind a phone's.
- **Read the result back.** A PostgREST `PATCH` matching zero rows under RLS returns success with
  no error, so a write against a deleted row, or one the server already unstamped, reports that it
  worked. Use `.select(...).maybeSingle()` and treat an empty return as a failure.
- **Prefer a compare-and-set** (`.eq('column', previousValue)`) so a concurrent edit on another
  device surfaces as a visible failure instead of a silent clobber.
- **Know which columns are birth fields.** `scan_path`, `item_kind` and friends are written once at
  creation and never after (see their migrations). `variant`, `quantity` and `condition` are
  ordinary mutable last-write-wins columns that tcgscan-app edits itself.
- Ids here are **client-minted text** (`lot-…`, `col-…`), not uuid. A new column or FK that assumes
  uuid will reject every row — that is exactly how `binder_slots.source_entry_id` silently ate two
  days of copy-stamps.

`src/data/collectionRepo.ts` → `setEntryVariant` is the worked example of all of the above.

## Native modules change the EAS fingerprint

Adding a native module means a new iOS/Android build — it cannot ship as a JS/OTA push. Several
worthwhile changes are held back by exactly that, and they are collected in
`docs/EAS-NEXT-BUILD.md` so the next native build can pick them up together instead of each one
burning its own. **If you are about to add a native dependency, read that file first** — and if you
are deferring one, add it there rather than leaving it in a commit message.

## Updating What's New

`/whats-new` is one array in `src/data/changelog.ts`. The procedure (what to include, dating entries
from git, the sister-app switch) is `docs/WHATS-NEW.md`; the writing rules are that file's header.

## Before you finish

- Type-check: `npx tsc --noEmit`
- Lint: `npm run lint`
- **Shared-kit integrity: `npm run check:kit`** — and `npm run check:kit -- --bundle dist` (or
  `--bundle https://michi-maker.com`) whenever a `tcgscan-browse` pin moves. On 2026-09-17 the site
  went white for everyone because the kit was re-pinned by editing the lockfile's sha: the entry
  kept the old `version`/`integrity`, npm installed the PREVIOUS package from cache, and
  `src/lib/catalogConfig.ts` called a function that did not exist — at import time, on every route.
  `tsc` and `npm test` both passed, because they ran against a hand-copied `node_modules`; neither
  sees what a build installs. **Re-pin only with `npm install "github:brassmonkey381/tcgscan-browse#<sha>"`,
  never by editing package.json/package-lock.json by hand**, and guard any new kit call that runs at
  import time (`typeof f === 'function'`) so a mismatch costs a feature, not the site. `deploy-web.ps1`
  now runs this check before deploying and against the live bundle after.
- Unit tests: `npm test` (`node --test` over `src/**/*.test.ts` — pure data logic: tiers,
  proration, print windows). UI changes are verified at the surface — see
  `scripts/screenshots.mjs` for the Playwright harness pattern.
