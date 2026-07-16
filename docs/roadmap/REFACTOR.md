# Refactor & simplify — targets and guardrails

## Goal

Reduce file size/complexity hot-spots and retire dead code WITHOUT changing behavior.
This is a "leave the campsite cleaner" doc: safe, high-value cuts a session can take on
independently. Verify every slice at the app surface (no test suite exists — Playwright +
tsc + lint are the net; see `scripts/screenshots.mjs` for the harness pattern).

## Hot spots (line counts at time of writing)

| File | Lines | What to extract |
| --- | --- | --- |
| `src/store/binders.tsx` | ~1,235 | Slot-mutation helpers (place/move/swap/resize share clone-page boilerplate) into a pure module; history/undo machinery into its own file; keep the provider thin. |
| `src/components/binder/BinderGrid.tsx` | ~1,212 | `ArtworkImage` (+ transform px math), drag/resize gesture plumbing, and caption rendering are three separable concerns. |
| `src/components/binder/BinderScreen.tsx` | ~1,182 | The edit-panel (page size chips, visibility, colors) and the add/pick handlers can each move to components/hooks. |
| `src/components/HomeCollection.tsx` | ~1,071 | View-mode subviews (All/By set/Portfolios), the card action modal, and TileStrip carousel are self-contained. |
| `src/components/binder/SliceStudio.tsx` | ~1,044 | Panel/selection state machine vs. rendering vs. gesture code. Coordinate with UI-REDESIGN.md — don't refactor and redesign in separate passes, do studio once. |
| `src/data/placeholderPdf.ts` | ~810 | Fine internally, but consider renaming to `fillSheetPdf.ts` (the feature is "fill sheets" now; keep a re-export if lazy). |

## Known dead / vestigial code

- **`CardPicker` artwork tab is unreachable**: `selectTab('artwork')` redirects to the Slice
  Studio, and nothing else sets `tab === 'artwork'` — so `renderArtwork()`, `placeArt`,
  the URL/upload row inside it, and the `onPickArtwork` prop chain
  (`BinderScreen.handlePickArtwork`) are dead. Verify with a grep for `setTab('artwork')`
  before deleting; the Slice Studio path covers everything it did.
- Pexels/Pixabay: art search moved to the bundled artofpkm library (`src/data/artSearch.ts`).
  Check for leftover `EXPO_PUBLIC_PEXELS_KEY` / `EXPO_PUBLIC_PIXABAY_KEY` reads
  (`isArtSearchConfigured` in CardPicker is part of the dead tab above) and env docs.
- `sheetsFor` era: print layout now derives sheet count from `packTiles`; make sure no
  stale exports linger in `placeholderPdf.ts`.

## Structural niggles worth fixing

- **One pre-existing lint warning** (`CardPicker.tsx:114` exhaustive-deps) — fix it properly
  (the effect wants a reducer) so the lint run is finally clean.
- **`database.ts` is hand-maintained** — regenerate with
  `supabase gen types typescript` against `piikwvntldytjejxmcla` and diff; hand-edits have
  kept up so far but drift is one migration away.
- **Catalog main-thread parse** (~27MB JSON.parse freezes the page for seconds after
  sign-in; long-standing). The open design is: parse in a Web Worker and/or split the
  catalog. This is the highest-value *performance* refactor in the app — treat it as its
  own slice with before/after timing measurements.
- **Verification skill**: the Playwright recipes (sign-in flow, catalog-freeze waits,
  aria-label conventions, guest-flow shortcuts) get rediscovered every session. Distill
  them into `.claude/skills/verify/SKILL.md` so future sessions cold-start faster.
  (Do NOT commit test-account credentials into the repo — the repo may be public; keep
  credentials out and reference "the shared test account" abstractly.)

## Guardrails (things that look refactorable but are load-bearing)

- `store/binders.tsx` mutators build fresh immutable arrays because `commit()` snapshots
  history — don't introduce in-place mutation.
- `addCardsToBinder` batches deliberately (per-card loops hit stale closures and 409s).
- Persist calls (`persist(() => repo.…)`) are fire-and-forget optimistic writes — order
  matters for delete-then-insert sequences (`placeArtPanels`).
- `placeArtPanels` legalizes via `binderPhysics` — any new placement path must keep that.
- Metro config: pdf-lib must resolve to its CJS build; `.claude/` worktrees and `public/`
  asset dirs are blockList'd for real reasons (haste collisions, watcher freeze).
- `metro.config.js`, `tsconfig.json` `exclude: supabase/functions` — Deno code must stay
  out of the app's tsc.
- Session-sticky module-prefs pattern (`doubleSidedPref` etc.) trips the react-hooks
  globals lint if reassigned outside setState updaters — that shape is intentional.

## Suggested slices (each independently shippable)

1. Delete dead CardPicker artwork tab + Pexels/Pixabay remnants (small, pure win).
2. Extract `TileStrip` + collection modal from HomeCollection.
3. Split `binders.tsx` store (pure slot-math module + history module).
4. Regenerate `database.ts`; fix the lint warning.
5. Catalog worker parse (measure first: `status`/`progress` plumbing already exists in
   `useCatalogStatus`).
6. Write the verify skill.
