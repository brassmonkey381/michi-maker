/**
 * The theme-search edge function's body rules. Run: `npm test`.
 *
 * The function is Deno code that `node --test` cannot load, so its rules live in a pure sibling,
 * supabase/functions/theme-search/rules.ts, imported here as is. Two promises are pinned: a
 * `theme_search` body forwards only theme_search's own parameters, for a registry-shaped game, with
 * a theme term and a bounded p_limit; and only an all-forest query rides free.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  FREE_THEME,
  GAME_KEY,
  THEME_KEYS,
  THEME_MAX_LIMIT,
  isForestOnly,
  themeSearchForward,
} from '../../supabase/functions/theme-search/rules.ts';
import { FREE_THEME as APP_FREE_THEME } from '../data/freeTheme.ts';

const theme = (value: string) => ({ key: 'theme', value });
/** The body kit 0.9.28's searchThemes posts to the proxy, every parameter present. */
const kitBody = () => ({
  rpc: 'theme_search',
  p_game: 'lorcana',
  p_fields: [theme('sky')],
  p_words: ['elsa'],
  p_frame: 'full',
  p_types: ['amber'],
  p_group: true,
  p_limit: 300,
  p_offset: 0,
  p_lang: ['en'],
});

test("the kit's full body is forwarded intact, minus rpc", () => {
  const r = themeSearchForward(kitBody());
  assert.equal(r.ok, true);
  if (!r.ok) return;
  const { rpc: _rpc, ...rest } = kitBody();
  assert.deepEqual(r.forward, rest);
  assert.equal('rpc' in r.forward, false, 'the data project has no rpc parameter');
  assert.deepEqual(new Set(Object.keys(r.forward)), THEME_KEYS, 'every theme_search parameter is allowed');
});

test('an unknown key is refused by name, and nothing is forwarded', () => {
  assert.deepEqual(themeSearchForward({ ...kitBody(), bogus: 1 }), { ok: false, error: 'unknown parameter bogus' });
  // search_cards' parameters are not theme_search's: a price bound must not slip through.
  assert.deepEqual(themeSearchForward({ ...kitBody(), p_min_price: 5 }), { ok: false, error: 'unknown parameter p_min_price' });
  assert.deepEqual(themeSearchForward({ ...kitBody(), p_sort: 'value' }), { ok: false, error: 'unknown parameter p_sort' });
});

test('p_game must be a registry key', () => {
  const bad = (p_game: unknown) => themeSearchForward({ ...kitBody(), p_game });
  for (const g of ['Bad Game', 'Lorcana', '', 'a', '1piece', 'one-piece', 'x'.repeat(33), ' lorcana']) {
    assert.deepEqual(bad(g), { ok: false, error: 'bad p_game' }, JSON.stringify(g));
  }
  assert.deepEqual(bad(7), { ok: false, error: 'bad p_game' });
  assert.deepEqual(bad(null), { ok: false, error: 'bad p_game' });
  const { p_game: _g, ...noGame } = kitBody();
  assert.deepEqual(themeSearchForward(noGame), { ok: false, error: 'bad p_game' }, 'p_game is required');
  for (const g of ['lorcana', 'onepiece', 'pokemon', 'magic_the_gathering', 'x'.repeat(32)]) {
    assert.equal(GAME_KEY.test(g), true, g);
    assert.equal(themeSearchForward({ ...kitBody(), p_game: g }).ok, true, g);
  }
});

test('a body with no theme field is refused', () => {
  const noTheme = (p_fields: unknown) => themeSearchForward({ ...kitBody(), p_fields });
  assert.deepEqual(noTheme([]), { ok: false, error: 'not a themed query' });
  assert.deepEqual(noTheme(undefined), { ok: false, error: 'not a themed query' });
  assert.deepEqual(noTheme('theme:sky'), { ok: false, error: 'not a themed query' });
  assert.deepEqual(noTheme([{ key: 'rarity', value: 'enchanted' }]), { ok: false, error: 'not a themed query' });
  assert.deepEqual(noTheme([null, 'theme']), { ok: false, error: 'not a themed query' });
  const { p_fields: _f, ...noFields } = kitBody();
  assert.deepEqual(themeSearchForward(noFields), { ok: false, error: 'not a themed query' });
  // One theme field among others is enough; the data project ignores the rest.
  assert.equal(noTheme([{ key: 'rarity', value: 'enchanted' }, theme('sky')]).ok, true);
});

test('p_limit is clamped to 1..1000; other values pass to the RPC, which clamps again', () => {
  const lim = (p_limit: unknown) => {
    const r = themeSearchForward({ ...kitBody(), p_limit });
    assert.equal(r.ok, true);
    return r.ok ? r.forward.p_limit : undefined;
  };
  assert.equal(THEME_MAX_LIMIT, 1000);
  assert.equal(lim(5000), 1000);
  assert.equal(lim(1000), 1000, 'the kit drains 1000 ids per call');
  assert.equal(lim(300), 300);
  assert.equal(lim(0), 1);
  assert.equal(lim(-20), 1);
  assert.equal(lim('5000'), '5000', "a non-number is the RPC's to coerce and clamp, as on search_cards");
  const { p_limit: _l, ...noLimit } = kitBody();
  const r = themeSearchForward(noLimit);
  assert.equal(r.ok && 'p_limit' in r.forward, false, 'an absent p_limit stays absent (the RPC default)');
});

test('the rpc key is never forwarded, whatever it says', () => {
  for (const rpc of ['theme_search', 'search_cards', 'tagged_cards', undefined]) {
    const r = themeSearchForward({ ...kitBody(), rpc });
    assert.equal(r.ok, true);
    if (r.ok) assert.equal('rpc' in r.forward, false, String(rpc));
  }
});

test("the free theme is the app's free theme", () => {
  assert.equal(FREE_THEME, APP_FREE_THEME);
});

test('forest-only: every theme term is forest, and there is one', () => {
  const body = (...p_fields: unknown[]) => ({ rpc: 'theme_search', p_game: 'onepiece', p_fields });
  assert.equal(isForestOnly(body(theme('forest'))), true);
  assert.equal(isForestOnly(body(theme('  Forest '))), true, 'case and padding do not matter');
  assert.equal(isForestOnly(body(theme('forest'), theme('forest'))), true);
  // Words, frame, type chips and other fields stay free: they narrow forest, they do not widen it.
  assert.equal(isForestOnly({ ...body(theme('forest'), { key: 'rarity', value: 'sec' }), p_words: ['luffy'], p_frame: 'window', p_types: ['red'] }), true);

  assert.equal(isForestOnly(body(theme('forest'), theme('sky'))), false, 'a second theme is metered');
  assert.equal(isForestOnly(body(theme('-forest'))), false);
  assert.equal(isForestOnly(body(theme('forests'))), false);
  assert.equal(isForestOnly(body(theme('scene:forest'))), false);
  assert.equal(isForestOnly(body({ key: 'theme', value: 7 })), false);
  assert.equal(isForestOnly(body()), false, 'no theme term is not a free theme query');
  assert.equal(isForestOnly(body({ key: 'rarity', value: 'forest' })), false);
  assert.equal(isForestOnly({ p_game: 'lorcana' }), false);
  // theme_search's parser reads `art` as a theme term too, so it cannot ride free beside forest.
  assert.equal(isForestOnly(body(theme('forest'), { key: 'art', value: 'dragon' })), false);
  assert.equal(isForestOnly(body(theme('forest'), { key: 'art', value: 'forest' })), true);
  // The Pokemon search_cards body (no rpc) keeps the rule it always had.
  assert.equal(isForestOnly({ p_fields: [theme('forest')], p_limit: 60 }), true);
  assert.equal(isForestOnly({ p_fields: [theme('forest'), theme('ocean')], p_limit: 60 }), false);
});
