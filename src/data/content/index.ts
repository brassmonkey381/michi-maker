/**
 * Aggregates every content module into flat card + binder lists.
 *
 * Each module under this folder exports `cards` and `binders` (see ./_helpers `ContentModule`).
 * `src/data/sampleData.ts` exposes `CONTENT_BINDERS` as the app's example binders. The module
 * order here is the display order of the example binders on the home screen.
 *
 * Modules: `release` — the upcoming-release prep binders (chase board / set showcase /
 * beautiful bulk, from scripts/build-release-binders.mjs), and `generated` — the catalog-driven
 * example binders (scripts/build-example-binders.mjs). The pre-catalog hand-authored ukiyo-e
 * modules were removed once every binder resolved cards from the runtime catalog.
 */

import type { DemoBinder, DemoCard } from '@/data/binderTypes';

import * as generated from './generated';
import * as release from './release';

// Release binders lead — they're the timely hook (prep binders for the set dropping next week).
const MODULES = [release, generated];

export const CONTENT_CARDS: DemoCard[] = MODULES.flatMap((module) => module.cards);

export const CONTENT_BINDERS: DemoBinder[] = MODULES.flatMap((module) => module.binders);
