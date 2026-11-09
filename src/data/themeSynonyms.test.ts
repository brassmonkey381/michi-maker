/**
 * SIMILAR WORDS (MIC-024). The app's synonym list, and the kit's expansion run against it.
 * Run: `npm test`.
 *
 * Pinned: every group is a real group the server will take (2 to 48 members, no negations, no
 * word in two groups of one game); the free theme's group matches the edge function's; with the
 * switch off a query goes out exactly as typed; on, a word becomes ONE theme_any union.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

import { FREE_THEME_GROUP, isForestOnly, themeSearchForward } from '../../supabase/functions/theme-search/rules.ts';
import { FREE_THEME } from './freeTheme.ts';

const require = createRequire(import.meta.url);
const data = require('./themeSynonyms.json') as {
  groupsByGame: Record<string, { label: string; members: string[] }[]>;
};
// The kit's pure module, loaded directly: the package index pulls in react-native.
const kit = require('tcgscan-browse/dist/synonyms.js') as typeof import('tcgscan-browse/dist/synonyms');

const GAMES = ['pokemon', 'onepiece', 'lorcana', 'riftbound', 'digimon', 'magic', 'yugioh', 'cyberpunk'];

test('every game has groups the server will accept', () => {
  for (const game of GAMES) {
    const groups = data.groupsByGame[game];
    assert.ok(groups?.length > 0, `${game}: no groups`);
    const seen = new Map<string, string>();
    for (const g of groups) {
      assert.ok(g.label.trim(), `${game}: a group with no label`);
      assert.ok(g.members.length >= 2 && g.members.length <= 48, `${game}/${g.label}: ${g.members.length} members`);
      for (const m of g.members) {
        assert.equal(m, m.toLowerCase().trim(), `${game}/${g.label}: "${m}" not normalised`);
        assert.ok(!m.startsWith('-'), `${game}/${g.label}: negated member "${m}"`);
        assert.ok(!seen.has(m), `${game}: "${m}" in both ${seen.get(m)} and ${g.label}`);
        seen.set(m, g.label);
      }
    }
  }
});

test('the free theme group is the one the edge function lets through free', () => {
  const forest = data.groupsByGame.pokemon.find((g) => g.members.includes(FREE_THEME));
  assert.ok(forest, 'forest is in no group');
  assert.deepEqual([...forest.members].sort(), [...FREE_THEME_GROUP].sort());
});

test('off: fields go out exactly as typed', () => {
  kit.__resetSimilarWordsForTests();
  kit.configureThemeSynonyms({ groupsByGame: data.groupsByGame });
  const fields = [{ key: 'theme', value: 'garbage' }, { key: 'set', value: 'sv1' }];
  const r = kit.expandThemeFields(fields, { on: false, game: 'pokemon' });
  assert.deepEqual(r.fields, fields);
  assert.deepEqual(r.expanded, []);
});

test('on: garbage becomes one theme_any union holding trash, lift-ranked', () => {
  kit.__resetSimilarWordsForTests();
  kit.configureThemeSynonyms({ groupsByGame: data.groupsByGame, rank: 'lift' });
  const r = kit.expandThemeFields([{ key: 'theme', value: 'garbage' }, { key: 'theme', value: 'night' }], { on: true, game: 'pokemon' });
  const any = r.fields.filter((f) => f.key === 'theme_any');
  assert.ok(any.length >= 1);
  const trash = any.find((f) => Array.isArray(f.value) && f.value[0] === 'garbage');
  assert.ok(trash && Array.isArray(trash.value) && trash.value.includes('trash'), 'trash not in garbage\'s union');
  assert.equal((trash as { rank: string }).rank, 'lift');
  assert.equal(r.expanded[0].word, 'garbage');
  assert.ok(r.expanded[0].also.includes('trash'));
  assert.ok(!r.expanded[0].also.includes('garbage'), 'the typed word is not listed as "also"');
});

test('on: trash and garbage search the same union', () => {
  kit.__resetSimilarWordsForTests();
  kit.configureThemeSynonyms({ groupsByGame: data.groupsByGame });
  const a = kit.expandThemeFields([{ key: 'theme', value: 'trash' }], { on: true, game: 'pokemon' }).fields[0];
  const b = kit.expandThemeFields([{ key: 'theme', value: 'garbage' }], { on: true, game: 'pokemon' }).fields[0];
  assert.deepEqual([...(a.value as string[])].sort(), [...(b.value as string[])].sort());
});

test('on: negated, namespaced and unknown words pass through untouched', () => {
  kit.__resetSimilarWordsForTests();
  kit.configureThemeSynonyms({ groupsByGame: data.groupsByGame });
  const fields = [
    { key: 'theme', value: '-trash' },
    { key: 'theme', value: 'scene:forest' },
    { key: 'theme', value: 'zzzqqq' },
  ];
  assert.deepEqual(kit.expandThemeFields(fields, { on: true, game: 'pokemon' }).fields, fields);
});

test('a plural the tags never used still finds its group', () => {
  kit.__resetSimilarWordsForTests();
  kit.configureThemeSynonyms({ groupsByGame: data.groupsByGame });
  assert.equal(kit.synonymGroupFor('dumpsters', 'pokemon')?.label, kit.synonymGroupFor('dumpster', 'pokemon')?.label);
});

test('the edge function treats theme_any as themed, and the forest group as free', () => {
  assert.equal(isForestOnly({ p_fields: [{ key: 'theme_any', value: ['forest', 'woods'] }] }), true);
  assert.equal(isForestOnly({ p_fields: [{ key: 'theme_any', value: ['forest', 'jungle'] }] }), false);
  assert.equal(isForestOnly({ p_fields: [{ key: 'theme_any', value: 'forest' }] }), false);
  assert.equal(isForestOnly({ p_fields: [{ key: 'theme', value: 'forest' }, { key: 'theme_any', value: ['trash', 'garbage'] }] }), false);
  const fwd = themeSearchForward({ rpc: 'theme_search', p_game: 'lorcana', p_fields: [{ key: 'theme_any', value: ['ghost', 'spirit'] }] });
  assert.equal(fwd.ok, true);
});

test('always on (michi since 2026-11-09): a grouped word expands with no switch, others do not', () => {
  kit.__resetSimilarWordsForTests();
  kit.configureThemeSynonyms({ groupsByGame: data.groupsByGame, always: true });
  assert.equal(kit.getSimilarWords(), true);
  const r = kit.expandThemeFields([{ key: 'theme', value: 'garbage' }, { key: 'theme', value: 'zzzqqq' }], { on: kit.getSimilarWords(), game: 'pokemon' });
  assert.equal(r.fields[0].key, 'theme_any');
  assert.deepEqual(r.fields[1], { key: 'theme', value: 'zzzqqq' });
});

// QUOTES MEAN EXACT (owner, 2026-11-09): the parser marks a quoted theme, and expansion skips it.
const query = require('tcgscan-browse/dist/query.js') as typeof import('tcgscan-browse/dist/query');

test('quoted theme is exact; unquoted searches the group', () => {
  kit.__resetSimilarWordsForTests();
  kit.configureThemeSynonyms({ groupsByGame: data.groupsByGame, always: true });
  const parsed = query.parseQuery('theme:"garbage" theme:trash');
  assert.deepEqual(parsed.fields[0], { key: 'theme', value: 'garbage', exact: true });
  const r = kit.expandThemeFields(parsed.fields, { on: kit.getSimilarWords(), game: 'pokemon' });
  assert.deepEqual(r.fields[0], { key: 'theme', value: 'garbage' }, 'quoted word went out widened');
  assert.equal(r.fields[1].key, 'theme_any', 'unquoted word did not widen');
  assert.equal(r.expanded.length, 1);
});

test('a quoted multi-word theme is that phrase alone', () => {
  kit.__resetSimilarWordsForTests();
  kit.configureThemeSynonyms({ groupsByGame: data.groupsByGame, always: true });
  const parsed = query.parseQuery('theme:"trash can"');
  assert.deepEqual(parsed.fields, [{ key: 'theme', value: 'trash can', exact: true }]);
  const r = kit.expandThemeFields(parsed.fields, { on: true, game: 'pokemon' });
  assert.deepEqual(r.fields, [{ key: 'theme', value: 'trash can' }]);
});

test('an unquoted theme carries no exact flag (the default stays the group)', () => {
  assert.deepEqual(query.parseQuery('theme:katana').fields, [{ key: 'theme', value: 'katana' }]);
});
