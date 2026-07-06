/**
 * Content module: catalog-driven example binders.
 *
 * Unlike the hand-authored ukiyo-e modules in this folder, these binders are GENERATED from
 * the browse catalog by `scripts/build-example-binders.mjs` (which applies the approved
 * selectionRules and emits `src/data/generatedBinders.json`). Their card slots reference
 * TCGPlayer catalog ids, so they resolve through the runtime catalog (`resolveCard` →
 * /card-imgs/<id>.jpg) rather than the bundled sample `CARDS` — hence this module declares no
 * `cards` of its own. Every slot is a standard 1×1 card; the script only ever emits ids whose
 * local image exists.
 *
 * To regenerate: `node scripts/build-example-binders.mjs`, then commit the JSON.
 */
import type { ContentModule, DemoBinder } from '@/data/content/_helpers';
import generated from '@/data/generatedBinders.json';

export const cards: ContentModule['cards'] = [];

// The JSON is emitted to the DemoBinder shape but typed only as inferred JSON, so cast it
// (through unknown) to the authored view-model. The generator is the schema's source of truth.
export const binders: ContentModule['binders'] = generated as unknown as DemoBinder[];
