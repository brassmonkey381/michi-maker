/**
 * Aggregates every content module into flat card + binder lists.
 *
 * Each module under this folder exports `cards` and `binders` (see ./_helpers `ContentModule`).
 * `src/data/sampleData.ts` exposes `CONTENT_BINDERS` as the app's example binders. The module
 * order here is the display order of the example binders on the home screen.
 *
 * Modules: `anniversary` — the thirty-page 30th binder, which leads; `showcase` — the two layout
 * showcases; `release` — the upcoming-release
 * prep binders (chase board / set showcase /
 * beautiful bulk, from scripts/build-release-binders.mjs), `featured` — the owner's real
 * binders exported from their live accounts (scripts/build-featured-binders.mjs), and
 * `anniversary` — the two 30th binders, whose pairing pages are the only examples that seat a
 * card beside another print of itself; and `generated` — the catalog-driven example binders
 * (scripts/build-example-binders.mjs). The
 * pre-catalog hand-authored ukiyo-e modules were removed once every binder resolved cards
 * from the runtime catalog.
 */

import type { DemoBinder, DemoCard } from '@/data/binderTypes';

import * as anniversary from './anniversary';
import * as featured from './featured';
import * as generated from './generated';
import * as release from './release';
import * as showcase from './showcase';

// ANNIVERSARY FIRST (owner, 2026-09-11). "Thirty Years, Thirty Pages" is thirty 3x4 pages and
// fifty-nine artwork panels across both anniversary sets, and it makes the case the layout
// showcases used to have to make on their own: this is what the app does to a page, shown on
// cards people want rather than on a grid of layouts. The showcases follow, then the release
// binders (the timely hook: prep binders for the set dropping next week), the owner's real
// featured binders, and the generated examples.
//
// Display order only. It USED to decide the Home illustration as well, because the TCGScan pairing
// card and the curate callout took the first example binder with a card on page 0, and inserting a
// module ahead of `release` silently repainted both with whatever that module's first page held.
// That is pinned now (see HOME_ARTWORK_BINDER_ID), so this list is safe to reorder again.
const MODULES = [anniversary, showcase, release, featured, generated];

export const CONTENT_CARDS: DemoCard[] = MODULES.flatMap((module) => module.cards);

/**
 * RETIRED EXAMPLES, hidden rather than deleted.
 *
 * Deleting is not available to us: every module here is GENERATED, so a binder cut from
 * `releaseBinders.json` comes back the next time anyone runs the builder, and the next person
 * wonders why. A list of ids the aggregator filters is the only removal that survives a rebuild,
 * and it keeps the reason next to the decision.
 *
 * Two grounds for retiring one (owner, 2026-09-11): it has gone stale and is no longer interesting,
 * or a better binder now covers the same set.
 */
const RETIRED = new Set([
  // Two pages and sixteen cards, and the one of the three whose job the story binder actually does
  // better. Its siblings both came back: the chase board is a checklist and Every Last Card is the
  // complete set, neither of which "Thirty Years, Thirty Pages" is trying to be.
  'rel-30th-celebration-showcase',
  // One page, eight cards, for a set that is no longer new. Too thin to earn a slot in a carousel
  // that is meant to show what the app can do.
  'gen-prismatic-rarity-ladder',
]);

export const CONTENT_BINDERS: DemoBinder[] = MODULES.flatMap((module) => module.binders).filter(
  (binder) => !RETIRED.has(binder.id),
);

/**
 * THE BINDER THE HOME ARTWORK DRAWS. The TCGScan pairing card and the curate callout both render a
 * real example page rather than a mockup, and the page they choose is a design decision: a full
 * nine-card chase board reads as a binder, a three-card cover leaf reads as a mistake.
 *
 * It was "the first example binder with a card on page 0", which made a picture on the home page
 * depend on the order of the array above. Adding a content module moved it, nothing failed, and the
 * illustration lost two thirds of its pockets in silence. Naming the binder is the fix.
 *
 * Callers keep their old fallback behind this, so if a rebuild of the release binders ever retires
 * this id the artwork degrades to the previous rule instead of disappearing. `homeArtwork.test.ts`
 * fails when the id stops resolving, which is the signal to pick its replacement deliberately.
 */
export const HOME_ARTWORK_BINDER_ID = 'rel-pitch-black-chase';
