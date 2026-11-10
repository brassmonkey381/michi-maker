/**
 * ONE-TAP DEALS FOR THE HAND (MIC-017 editor-hand part 2). The hand's bar deals the free
 * Complete-page fills straight into the hand, no sheet: more of the page's type, more by its
 * artist, the evolution stages its lines are missing. They run on the server's public card
 * queries (the guest-fill path, data/guestFill), so they never load the 27 MB catalogue and never
 * spend a sample. The PRO fills (Same theme, Like the whole page) and the palette stay in the
 * Suggest sheet, where their gates and samples live.
 */
import type { CardLanguage } from 'tcgscan-browse';

import type { DemoPage } from './binderTypes';
import { fetchCompleteCandidates, fetchPageCards } from './guestFill';
import { completePage, type CompleteMethod } from './pageCompleter';
import { catalogFromCards } from './stubCatalog';

export const HAND_QUICK_DEALS: readonly { key: CompleteMethod; label: string; hint: string }[] = [
  { key: 'type', label: 'Type', hint: 'More of the type most of this page is' },
  { key: 'artist', label: 'Artist', hint: 'More by the artist who drew most of this page' },
  { key: 'lines', label: 'Lines', hint: 'The evolution stages this page is missing' },
];

/** The page with extra empty rows, so the completer has `room` pockets to fill (nothing is placed). */
export function roomyPage(page: DemoPage, room: number): DemoPage {
  return { ...page, rows: page.rows + Math.ceil(room / Math.max(1, page.cols)) };
}

/** Up to `room` card ids for the hand from one free fill, none the hand already holds. */
export async function dealToHand(
  method: CompleteMethod,
  page: DemoPage,
  room: number,
  have: ReadonlySet<string>,
  languages?: readonly CardLanguage[],
): Promise<string[]> {
  if (room <= 0 || !page.slots.some((s) => s.cardId)) return [];
  const onPage = await fetchPageCards(page);
  if (!onPage.length) return [];
  const candidates = await fetchCompleteCandidates(method, onPage, languages);
  if (!candidates.length) return [];
  const store = catalogFromCards([...onPage, ...candidates]);
  const placements = await completePage(method, roomyPage(page, room + have.size), store, {});
  const out: string[] = [];
  for (const p of placements) {
    if (out.length >= room) break;
    if (p.cardId && !have.has(p.cardId) && !out.includes(p.cardId)) out.push(p.cardId);
  }
  return out;
}

/** The automatic deal's order: the first fill that finds anything wins. */
export const AUTO_DEAL_ORDER: readonly CompleteMethod[] = ['type', 'artist', 'lines'];
