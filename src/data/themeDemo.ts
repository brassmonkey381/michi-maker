/**
 * THE THEME SEARCH BUTTON'S QUERY, the same from every door: the cheatsheet's "Forest scenes"
 * recipe and the browser's Theme Search button both run this.
 *
 * It is an ORDINARY search now (owner decision 2026-09-07). Every tier runs any theme query on
 * the server; a free or guest caller sees the top few matches and a true "+N more matches" row,
 * PRO and VIP see them all. This used to fetch the forest results itself and hand the browser a
 * finished list, a second free experience that did not match what typing the same query showed,
 * and the inconsistency was the objection. Forest because it is one of the three largest
 * captioned scenes and the most page-like of them (checked 2026-09-03).
 */
import { sendBrowseCommand } from 'tcgscan-browse';

import { track } from '@/lib/analytics';

export const FREE_THEME_QUERY = 'theme:forest';

/** Put the forest query in the browser's search box, exactly as if it had been typed. */
export function runThemeDemo(surface: string): void {
  track('demo.theme_search', { surface });
  sendBrowseCommand({ type: 'search', query: FREE_THEME_QUERY });
}
