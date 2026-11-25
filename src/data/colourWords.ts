/**
 * TYPED COLOUR WORDS (MIC-068 step 1, owner 2026-11-25: new green pages did not show for "green").
 *
 * Discover's text search matches the literal word only (titles, descriptions, card text), and the
 * colour swatches are a separate search over each page's card palettes (data/colourFamilies).
 * Typing a colour now runs the swatch search too. This file says which family a typed query names.
 *
 * - One list of words per family, the words people type for that colour. A word belongs to ONE
 *   family, picked the way colourFamilies names a hue: teal leans green here because people who
 *   type "teal" for a binder mean green-blue nature pages; cyan, aqua and turquoise are blue.
 * - Shade words (light, dark, pale, pastel...) do not change the family: "dark green" is green.
 * - onlyColour is true when nothing else is in the query ("green", "pastel pink", "forest green").
 *   Then colour pages lead the results. A mixed query ("green forest", "Black Kyurem") keeps its
 *   own results first and adds the colour pages after them, so a name is never pushed down.
 * - The first family named wins. "red and blue" runs red.
 */
import type { ColourFamily } from './colourFamilies';

export const COLOUR_WORDS: Record<ColourFamily, readonly string[]> = {
  red: ['red', 'reds', 'crimson', 'scarlet', 'ruby', 'cherry', 'maroon', 'burgundy', 'vermilion', 'blood red', 'wine'],
  orange: ['orange', 'oranges', 'amber', 'tangerine', 'rust', 'copper', 'apricot', 'peach', 'burnt orange'],
  yellow: ['yellow', 'yellows', 'gold', 'golden', 'lemon', 'mustard', 'butter yellow', 'sunflower', 'canary'],
  green: ['green', 'greens', 'emerald', 'jade', 'lime', 'mint', 'olive', 'sage', 'forest green', 'chartreuse', 'teal', 'moss'],
  blue: ['blue', 'blues', 'navy', 'azure', 'cobalt', 'sapphire', 'sky blue', 'baby blue', 'cyan', 'aqua', 'turquoise', 'indigo', 'cerulean'],
  purple: ['purple', 'purples', 'violet', 'lavender', 'lilac', 'plum', 'mauve', 'amethyst', 'grape'],
  pink: ['pink', 'pinks', 'rose', 'blush', 'fuchsia', 'magenta', 'salmon', 'bubblegum', 'hot pink'],
  black: ['black', 'blacks', 'onyx', 'jet black', 'charcoal', 'ebony', 'noir'],
};

/** Words that shade a colour without naming another one. */
const SHADES = new Set(['light', 'dark', 'pale', 'pastel', 'deep', 'bright', 'neon', 'soft', 'vivid', 'muted', 'colour', 'color', 'colours', 'colors', 'coloured', 'colored', 'and', 'or']);

const PHRASES: { words: string[]; family: ColourFamily }[] = (Object.entries(COLOUR_WORDS) as [ColourFamily, readonly string[]][])
  .flatMap(([family, ws]) => ws.map((w) => ({ words: w.split(' '), family })))
  // Longest first, so "forest green" is read before "green" and "forest" is not left over.
  .sort((a, b) => b.words.length - a.words.length);

export type ColourWordMatch = { family: ColourFamily; onlyColour: boolean };

/** The colour family a typed query names, or null. */
export function colourWordIn(query: string): ColourWordMatch | null {
  const tokens = query
    .toLowerCase()
    .replace(/[^a-z\s-]/g, ' ')
    .split(/[\s-]+/)
    .filter(Boolean);
  if (!tokens.length) return null;
  const used = new Array<boolean>(tokens.length).fill(false);
  let first: { at: number; family: ColourFamily } | null = null;
  for (const p of PHRASES) {
    for (let i = 0; i + p.words.length <= tokens.length; i += 1) {
      if (used.slice(i, i + p.words.length).some(Boolean)) continue;
      if (!p.words.every((w, k) => tokens[i + k] === w)) continue;
      for (let k = 0; k < p.words.length; k += 1) used[i + k] = true;
      if (!first || i < first.at) first = { at: i, family: p.family };
    }
  }
  if (!first) return null;
  const onlyColour = tokens.every((t, i) => used[i] || SHADES.has(t));
  return { family: first.family, onlyColour };
}
