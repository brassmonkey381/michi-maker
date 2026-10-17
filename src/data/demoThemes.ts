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
 * THE OTHER GAMES ROTATE TOO (owner, 2026-10-16). Each enabled game has its own list, measured
 * the same way against its own themes (`node scripts/theme-counts.mjs --game lorcana --list`),
 * because the words that are dense in Pokémon's art are not the ones dense in a pirate's or a
 * princess's. Twenty each, spread across kinds the same way; counts are from 2026-10-16. The
 * free theme leads every list, since it is free in every enabled game.
 */
export const DEMO_THEMES_BY_GAME: Readonly<Record<string, readonly string[]>> = {
  pokemon: DEMO_THEMES,
  lorcana: [
    FREE_THEME, //   383
    'flowers', //    281
    'clouds', //     630
    'night', //      606
    'flying', //     312
    'mountain', //   317
    'snow', //       248
    'jungle', //     239
    'ocean', //      238
    'castle', //     242
    'cave', //       220
    'stars', //      201
    'ruins', //      189
    'glowing', //    958
    'dreamy', //     799
    'eerie', //      556
    'cozy', //       158
    'festive', //    185
    'floating', //   294
    'grass', //      289
  ],
  onepiece: [
    FREE_THEME, //   160
    'clouds', //    1629
    'fighting', //  1639
    'sword', //      881
    'pirate', //     965
    'laughing', //   466
    'ruins', //      364
    'fire', //       312
    'night', //      311
    'ocean', //      264
    'flowers', //    262
    'snow', //       233
    'lightning', //  228
    'smoke', //      282
    'town', //       248
    'bubbles', //    225
    'city', //       215
    'eerie', //      322
    'flying', //     253
    'festive', //    233
  ],
};

/** The rotation for a game; a game without one of its own gets Pokémon's. */
export function demoThemesFor(game: string): readonly string[] {
  return DEMO_THEMES_BY_GAME[game] ?? DEMO_THEMES;
}

/**
 * The next theme to show, given the one on screen. Never repeats itself twice in a row, which is
 * the whole complaint the rotation answers; `Math.random` rather than a cursor because a cursor
 * would make the second press predictable and the list is walked by a person, not a test.
 */
export function nextDemoTheme(current: string | null, game = 'pokemon'): string {
  const list = demoThemesFor(game);
  const pool = list.filter((t) => t !== current);
  return pool[Math.floor(Math.random() * pool.length)] ?? list[0];
}
