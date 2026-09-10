/**
 * THE THEMES THE DEMO BUTTON ROTATES THROUGH.
 *
 * The button used to run one fixed query, and pressing it twice gave the same forest twice, which
 * is why people pressed it a third time (owner, 2026-09-10). It now draws a different theme each
 * press, so the button demonstrates the FEATURE rather than one result of it: what artwork search
 * can be asked for is the thing a reader cannot guess, and one example never shows it.
 *
 * WHICH THEMES, AND WHY THESE. Thirty, each one MEASURED against the live data rather than chosen
 * for how good a search term it sounds like. The first cut was hand-picked, and it contained `fog`,
 * which matches a single card: a press that lands on one lonely result demonstrates that artwork
 * search does not work, which is the opposite of what the button is for. Density is a fact about
 * the data, so `node scripts/theme-counts.mjs --list` (or `npm run check:themes`) reads the true
 * total for every word below, straight from the search the app runs. The counts in the comment are
 * from 2026-09-10; re-run it after any tagging pass and drop anything that has thinned out.
 *
 * The floor is roughly forty matches, which is a screen of cards and then some, and the list is
 * spread deliberately across KINDS of word - scenery, weather, light, action, mood, object - so a
 * reader pressing through a few of them learns that the box takes more than a list of places.
 * They stay ordinary English words about pictures, and nothing here reveals how a card was
 * described.
 *
 * `forest` stays in the list and stays the one theme that is free for everyone (see freeTheme.ts);
 * the other twenty-nine are metered like anything typed, which is the point of the rotation. A
 * reader who presses through a few of them has understood both the feature and its price.
 */
import { FREE_THEME } from './freeTheme.ts';

export const DEMO_THEMES: readonly string[] = [
  FREE_THEME, //     217 - and free for everyone, so the first press always lands in full
  'flowers', //      194
  'leaves', //       177
  'flying', //       175
  'cozy', //         152 - a mood, not a place: the press that teaches the box takes both
  'night', //        141
  'clouds', //       136
  'grass', //        131
  'glow', //         122
  'city', //         106
  'mountain', //     105
  'water', //         98
  'sparkle', //       98
  'garden', //        92
  'train', //         87
  'ocean', //         78
  'crowd', //         74
  'swimming', //      73
  'underwater', //    71
  'stars', //         68
  'river', //         62
  'sleeping', //      61
  'lightning', //     60
  'ruins', //         57
  'crystal', //       56
  'cave', //          52
  'snow', //          52
  'climbing', //      50
  'storm', //         49
  'sunset', //        39
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
