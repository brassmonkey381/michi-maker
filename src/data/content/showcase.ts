/**
 * Content module: the layout showcases.
 *
 * Two forty-page binders, one per real page shape, that walk every art layout michi-maker can
 * compose (see `artTemplates`). They exist to answer "what does this app actually do to a page"
 * in the only way that convinces anyone, which is by showing forty of them over real cards —
 * ME: 30th Celebration, M6: Storm Emeralda and ME05: Pitch Black.
 *
 * READ THEM AS OPENINGS, NOT PAGES. Half the layouts are two-page spreads and only make sense
 * with both leaves open, so the binders are laid out in openings: one spread, then a facing pair
 * of single-page layouts, and so on. Every page says in its own description which kind it is and
 * what the art on it is doing. A spread half whose partner is not beside it is not the layout,
 * which is why the ordering is load-bearing rather than tidy.
 *
 * THEY LEAD THE EXAMPLES (module order in ./index) because they are the clearest statement of
 * what the product is for. Every other example binder shows a collection; these show the craft.
 *
 * Regenerate with the scripts in the session scratchpad: draft the pages, then dress them
 * (ids, covers, set stickers). Both are deterministic, so a rebuild that changes nothing
 * produces no diff.
 */
import type { ContentModule, DemoBinder } from '@/data/content/_helpers';
import showcase from '@/data/showcaseBinders.json';

/** Cards resolve from the runtime catalog by id, like every other generated module. */
export const cards: ContentModule['cards'] = [];

export const binders: ContentModule['binders'] = showcase as unknown as DemoBinder[];
