import assert from 'node:assert/strict';
import { test } from 'node:test';

import { type CollectorCard, type CollectorResult, evolutionFamilies, masterSet, speciesSet } from './collectorBinders.ts';
import { collectorPool, collectorStrength, curateMaxPages, leftoverPockets, tailTitle, titleTailPages } from './collectorCurate.ts';

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

const mk = (id: string, name: string, number: string, extra: Partial<CollectorCard> = {}): CollectorCard =>
  ({ id, name, number, setId: 'sv8pt5', releaseDate: '2025-01-17', rarity: 'Common', evolutionLine: [], ...extra });

test('in-order pages are titled by the span they cover under the sort, and say what they are', () => {
  const a = mk('a', 'Eevee', '010/131', { releaseDate: '2016-05-02', rarity: 'Common', illustrator: 'Atsuko Nishida' });
  const b = mk('b', 'Vaporeon', '018/131', { releaseDate: '2018-11-02', rarity: 'Rare', illustrator: 'Kouki Saitou' });
  const subject = 'Prismatic Evolutions: complete set';
  assert.deepEqual(tailTitle([a, b], { kind: 'complete', sort: { key: 'number', dir: 'asc' }, subject }), { title: 'Nos. 010 to 018', description: `${subject} in number order.` });
  assert.deepEqual(tailTitle([a, a], { kind: 'complete', sort: { key: 'number', dir: 'asc' }, subject }), { title: 'No. 010', description: `${subject} in number order.` });
  assert.deepEqual(tailTitle([a, b], { kind: 'dex', sort: { key: 'dex', dir: 'asc' }, subject: 'Living Pokédex' }), { title: '#133 to #134', description: 'Living Pokédex in Pokédex order.' });
  assert.deepEqual(tailTitle([b, a], { kind: 'species', sort: { key: 'release', dir: 'desc' }, subject: 'Every Eevee' }), { title: '2018 to 2016', description: 'Every Eevee by release, newest first.' });
  assert.equal(tailTitle([a, b], { kind: 'species', sort: { key: 'rarity', dir: 'asc' }, subject: 'Every Eevee' }).title, 'Common to Rare');
  assert.equal(tailTitle([a, b], { kind: 'species', sort: { key: 'artist', dir: 'asc' }, subject: 'Every Eevee' }).description, 'Every Eevee by illustrator, A to Z.');
  assert.equal(tailTitle([a, b], { kind: 'species', sort: { key: 'value', dir: 'desc' }, subject: 'Every Eevee' }).title, 'By value');
  assert.equal(tailTitle([a, b], { kind: 'species', sort: { key: 'name', dir: 'asc' }, subject: 'Every Eevee' }).title, 'Eevee to Vaporeon');
});

test('titling leaves curated pages and empty pages alone, and reads the cards in slot order', () => {
  const a = mk('a', 'Eevee', '010/131');
  const b = mk('b', 'Vaporeon', '018/131');
  const cardOf = (id: string) => ({ a, b } as Record<string, CollectorCard>)[id];
  const slot = (id: string, col: number) => ({ id: `s${col}`, row: 0, col, rowSpan: 1, colSpan: 1, type: 'card' as const, cardId: id });
  const order = { kind: 'complete' as const, sort: { key: 'number' as const, dir: 'asc' as const }, subject: 'Set' };
  const pages = titleTailPages([
    { id: 'p1', rows: 3, cols: 3, title: 'The Eevees', description: 'kept', slots: [slot('a', 0)] },
    { id: 'p2', rows: 3, cols: 3, slots: [slot('a', 0), slot('b', 1), { id: 'art', row: 1, col: 0, rowSpan: 1, colSpan: 1, type: 'artwork' as const }] },
    { id: 'p3', rows: 3, cols: 3, slots: [] },
  ], cardOf, order);
  assert.equal(pages[0].title, 'The Eevees');
  assert.equal(pages[0].description, 'kept');
  assert.equal(pages[1].title, 'Nos. 010 to 018');
  assert.equal(pages[2].title, undefined);
});
