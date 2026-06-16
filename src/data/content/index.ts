/**
 * Aggregates every content module into flat card + binder lists.
 *
 * Each module under this folder exports `cards` and `binders` (see ./_helpers `ContentModule`).
 * `src/data/sampleData.ts` merges `CONTENT_CARDS` into the catalogue and exposes
 * `CONTENT_BINDERS` as the app's example binders. The module order here is the display order
 * of the example binders on the home screen.
 */

import type { DemoBinder, DemoCard } from '@/data/binderTypes';

import * as artists from './artists';
import * as classics from './classics';
import * as colors from './colors';
import * as originalsA from './originals-a';
import * as originalsB from './originals-b';
import * as spotlight from './spotlight';

const MODULES = [originalsA, originalsB, classics, artists, colors, spotlight];

export const CONTENT_CARDS: DemoCard[] = MODULES.flatMap((module) => module.cards);

export const CONTENT_BINDERS: DemoBinder[] = MODULES.flatMap((module) => module.binders);
