/**
 * THE THEMES THE DEMO BUTTON ROTATES THROUGH.
 *
 * The button used to run one fixed query, and pressing it twice gave the same forest twice, which
 * is why people pressed it a third time (owner, 2026-09-10). It now draws a different theme each
 * press, so the button demonstrates the FEATURE rather than one result of it: what artwork search
 * can be asked for is the thing a reader cannot guess, and one example never shows it.
 *
 * WHICH THEMES. Thirty, chosen to be dense enough that every press lands on a full grid rather
 * than a handful, and plain enough to be understood without any of the vocabulary behind them: a
 * reader should look at the query in the box and think "so I could type a word like that". They
 * are ordinary English words about pictures, and nothing here reveals how a card was described.
 *
 * `forest` stays in the list and stays the one theme that is free for everyone (see freeTheme.ts);
 * the other twenty-nine are metered like anything typed, which is the point of the rotation. A
 * reader who presses through a few of them has understood both the feature and its price.
 */
import { FREE_THEME } from './freeTheme.ts';

export const DEMO_THEMES: readonly string[] = [
  FREE_THEME,
  'water',
  'night',
  'snow',
  'city',
  'sky',
  'sunset',
  'flowers',
  'beach',
  'cave',
  'rain',
  'desert',
  'mountain',
  'garden',
  'autumn',
  'stars',
  'storm',
  'underwater',
  'meadow',
  'ruins',
  'lantern',
  'market',
  'library',
  'bridge',
  'waterfall',
  'volcano',
  'fog',
  'crowd',
  'sleeping',
  'shadow',
];

/**
 * The next theme to show, given the one on screen. Never repeats itself twice in a row, which is
 * the whole complaint the rotation answers; `Math.random` rather than a cursor because a cursor
 * would make the second press predictable and the list is walked by a person, not a test.
 */
export function nextDemoTheme(current: string | null): string {
  const pool = DEMO_THEMES.filter((t) => t !== current);
  return pool[Math.floor(Math.random() * pool.length)] ?? DEMO_THEMES[0];
}
