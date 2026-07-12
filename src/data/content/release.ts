/**
 * Content module: upcoming-release example binders.
 *
 * The release-day hook — three binders a collector wants PREPPED before opening packs of a
 * new set (chase board / set showcase / beautiful bulk), generated from the live card pool
 * by `scripts/build-release-binders.mjs` (see its header for the archetypes + per-release
 * SET_CONFIG). Slots reference catalog ids; upcoming cards the pipeline hasn't mirrored yet
 * render via the TCGPlayer-CDN fallback in cardThumbUrl and upgrade automatically once
 * mirrored.
 *
 * To regenerate for the next set: update SET_CONFIG, run
 * `node scripts/build-release-binders.mjs`, commit the JSON.
 */
import type { ContentModule, DemoBinder } from '@/data/content/_helpers';
import release from '@/data/releaseBinders.json';

export const cards: ContentModule['cards'] = [];

export const binders: ContentModule['binders'] = release as unknown as DemoBinder[];
