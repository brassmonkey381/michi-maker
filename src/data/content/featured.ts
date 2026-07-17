/**
 * Content module: the owner's hand-picked REAL binders, exported from their live accounts by
 * `scripts/build-featured-binders.mjs` (see its header for the source ids + re-minted `ex-*`
 * id scheme). These are the "these aren't mockups" binders: they power the landing page's
 * open spread + gallery and sit alongside the generated examples in the app.
 *
 * To refresh after editing a source binder: run the script, commit the JSON. A source binder
 * must be anonymously readable (binder public + owner profile public) for the script to see
 * it; otherwise the committed JSON entry is kept as-is.
 */
import type { ContentModule, DemoBinder } from '@/data/content/_helpers';
import featured from '@/data/featuredBinders.json';

export const cards: ContentModule['cards'] = [];

export const binders: ContentModule['binders'] = featured as unknown as DemoBinder[];
