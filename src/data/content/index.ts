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
// ORDER IS LOAD-BEARING BEYOND DISPLAY, which is not obvious and cost a regression. The TCGScan
// pairing card on Home and the curate callout both draw a real page, and they find it with
// `exampleBinders.find(b => b.pages[0]?.slots?.some(s => s.cardId))` (TcgscanPairing.tsx:98,
// CurateCallout.tsx:75). No showcase binder qualifies - those open on art layouts - so the first
// match is the leading RELEASE binder, whose page 0 is a nine-card chase board. Putting a module
// ahead of `release` silently repaints both illustrations with whatever that module's first page
// happens to be. The anniversary module did exactly that: its cover leaf holds three cards, so the
// Home artwork lost two thirds of its pockets and nothing failed. Add new modules AFTER release
// unless you mean to change those two pictures.
const MODULES = [showcase, release, anniversary, featured, generated];

export const CONTENT_CARDS: DemoCard[] = MODULES.flatMap((module) => module.cards);

export const CONTENT_BINDERS: DemoBinder[] = MODULES.flatMap((module) => module.binders);
