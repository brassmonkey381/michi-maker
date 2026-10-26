import assert from 'node:assert/strict';
import { test } from 'node:test';

import { type CollectorCard, type CollectorResult, evolutionFamilies, masterSet, speciesSet } from './collectorBinders.ts';
import { collectorPool, collectorStrength, curateMaxPages, leftoverPockets } from './collectorCurate.ts';

const card = (id: string, name: string, number: string, extra: Partial<CollectorCard> = {}): CollectorCard => ({
  id, name, number, setId: 'sv3pt5', releaseDate: '2023-09-22', rarity: 'Common', evolutionLine: [], ...extra,
});

const family = [
  card('a', 'Charmander', '4/165', { evolvesFrom: '' }),
  card('b', 'Charmeleon', '5/165', { evolvesFrom: 'Charmander' }),
  card('c', 'Charizard ex', '6/165', { evolvesFrom: 'Charmeleon', rarity: 'Double Rare' }),
  card('d', 'Charizard', '183/165', { evolvesFrom: 'Charmeleon', rarity: 'Special Illustration Rare', fullArtKind: 'special_illustration_rare' }),
  card('e', 'Potion', '188/165', { cardType: ['Trainer'] }),
];
const byId = (id: string) => family.find((c) => c.id === id);

test('strength climbs the rarity ladder and full art adds a quarter', () => {
  assert.ok(collectorStrength(family[0]) < collectorStrength(family[2]));
  assert.ok(collectorStrength(family[2]) < collectorStrength(family[3]));
  assert.ok(collectorStrength(family[3]) > 1, 'full art special illustration rare tops the ladder');
});

test('evolution families come from "evolves from", root first, as display names', () => {
  const familyOf = evolutionFamilies(family);
  assert.deepEqual(familyOf(family[2]), ['charmander', 'charmeleon', 'charizard']);
  assert.deepEqual(familyOf(family[0]), ['charmander', 'charmeleon', 'charizard']);
  assert.equal(familyOf(family[4]), undefined, 'a Trainer is no family');
});

test('the pool holds one candidate per card, with family, trainer flag and palette', () => {
  const r = masterSet(family, (id) => id === 'a', { reverse: 'beside' });
  assert.equal(r.pockets.length, 6, 'the reverse pocket is in the result');
  const pool = collectorPool(r, byId, { familyOf: evolutionFamilies(family), paletteOf: (id) => (id === 'a' ? [{ L: 50, a: 0, b: 0, w: 1 }] : undefined) });
  assert.deepEqual(pool.map((c) => c.id), ['a', 'b', 'c', 'd', 'e'], 'the reverse holo is the same picture, not a second candidate');
  assert.deepEqual(pool[0].evolutionLine, ['charmander', 'charmeleon', 'charizard']);
  assert.equal(pool[4].trainer, true);
  assert.equal(pool[4].evolutionLine, undefined);
  assert.equal(pool[0].palette?.length, 1);
  assert.equal(pool[1].palette, undefined);
});

test('a card that knows its own line keeps it over the evolves-from family', () => {
  const r: CollectorResult = { pockets: [{ cardId: 'x' }], missing: [] };
  const x = card('x', 'Eevee', '1/1', { evolutionLine: ['Eevee', 'Vaporeon'] });
  const pool = collectorPool(r, () => x, { familyOf: () => ['wrong', 'family'] });
  assert.deepEqual(pool[0].evolutionLine, ['eevee', 'vaporeon']);
});

test('leftovers keep the result order, drop one plain pocket per placed card, keep reverse and cameo pockets', () => {
  const r: CollectorResult = {
    pockets: [{ cardId: 'a' }, { cardId: 'b' }, { cardId: 'c' }, { cardId: 'a', finish: 'Reverse Holofoil' }, { cardId: 'z', cameo: true }],
    missing: [],
  };
  const rest = leftoverPockets(r, new Set(['a', 'c']));
  assert.deepEqual(rest, [{ cardId: 'b' }, { cardId: 'a', finish: 'Reverse Holofoil' }, { cardId: 'z', cameo: true }]);
});

test('a species result with nothing placed comes back whole', () => {
  const r = speciesSet(family, 'Charizard');
  assert.deepEqual(leftoverPockets(r, new Set()), r.pockets);
});

test('curated page budget: one page per five cards, one at least, forty at most', () => {
  assert.equal(curateMaxPages(3), 1);
  assert.equal(curateMaxPages(264), 40);
  assert.equal(curateMaxPages(52), 11);
});
