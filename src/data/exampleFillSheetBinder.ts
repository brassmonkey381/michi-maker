/**
 * The sample binder behind the "See a free example (PDF)" button in the print sheet.
 *
 * It is the owner's own first binder (`ex-my-first-binder` in featuredBinders.json, the landing
 * page's hero), re-minted under a stable id so the teaser never collides with the bundled copy: a
 * REAL, MIXED binder with card pages, art panels, and folded 1×2 pieces sitting on each leaf's
 * valid inside-edge fold pair (Eevee and Friends on a left leaf, cols 0–1; Watery Bridge on a
 * right leaf, cols 1–2), so the printed fold pieces are physically insertable. Placeholders and
 * art print as SEPARATE files, and every piece still carries its true page, row and column.
 *
 * `EXAMPLE_FILL_SHEET_OWNED` marks about a third of its cards as owned, so the free example also
 * shows the "colour the cards I own" option doing its job: owned placeholders print in colour,
 * the rest in gray. This replaced a procedural sampler (2026-09-06): showing the format on a
 * binder someone actually built says more than a fixture ever did.
 *
 * View only: resolvable at /binder/example-fill-sheet, never editable or duplicable.
 */
import type { DemoBinder, DemoPage, DemoSlot } from '@/data/binderTypes';
import featured from '@/data/featuredBinders.json';

const SOURCE_ID = 'ex-my-first-binder';
const ID = 'example-fill-sheet';

function remint(binder: DemoBinder): DemoBinder {
  const pages: DemoPage[] = binder.pages.map((p, i) => {
    const pageId = `${ID}_p${i}`;
    const slots: DemoSlot[] = p.slots.map((s) => ({ ...s, id: `${pageId}_r${s.row}c${s.col}` }));
    return { ...p, id: pageId, slots };
  });
  return {
    ...binder,
    id: ID,
    title: 'My First Binder',
    description:
      'The example behind the free print sample: real cards, art panels and a couple of folded pieces, exactly as they print. View only: this reference can’t be edited or copied.',
    isExample: true,
    locked: true,
    pages,
  };
}

const source = (featured as unknown as DemoBinder[]).find((b) => b.id === SOURCE_ID);
if (!source) throw new Error(`exampleFillSheetBinder: ${SOURCE_ID} is missing from featuredBinders.json`);

export const EXAMPLE_FILL_SHEET_BINDER: DemoBinder = remint(source);

/**
 * The cards "owned" in the example: the whole Pikachu Shrine page plus a scatter across the others,
 * so the coloured placeholders read as a collection that is part way there rather than a random
 * sprinkle or a finished set.
 */
export const EXAMPLE_FILL_SHEET_OWNED: ReadonlySet<string> = new Set([
  // Pikachu Shrine, all nine.
  '252737', '214241', '268260', '500263', '478103', '500264', '252738', '542481', '268259',
  // Eevee and Friends.
  '89490', '84216',
  // Watery Bridge.
  '89921', '241690',
  // Animal Reverse Holos.
  '642690', '642764', '642756',
  // Charizard Energy.
  '85454', '253289',
  // Hands!
  '113693', '542661',
  // After Dark.
  '696679', '642167',
  // Forest Friends Napping.
  '200300',
]);
