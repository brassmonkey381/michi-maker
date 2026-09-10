/**
 * THE THEME BUTTON'S QUERY, the same from every door: the browser's own button and the search
 * cheatsheet's "Forest scenes" recipe.
 *
 * IT IS AN ORDINARY SEARCH. The query goes into the search box exactly as if typed, so what the
 * button shows and what typing shows are one thing. What makes it a demonstration is the ROTATION
 * (see data/demoThemes): each press asks for a different picture, because what artwork search can
 * be asked for is the thing a reader cannot guess, and one example never shows it. One of those
 * themes, forest, is on the house for everyone; the rest are metered like anything typed.
 */
import { sendBrowseCommand } from 'tcgscan-browse';

import { nextDemoTheme } from '@/data/demoThemes';
import { FREE_THEME_QUERY } from '@/data/freeTheme';
import { track } from '@/lib/analytics';

export { FREE_THEME_QUERY };

/** Put a theme query in the browser's search box, and say which one it was. */
export function runThemeDemo(surface: string, theme: string): void {
  track('demo.theme_search', { surface, theme });
  sendBrowseCommand({ type: 'search', query: `theme:${theme}` });
}

export { nextDemoTheme };
