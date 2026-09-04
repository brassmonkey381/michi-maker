/**
 * THE THEME SEARCH DEMONSTRATION, the same from every door: the cheatsheet's "Forest scenes"
 * recipe and the browser's Theme Search button both run this.
 *
 * It does not unlock anything. theme: is VIP; this runs ONE query — theme:forest — against the
 * server search here (the cold search every guest already gets) and hands the browser the
 * finished id list as a showCards command. The browser's own lock on theme: is untouched, so
 * every other theme a free account types is stripped exactly as before. Forest because it is one
 * of the three largest captioned scenes and the most page-like of them (checked 2026-09-03).
 */
import { parseQuery, searchCards, sendBrowseCommand } from 'tcgscan-browse';

import { track } from '@/lib/analytics';

export const FREE_THEME_QUERY = 'theme:forest';
export const FREE_THEME_LABEL = 'Forest scenes · theme:forest';

/** Run the demo and hand the browser its results. Resolves once the command has been sent. */
export async function runThemeDemo(surface: string): Promise<void> {
  track('demo.theme_search', { surface });
  const page = await searchCards(parseQuery(FREE_THEME_QUERY), { limit: 200 });
  if (page.cards.length === 0) {
    // Server search unavailable: the ordinary (gated) path rather than a blank grid.
    sendBrowseCommand({ type: 'search', query: FREE_THEME_QUERY });
    return;
  }
  sendBrowseCommand({ type: 'showCards', ids: page.cards.map((c) => c.id), label: FREE_THEME_LABEL });
}
