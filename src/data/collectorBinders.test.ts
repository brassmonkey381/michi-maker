import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  type CollectorCard, completeSet, dexNumber, evolutionLineSet, livingDex, masterSet, numberKey, pagesNeeded, POKEDEX,
  searchSpecies, speciesOf, speciesSet,
} from './collectorBinders.ts';

const card = (id: string, name: string, number: string, extra: Partial<CollectorCard> = {}): CollectorCard => ({
  id, name, number, setId: 'sv3pt5', releaseDate: '2023-09-22', rarity: 'Common', evolutionLine: [], ...extra,
});

test('the dex has 1025 species and knows its awkward names', () => {
  assert.equal(POKEDEX.length, 1025);
  assert.equal(dexNumber('Pikachu'), 25);
  assert.equal(dexNumber('mr-mime'), 122);
  assert.equal(dexNumber("Farfetch'd"), 83);
  assert.equal(dexNumber('Flabébé'), 669);
  assert.equal(dexNumber('Nidoran♀'), 29);
  assert.equal(dexNumber('Trainer'), 0);
});

test('speciesOf strips forms, owners and mechanics down to the species', () => {
  assert.equal(speciesOf('Pikachu ex'), 'Pikachu');
  assert.equal(speciesOf('Charizard VMAX'), 'Charizard');
  assert.equal(speciesOf('Mega Charizard X ex'), 'Charizard');
  assert.equal(speciesOf('M Charizard-EX'), 'Charizard');
  assert.equal(speciesOf('Galarian Mr. Mime'), 'Mr. Mime');
  assert.equal(speciesOf('Pikachu & Zekrom-GX'), 'Pikachu');
  assert.equal(speciesOf("Lt. Surge's Pikachu"), 'Pikachu');
  assert.equal(speciesOf('Dark Raichu'), 'Raichu');
  assert.equal(speciesOf('Tapu Koko V'), 'Tapu Koko');
  assert.equal(speciesOf('Professor Oak'), '');
  assert.equal(speciesOf('Rare Candy'), '');
  assert.equal(speciesOf('Basic Fire Energy'), '');
});

test('a complete set runs in collector-number order with lettered runs after the plain run', () => {
  const r = completeSet([card('c', 'Mew', '151/165'), card('a', 'Bulbasaur', '001/165'), card('t', 'Pikachu', 'TG05/TG30'), card('b', 'Ivysaur', '002/165')]);
  assert.deepEqual(r.pockets.map((p) => p.cardId), ['a', 'b', 'c', 't']);
  assert.ok(numberKey('TG05/TG30') > numberKey('200/165'));
});

test('a master set adds the reverse holos after the run, only where printed', () => {
  const r = masterSet([card('a', 'Bulbasaur', '001/165'), card('b', 'Charizard ex', '006/165', { rarity: 'Double Rare' })], (id) => id === 'a');
  assert.deepEqual(r.pockets, [{ cardId: 'a' }, { cardId: 'b' }, { cardId: 'a', finish: 'Reverse Holofoil' }]);
});

test('jumbo and V-UNION pieces never take a pocket', () => {
  const r = completeSet([card('a', 'Pikachu', '001/100'), card('j', 'Pikachu', '002/100', { kind: 'jumbo' })]);
  assert.deepEqual(r.pockets.map((p) => p.cardId), ['a']);
});

test('one Pokémon: every card of the species, oldest first, owners and forms included', () => {
  const cards = [
    card('new', 'Pikachu ex', '025/165', { releaseDate: '2023-09-22' }),
    card('old', 'Pikachu', '58/102', { setId: 'base1', releaseDate: '1999-01-09' }),
    card('owner', "Lt. Surge's Pikachu", '81/132', { setId: 'gym1', releaseDate: '2000-08-14' }),
    card('other', 'Raichu', '14/102', { setId: 'base1', releaseDate: '1999-01-09' }),
  ];
  assert.deepEqual(speciesSet(cards, 'Pikachu').pockets.map((p) => p.cardId), ['old', 'owner', 'new']);
});

test('an evolution line walks the family in order', () => {
  const line = ['pichu', 'pikachu', 'raichu'];
  const cards = [
    card('r', 'Raichu', '14/102', { evolutionLine: line }),
    card('p', 'Pikachu', '58/102', { evolutionLine: line }),
    card('pi', 'Pichu', '12/111', { evolutionLine: line }),
    card('x', 'Eevee', '51/64'),
  ];
  assert.deepEqual(evolutionLineSet(cards, 'Pikachu').pockets.map((p) => p.cardId), ['pi', 'p', 'r']);
  // A species no card places in a line is a line of one.
  assert.deepEqual(evolutionLineSet(cards, 'Eevee').pockets.map((p) => p.cardId), ['x']);
});

test('the living dex takes one card per species and reports the gaps', () => {
  const cards = [
    card('b1', 'Bulbasaur', '001/165', { releaseDate: '2023-09-22' }),
    card('b0', 'Bulbasaur', '44/102', { setId: 'base1', releaseDate: '1999-01-09' }),
    card('bex', 'Bulbasaur ex', '200/165', { releaseDate: '2023-09-22' }),
    card('i', 'Ivysaur', '002/165'),
  ];
  const r = livingDex(cards, 'newest');
  assert.deepEqual(r.pockets.map((p) => p.cardId), ['b1', 'i']);
  assert.equal(r.missing.length, 1023);
  assert.equal(r.missing[0], 3);
  assert.deepEqual(livingDex(cards, 'oldest').pockets.map((p) => p.cardId), ['b0', 'i']);
});

test('pages and species search', () => {
  assert.equal(pagesNeeded(165, 9), 19);
  assert.equal(pagesNeeded(165, 8), 21);
  assert.equal(searchSpecies('pika')[0], 'Pikachu');
  assert.ok(searchSpecies('chu').includes('Pichu'));
});
