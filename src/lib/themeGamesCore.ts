/**
 * THE THEME-SEARCH REGISTRY, PARSED — the pure half of lib/themeGames.
 *
 * The data project keeps one public row per game in `public.theme_search_games` (data migration
 * 78): whether `theme_search` serves it (`enabled`), whether the client may show the full-art / type
 * toolbar (`tools`), and the chip label and colours. Which games search their artwork is decided
 * THERE, a row update with no deploy here, so this side holds no per-game theme code at all.
 *
 * No imports, on purpose: `node --test` loads this file directly (themeGames.test.ts), and the kit
 * getters the wiring needs are not loadable there.
 */

/** The registry columns the client reads. The table is public and tag-free by design; the rest
 *  of its columns (counts, rules hash, timestamps) are the publisher's bookkeeping. */
export const REGISTRY_SELECT = 'game,label,type_label,type_groups,enabled,tools';

/** One type chip / group heading: what `p_types` and `type_group` carry, its label and colour.
 *  Structurally the kit's `ThemeTypeGroup`. */
export interface ThemeTypeGroupRow {
  key: string;
  label: string;
  color: string;
}

/** One game's registry row, as the client uses it. */
export interface ThemeGameRow {
  game: string;
  label: string;
  type_label: string;
  type_groups: ThemeTypeGroupRow[];
  enabled: boolean;
  tools: boolean;
}

/** The registry's own key check (`theme_search_games_game_chk`). */
const GAME_KEY = /^[a-z][a-z0-9_]{1,31}$/;

/** The registry read, against the data project's REST root (the kit's `getApiUrl()`). */
export function registryUrl(apiUrl: string): string {
  return `${apiUrl.replace(/\/+$/, '')}/theme_search_games?select=${REGISTRY_SELECT}`;
}

function typeGroup(g: unknown): ThemeTypeGroupRow | null {
  if (!g || typeof g !== 'object') return null;
  const { key, label, color } = g as Record<string, unknown>;
  return typeof key === 'string' && typeof label === 'string' && typeof color === 'string' ? { key, label, color } : null;
}

function row(r: unknown): ThemeGameRow | null {
  if (!r || typeof r !== 'object') return null;
  const { game, label, type_label, type_groups, enabled, tools } = r as Record<string, unknown>;
  if (typeof game !== 'string' || !GAME_KEY.test(game)) return null;
  if (typeof enabled !== 'boolean' || typeof tools !== 'boolean') return null;
  if (typeof label !== 'string' || typeof type_label !== 'string' || !Array.isArray(type_groups)) return null;
  const groups = type_groups.map(typeGroup);
  if (groups.some((g) => g === null)) return null;
  return { game, label, type_label, type_groups: groups as ThemeTypeGroupRow[], enabled, tools };
}

/**
 * The registry response, keyed by game. ONLY WELL-FORMED ROWS SURVIVE: a row this side cannot
 * read is a game left locked, which is the safe direction. Anything that is not an array (an
 * error body, null) is an empty map, which locks every game.
 */
export function parseRegistry(rows: unknown): Map<string, ThemeGameRow> {
  const out = new Map<string, ThemeGameRow>();
  if (!Array.isArray(rows)) return out;
  for (const r of rows) {
    const g = row(r);
    if (g) out.set(g.game, g);
  }
  return out;
}
