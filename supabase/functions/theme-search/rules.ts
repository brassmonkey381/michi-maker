/**
 * theme-search's body rules: what is free, and what a `theme_search` call may forward.
 *
 * Pure, with no Deno imports, so `node --test` can load it (src/lib/themeSearchRules.test.ts).
 * index.ts is the only runtime caller.
 */

/** The theme every caller may search unmetered. Keep in step with michi's FREE_THEME
 *  (src/data/freeTheme.ts). */
export const FREE_THEME = 'forest';

/** The p_fields keys a data-project RPC reads as theme terms. search_cards reads 'theme' only (the
 *  kit folds `art:` into it); theme_search's parser, `_theme_where` (data migration 79), reads
 *  'theme' AND 'art'. The forest check covers both, so an `art` term cannot ride free beside a
 *  forest one. The kit never sends `art`, so this costs no real query anything. */
const THEME_FIELD_KEYS = new Set(['theme', 'art']);

/** A body whose theme fields are all the free theme (and there is at least one). */
export function isForestOnly(body: Record<string, unknown>): boolean {
  const fields = Array.isArray(body.p_fields) ? (body.p_fields as { key?: unknown; value?: unknown }[]) : [];
  const themes = fields.filter((f) => f && typeof f.key === 'string' && THEME_FIELD_KEYS.has(f.key));
  return themes.length > 0 && themes.every((f) => typeof f.value === 'string' && f.value.trim().toLowerCase() === FREE_THEME);
}

/** theme_search's parameters (data migration 79), and nothing else, may be forwarded. */
export const THEME_KEYS = new Set([
  'p_game', 'p_fields', 'p_words', 'p_frame', 'p_types', 'p_group', 'p_limit', 'p_offset', 'p_lang',
]);
/** The RPC caps p_limit at 1000 itself; the same cap here keeps a forwarded body honest. The kit
 *  drains a sorted or filtered result 1000 ids per call. */
export const THEME_MAX_LIMIT = 1000;
/** A registry key (`theme_search_games.game`). Which games are SERVED is the data project's call:
 *  a disabled or unknown game answers an empty 200 to everything this function forwards. */
export const GAME_KEY = /^[a-z][a-z0-9_]{1,31}$/;

/** Check a `{ rpc: 'theme_search', ... }` body and build what is forwarded: `rpc` dropped, every
 *  other key on THEME_KEYS, a well-formed p_game, p_limit clamped, and at least one theme field. */
export function themeSearchForward(body: Record<string, unknown>):
  { ok: true; forward: Record<string, unknown> } | { ok: false; error: string } {
  const fwd: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(body)) {
    if (k === 'rpc') continue;
    if (!THEME_KEYS.has(k)) return { ok: false, error: `unknown parameter ${k}` };
    fwd[k] = v;
  }
  if (typeof fwd.p_game !== 'string' || !GAME_KEY.test(fwd.p_game)) return { ok: false, error: 'bad p_game' };
  if (typeof fwd.p_limit === 'number') fwd.p_limit = Math.min(THEME_MAX_LIMIT, Math.max(1, fwd.p_limit));
  // A body with no theme field has no business here, as on index.ts's search_cards path.
  const tf = Array.isArray(fwd.p_fields) ? (fwd.p_fields as { key?: unknown }[]) : [];
  if (!tf.some((f) => f && f.key === 'theme')) return { ok: false, error: 'not a themed query' };
  return { ok: true, forward: fwd };
}
