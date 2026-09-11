/**
 * Aggregates every content module into flat card + binder lists.
 *
 * Each module under this folder exports `cards` and `binders` (see ./_helpers `ContentModule`).
 * `src/data/sampleData.ts` exposes `CONTENT_BINDERS` as the app's example binders. The module
 * order here is the display order of the example binders on the home screen.
 *
 * Modules: `showcase` — the two layout showcases, which lead; `release` — the upcoming-release
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

// SHOWCASE FIRST. The two layout showcases are the clearest statement of what the app does to a
// page, and the examples section is where someone goes to find that out; every other binder here
// shows a collection, these show the craft. Then the release binders (the timely hook: prep
// binders for the set dropping next week), the anniversary pair, the owner's real featured
// binders, and the generated examples.
//
// Display order only. It USED to decide the Home illustration as well, because the TCGScan pairing
// card and the curate callout took the first example binder with a card on page 0, and inserting a
// module ahead of `release` silently repainted both with whatever that module's first page held.
// That is pinned now (see HOME_ARTWORK_BINDER_ID), so this list is safe to reorder again.
const MODULES = [showcase, release, anniversary, featured, generated];

export const CONTENT_CARDS: DemoCard[] = MODULES.flatMap((module) => module.cards);

export const CONTENT_BINDERS: DemoBinder[] = MODULES.flatMap((module) => module.binders);

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
