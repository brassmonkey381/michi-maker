/**
 * WHICH PAGES THE LINK PREVIEW SHOWS, client-side.
 *
 * This is a SECOND implementation of a rule that already exists, and that is worth saying plainly:
 * the original lives in `api/_lib.js` as `choosePreviewPages`, where the Open Graph endpoints run.
 * That file is plain CommonJS on Vercel and this is TypeScript in the app bundle, so they cannot
 * share a module today. `previewPages.test.ts` runs BOTH over the same fixtures and fails when they
 * disagree, which is the only reason a copy is acceptable here. Change one, change the other, and
 * let the test tell you if you got it wrong.
 *
 * The rule itself, unchanged from the server's:
 *   - An explicit selection wins outright. The owner featuring pages in Share is a decision, not a
 *     shortfall, so no cap applies to what they asked for beyond the two the canvas can hold, and
 *     empty pages are dropped because a preview of nothing is worse than a preview of the wrong
 *     page.
 *   - Otherwise the two FULLEST pages, in page order, unless fetching both would cost more card
 *     images than the renderer will pull, in which case just the fullest.
 *
 * What this module adds, and the reason it exists at all: `previewDeepLinkPage`, the page number a
 * shared link should carry so the binder opens where the picture in the unfurled link left off.
 */
import type { DemoBinder, DemoPage } from './binderTypes.ts';

/** Matches PREVIEW_FETCH_CAP in api/_lib.js. The renderer will not pull more card images than this. */
export const PREVIEW_FETCH_CAP = 24;

/** Pockets on a page that would actually draw something. */
function filled(page: DemoPage): number {
  return (page.slots ?? []).filter((s) => s.cardId || s.imageUrl).length;
}

/** The page or pages the link preview draws, in page order. Mirrors api/_lib.js choosePreviewPages. */
export function choosePreviewPages(binder: Pick<DemoBinder, 'pages' | 'sharePageIds'>): DemoPage[] {
  const pages = (binder.pages ?? []).slice();

  const chosen = binder.sharePageIds;
  if (Array.isArray(chosen) && chosen.length) {
    const picked = pages.filter((p) => chosen.includes(p.id) && filled(p) > 0).slice(0, 2);
    if (picked.length) return picked;
  }

  const withArt = pages.filter((p) => filled(p) > 0);
  if (withArt.length <= 1) return withArt;
  const topTwo = withArt.slice().sort((a, b) => filled(b) - filled(a)).slice(0, 2);
  if (filled(topTwo[0]) + filled(topTwo[1]) > PREVIEW_FETCH_CAP) return [topTwo[0]];
  return topTwo.sort((a, b) => pages.indexOf(a) - pages.indexOf(b));
}

/**
 * The `page=` a shared link should carry: the LAST page the preview image shows, one-based.
 *
 * Someone clicks a link because of the picture on it. Landing them at the front of the binder makes
 * them hunt for what they just looked at; landing them on the second half of that spread puts the
 * picture on screen and the rest of the binder behind it. Null when the preview shows nothing
 * identifiable, in which case the link carries no page and opens at the front as before.
 */
export function previewDeepLinkPage(binder: Pick<DemoBinder, 'pages' | 'sharePageIds'>): number | null {
  const shown = choosePreviewPages(binder);
  if (!shown.length) return null;
  const pages = binder.pages ?? [];
  const last = shown[shown.length - 1];
  const at = pages.indexOf(last);
  if (at < 0) return null;
  // Page one is where the binder opens anyway, so a link to it is noise in the URL.
  return at + 1 > 1 ? at + 1 : null;
}
