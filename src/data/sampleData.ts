/**
 * Catalog-only content surface.
 *
 * Historically this module shipped a bundled 70-card catalogue (TCGdex art) plus the
 * hand-authored example binders. Both are gone: every card now resolves from the runtime
 * browse catalog (see `src/lib/catalog.ts` + `src/data/cardResolver.ts`), and the example
 * binders come from the catalog-driven `generated` content module.
 *
 * The exports are kept so importers don't break — they now simply reflect catalog-only
 * content: `CARDS` / `CARDS_BY_ID` are whatever cards the content modules declare (currently
 * none — the generated binders reference catalog ids, not bundled cards), and
 * `SAMPLE_BINDERS` are the generated example binders.
 */

import { type DemoBinder, type DemoCard } from '@/data/binderTypes';
import { CONTENT_BINDERS, CONTENT_CARDS } from '@/data/content';

/**
 * The bundled card catalogue: now just whatever cards the content modules declare, de-duped
 * by id. The catalog-driven content declares no bundled cards, so this is empty in practice —
 * cards resolve from the runtime catalog instead.
 */
export const CARDS: DemoCard[] = (() => {
  const seen = new Set<string>();
  const out: DemoCard[] = [];
  for (const card of CONTENT_CARDS) {
    if (seen.has(card.id)) continue;
    seen.add(card.id);
    out.push(card);
  }
  return out;
})();

export const CARDS_BY_ID: Record<string, DemoCard> = Object.fromEntries(
  CARDS.map((card) => [card.id, card]),
);

/**
 * A few bundled binders are surfaced as community "Featured" picks — same read-only binders, but
 * attributed to an author display name and shown in the Featured carousel instead of Examples.
 * Scaffolding until real user-featured binders land (swap this for a fetched list + a profile
 * join then). Keyed by index into CONTENT_BINDERS; featured binders drop out of the Examples
 * section — see the store's `featuredBinders` / `exampleBinders` getters.
 */
const FEATURED_AUTHORS: Record<number, string> = {
  3: 'woahpoke', // The Grail Wall
  4: 'dollarbin.dan', // Dollar-Bin Holos
  5: 'artvariants', // Same Art, Different Set
};

/** The premade binders: examples + a few author-attributed Featured picks (see above). */
export const SAMPLE_BINDERS: DemoBinder[] = CONTENT_BINDERS.map((binder, i) =>
  FEATURED_AUTHORS[i] ? { ...binder, isFeatured: true, authorName: FEATURED_AUTHORS[i] } : binder,
);
