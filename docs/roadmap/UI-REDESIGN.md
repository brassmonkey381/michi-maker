# UI redesign — clean, minimal, a love for the craft

## Goal

Beautify michi-maker with a design language that matches what the product IS: careful,
aesthetic curation of physical objects. **Clean look, beautiful aesthetics, minimalism,
functionality first.** The michi method is a craft — the UI should feel like a well-organized
studio bench, not a dashboard. Includes a UX rework of the Slice Studio, the most
tool-dense screen in the app.

## Design direction (owner's words)

> "emphasize a clean look, highlighting beautiful aesthetics and a love for the craft, and
> functionality with a minimalistic design"

Practical reading: generous whitespace, restrained palette, the card art and binder art ARE
the color — chrome stays neutral. Fewer visible controls; progressive disclosure over
toolbars. Typography does the hierarchy work, not boxes and borders.

## What already exists (don't rebuild)

- **Design tokens**: `src/constants/theme.ts` (`Colors`, `Palette`, `Spacing`, `FontSize`,
  `Radius/Radii`, `Weight`) + `src/constants/ui.ts` (shared chip/button styles). All new
  styling goes through these — extending the token set is in scope, ad-hoc hex values are not.
- **Themed primitives**: `ThemedText` / `ThemedView` with light/dark support.
- **Screenshot + pixel-diff harness**: `scripts/screenshots.mjs` + `scripts/compare.mjs`
  (playwright-core + Edge). Use it to capture BEFORE shots of every screen you touch, then
  diff as you iterate. An earlier design-system experiment (4 themes behind a `?variant=`
  query toggle) lived on a `feat/ui-redesign` branch — the harness survived to main; the
  variant system did not. Feel free to resurrect the variant-toggle *pattern* for A/B'ing
  a new look without breaking main.
- Cross-platform rule: one codebase, three targets. `Platform.OS` branches or `.web.tsx`
  variants where behavior must differ (see `src/components/app-tabs.web.tsx`).

## Surfaces, in priority order

1. **Slice Studio** (`src/components/binder/SliceStudio.tsx`, ~1000 lines). Known UX debt:
   - Four stacked toolbars (source / grid / fit / view+transform / merge-split-save) push the
     canvas below the fold on small screens. Consolidate; consider contextual controls.
   - The CONTROLS guide panel permanently occupies the right column — should be a dismissible
     overlay or first-run hint.
   - Merge/Split are discoverable only via buttons + the guide; selection → merge is the
     core "craft" gesture and deserves affordance (e.g. hovering a legal pair hints the fold).
   - Physics constraints exist and must survive any redesign: Merge only for a sideways pair
     on an inside-edge pocket pair (`pairStarts` prop, `src/data/binderPhysics.ts`); Esc
     clears selection WITHOUT closing the modal (deliberate — see `escapeConsumedAt`).
2. **Binder editor** (`BinderScreen.tsx`): the "Editing tools" card + labeled title fields
   were organized in a previous pass, but the editor still mixes view and edit chrome.
3. **Home** (`index.tsx` + `Home*.tsx` sections): section rhythm is decent; visual polish
   (card shadows, spacing scale, section headers) and a consistent carousel look.
4. **Print fill-sheets modal** (`PrintPlaceholdersSheet.tsx`) and other sheets/modals —
   unify the modal/sheet look (several one-off styles exist).

## Constraints

- Don't regress the editor's drag/resize/multi-select interactions (gesture-handler +
  reanimated; measured-frame drop math in `BinderScreen.handleDropOnPage` is fragile — test
  cross-page drags after layout changes).
- Binder page rendering (`BinderGrid`) is also the PUBLIC binder view — public/share pages
  must stay legible.
- Keep first-paint fast: home deliberately avoids the ~10MB catalog (covers resolve images
  from card ids alone). Don't introduce catalog dependencies into first-paint components.
- Card labels / captions feature (the "Card labels" toggle + field chips) must keep working —
  caption-expanded grid geometry affects drag/resize hit boxes.

## Verification recipe

1. Baseline screenshots of home, binder view, editor (edit mode), Slice Studio, print modal.
2. Iterate; pixel-diff against baseline for screens you did NOT intend to change.
3. Drive the risky interactions with Playwright: place a card, drag it across the spread,
   resize an artwork slot (expect the physics toast on illegal shapes), studio merge → Place.
4. `npx tsc --noEmit` + `npm run lint`; verify `npm run build:web` locally before pushing
   (SSG/prod differences have bitten before — the app must build with `output: "single"`).

## Open questions for the owner

- Light-first or dark-first? (Both are supported; which is the showcase look?)
- Any brand assets (logo, wordmark, accent color) beyond what's in `theme.ts`?
- Is a temporary `?variant=` toggle acceptable for previewing the redesign on production?
