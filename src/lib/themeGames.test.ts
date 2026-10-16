/**
 * The theme-search registry's pure half. Run: `npm test`.
 *
 * lib/themeGames reads the kit's getters, which `node --test` cannot load, so its rules live in
 * themeGamesCore.ts, imported here as is. Pinned: the registry URL, that a row this side cannot
 * read is dropped (its game stays locked), and that a non-array answer locks every game.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { parseRegistry, registryUrl } from './themeGamesCore.ts';

const good = {
  game: 'lorcana',
  label: 'Disney Lorcana',
  type_label: 'Ink',
  type_groups: [{ key: 'amber', label: 'Amber', color: '#f4b400' }],
  enabled: true,
  tools: true,
};

test('registryUrl reads the six client columns off the REST root', () => {
  for (const root of ['https://bmhjizcmwtmcrstadqto.supabase.co/rest/v1', 'https://bmhjizcmwtmcrstadqto.supabase.co/rest/v1/']) {
    const url = registryUrl(root);
    assert.ok(url.startsWith('https://'));
    assert.ok(url.endsWith('/rest/v1/theme_search_games?select=game,label,type_label,type_groups,enabled,tools'), url);
    assert.ok(!url.includes('v1//'), url);
  }
});

test('parseRegistry keeps a good row and drops a malformed one', () => {
  const map = parseRegistry([
    good,
    { ...good, game: 'onepiece', enabled: 'true' }, // a string is not a boolean
    { ...good, game: 'Bad Key' },
    { ...good, game: 'riftbound', type_groups: [{ key: 'fury', label: 'Fury' }] }, // no colour
    null,
  ]);
  assert.deepEqual([...map.keys()], ['lorcana']);
  assert.deepEqual(map.get('lorcana'), good);
});

test('a non-array answer is an empty map, so every game stays locked', () => {
  for (const body of [null, undefined, {}, { message: 'relation does not exist' }, 'oops', 42]) {
    assert.equal(parseRegistry(body).size, 0);
  }
});
