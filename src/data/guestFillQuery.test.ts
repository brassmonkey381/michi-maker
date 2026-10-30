/**
 * The queries a guest fill sends are the whole contract with the data server's public view, so
 * they are pinned here: which columns, which grammar, how a name with punctuation travels.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';

import type { DemoPage } from './binderTypes.ts';
import { cardsQuery, GUEST_COMPLETE_METHODS, GUEST_FILL_METHODS, idsOnPage, where, WINDOWS } from './guestFillQuery.ts';

test('filters name the public columns and quote the value', () => {
  assert.deepEqual(where.nameHas(' pikachu '), ['name=ilike.*pikachu*'], 'a plain filter takes its value bare');
  assert.deepEqual(where.nameHas(''), []);
  assert.deepEqual(where.nameHasAny(['eevee', 'flareon', 'eevee', '']), ['or=(name.ilike."*eevee*",name.ilike."*flareon*")']);
  assert.deepEqual(where.nameHasAny([]), []);
  assert.deepEqual(where.artist('Mitsuhiro Arita'), ['illustrator=ilike.Mitsuhiro Arita']);
  assert.deepEqual(where.type('Fire'), ['types=cs.{"Fire"}']);
  assert.deepEqual(where.nameHasAny(['Mr. Mime']), ['or=(name.ilike."*Mr. Mime*")'], 'the dot stays inside the quotes of a list');
  assert.deepEqual(where.nameHasAny(['5ban "Graphics"']), ['or=(name.ilike."*5ban \\"Graphics\\"*")'], 'a quote is escaped, not dropped');
});

test('a query asks for ids only, standard visible cards, one window, the language bound', () => {
  const q = cardsQuery(where.nameHas('pikachu'), WINDOWS[0]);
  assert.equal(q, '/cards?select=id&jumbo=is.false&browse_visible=is.true&name=ilike.*pikachu*&order=release_date.desc.nullslast&limit=120');
  const ja = cardsQuery(where.type('Fire'), WINDOWS[1], ['ja']);
  assert.match(ja, /&language=in\.\(ja\)&/);
  assert.match(ja, /types=cs\.\{"Fire"\}/);
  assert.match(ja, /order=release_date\.asc\.nullslast&limit=80$/);
  // A space is encoded, the grammar is not.
  const sp = cardsQuery(where.nameHasAny(['mr. mime', "farfetch'd"]), WINDOWS[0]);
  assert.match(sp, /or=\(name\.ilike\."\*mr\.%20mime\*",name\.ilike\."\*farfetch'd\*"\)/);
  assert.equal(WINDOWS.reduce((n, w) => n + w.limit, 0), 200, 'two hundred cards a method');
});

test('the page ids come back in reading order, and the guest method lists name no paid-only method', () => {
  const page: DemoPage = {
    id: 'p', rows: 2, cols: 2,
    slots: [
      { id: 'b', row: 1, col: 0, rowSpan: 1, colSpan: 1, type: 'card', cardId: 'later' },
      { id: 'a', row: 0, col: 1, rowSpan: 1, colSpan: 1, type: 'card', cardId: 'first' },
      { id: 'c', row: 0, col: 0, rowSpan: 1, colSpan: 1, type: 'artwork', imageUrl: 'x' },
    ],
  } as unknown as DemoPage;
  assert.deepEqual(idsOnPage(page), ['first', 'later']);
  assert.ok(!GUEST_FILL_METHODS.includes('colorTheme'), 'the tri-colour method sells PRO');
  assert.ok(!GUEST_FILL_METHODS.includes('pokemonFriends'), 'partners need the whole catalogue');
  assert.ok(!GUEST_COMPLETE_METHODS.includes('palette'), 'the colour index is never loaded for a guest');
  assert.equal(GUEST_FILL_METHODS[0], 'samePokemon', 'wow first');
});
