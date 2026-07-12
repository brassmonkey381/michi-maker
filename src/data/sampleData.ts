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
 * A few bundled binders carry an author display name (former "Featured" scaffolding — real
 * Featured is now the likes-driven DB ranking; these attributed samples show in Examples with
 * their author line). Keyed by binder id so module order can change freely.
 */
const FEATURED_AUTHORS: Record<string, string> = {
  'gen-grail-wall': 'woahpoke', // The Grail Wall
  'gen-dollar-bin-holos': 'dollarbin.dan', // Dollar-Bin Holos
  'gen-reprints-doppelgangers': 'artvariants', // Same Art, Different Set
};

/** The premade binders: examples + a few author-attributed picks (see above). */
export const SAMPLE_BINDERS: DemoBinder[] = CONTENT_BINDERS.map((binder) =>
  FEATURED_AUTHORS[binder.id]
    ? { ...binder, isFeatured: true, authorName: FEATURED_AUTHORS[binder.id] }
    : binder,
);
