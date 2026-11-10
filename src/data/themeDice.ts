/**
 * THE THEME DICE (MIC-017, owner 2026-11-09): "Theme 🎲 shoots out random theme searches, including
 * complex multi-theme queries (e.g. theme:water -theme:sky)". It replaced the rotating "Theme: ruins"
 * button, which read like the name of the current search.
 *
 * A roll is a query in the search grammar, so the field shows it and people learn the grammar from
 * the dice. Shapes, by weight: one theme (4 in 10), two themes that must both show (3), one theme
 * minus another (2), one theme in quotes, exact with no similar words (1). Words come from the
 * game's measured demo list (data/demoThemes), so every word alone has matches; a combination can
 * still find nothing, which the caller checks and rolls again.
 */
import { demoThemesFor } from './demoThemes.ts';

export type DiceKind = 'single' | 'pair' | 'minus' | 'exact';

export interface DiceRoll {
  query: string;
  kind: DiceKind;
}

/** One roll. `rand` returns [0, 1) (Math.random in the app, a seeded one in tests). */
export function rollThemeQuery(rand: () => number, game = 'pokemon'): DiceRoll {
  const words = demoThemesFor(game);
  const pick = (avoid?: string) => {
    for (let i = 0; i < 8; i++) {
      const w = words[Math.floor(rand() * words.length)];
      if (w !== avoid) return w;
    }
    return words.find((w) => w !== avoid) ?? words[0];
  };
  const r = rand();
  const a = pick();
  if (r < 0.4) return { query: `theme:${a}`, kind: 'single' };
  if (r < 0.7) return { query: `theme:${a} theme:${pick(a)}`, kind: 'pair' };
  if (r < 0.9) return { query: `theme:${a} -theme:${pick(a)}`, kind: 'minus' };
  return { query: `theme:"${a}"`, kind: 'exact' };
}

/**
 * Roll until a query finds something, at most `tries` times; the last roll stands if none did, so
 * the dice always answers. `count` asks the server how many cards a query finds (null = unknown,
 * taken as fine: a slow or failed count must not make the dice look dead).
 */
export async function rollUntilFound(
  rand: () => number,
  game: string,
  count: (query: string) => Promise<number | null>,
  tries = 3,
): Promise<DiceRoll> {
  let roll = rollThemeQuery(rand, game);
  for (let i = 0; i < tries; i++) {
    if (i > 0) roll = rollThemeQuery(rand, game);
    const n = await count(roll.query).catch(() => null);
    if (n === null || n > 0) return roll;
  }
  return roll;
}
