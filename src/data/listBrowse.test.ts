import assert from 'node:assert/strict';
import { test } from 'node:test';

import { publicRows } from './collectionLists.ts';
import { activeFilterCount, applyListQuery, browseRows, cardInfo, filterChoices, NO_FILTERS, type ListCardInfo } from './listBrowse.ts';

const INFO: Record<string, ListCardInfo> = {
  a: cardInfo({ name: 'Pikachu', setName: 'Base Set', releaseDate: '1999-01-09', rarity: 'Common', types: ['Lightning'] }),
  b: cardInfo({ name: 'Flabébé', setName: 'Flashfire', releaseDate: '2014-05-07', rarity: 'Common', types: ['Fairy'] }),
  c: cardInfo({ name: "Professor's Research", setName: 'Sword & Shield', releaseDate: '2020-02-07', rarity: 'Rare', cardType: ['Trainer'] }),
  d: cardInfo({ name: 'Charizard', setName: 'Base Set', releaseDate: '1999-01-09', rarity: 'Rare Holo', types: ['Fire'] }),
};
// Arrival order: wants newest first (a, b, d), then trades (c, d).
const rows = browseRows(
  publicRows({ wants: [{ card_id: 'a', quantity: 1 }, { card_id: 'b', quantity: 2 }, { card_id: 'd', quantity: 1 }], trades: [{ card_id: 'c', quantity: 1 }, { card_id: 'd', quantity: 3 }] }),
  (id) => INFO[id],
);
const q = (over: Partial<Parameters<typeof applyListQuery>[1]>) => applyListQuery(rows, { q: '', show: 'all', sort: 'newest', filters: NO_FILTERS, ...over }).map((r) => r.cardId);

test('newest keeps arrival order; a card on both lists counts once', () => {
  assert.deepEqual(q({}), ['a', 'b', 'd', 'c']);
  assert.equal(rows.find((r) => r.cardId === 'd')?.trade, 3);
});

test('All / Want / Trade', () => {
  assert.deepEqual(q({ show: 'want' }), ['a', 'b', 'd']);
  assert.deepEqual(q({ show: 'trade' }), ['d', 'c']);
});

test('search matches name and set, ignores accents and case, every word', () => {
  assert.deepEqual(q({ q: 'flabebe' }), ['b']);
  assert.deepEqual(q({ q: 'base' }), ['a', 'd']);
  assert.deepEqual(q({ q: 'base char' }), ['d']);
  assert.deepEqual(q({ q: 'zzz' }), []);
});

test('sorts: name, and set (newest set first, then name)', () => {
  assert.deepEqual(q({ sort: 'name' }), ['d', 'b', 'a', 'c']);
  assert.deepEqual(q({ sort: 'set' }), ['c', 'b', 'd', 'a']);
});

test('filters: set, type (energy type, else supertype), rarity; choices come from the rows', () => {
  assert.deepEqual(q({ filters: { ...NO_FILTERS, set: 'Base Set' } }), ['a', 'd']);
  assert.deepEqual(q({ filters: { ...NO_FILTERS, type: 'Trainer' } }), ['c']);
  assert.deepEqual(q({ filters: { set: 'Base Set', type: '', rarity: 'Rare Holo' } }), ['d']);
  assert.deepEqual(filterChoices(rows).type, ['Fairy', 'Fire', 'Lightning', 'Trainer']);
  assert.equal(activeFilterCount({ set: 'x', type: '', rarity: 'y' }), 2);
});

test('a card the catalog does not know still shows, by id', () => {
  const r = browseRows(publicRows({ wants: [{ card_id: 'zz-1', quantity: 1 }], trades: [] }), () => cardInfo(null));
  assert.deepEqual(applyListQuery(r, { q: 'zz', show: 'all', sort: 'name', filters: NO_FILTERS }).map((x) => x.cardId), ['zz-1']);
});
