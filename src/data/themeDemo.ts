/**
 * THE THEME SEARCH BUTTON'S QUERY, the same from every door: the cheatsheet's "Forest scenes"
 * recipe and the browser's Theme Search button both run this.
 *
 * It is an ORDINARY search (owner decision 2026-09-07): it goes in the search box exactly as if
 * typed, so what the button shows and what typing shows are one thing. What makes it a
 * demonstration is that the theme is on the house: the `theme-search` function answers it
 * unmetered for every signed-in session, guest included (see data/freeTheme), where any other
 * theme shows a free caller the top few matches and a "+N more matches" row.
 */
import { sendBrowseCommand } from 'tcgscan-browse';

import { FREE_THEME_QUERY } from '@/data/freeTheme';
import { track } from '@/lib/analytics';

export { FREE_THEME_QUERY };

/** Put the forest query in the browser's search box, exactly as if it had been typed. */
export function runThemeDemo(surface: string): void {
  track('demo.theme_search', { surface });
  sendBrowseCommand({ type: 'search', query: FREE_THEME_QUERY });
}
