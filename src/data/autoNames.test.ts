import assert from 'node:assert/strict';
import { test } from 'node:test';

import { autoBinderText, autoPageText, type NameCard } from './autoNames.ts';

const card = (name: string, o: Partial<NameCard> = {}): NameCard => ({
  name,
  types: ['Fire'],
  illustrator: `Artist ${name}`,
  setName: 'Base Set',
  evolutionLine: [],
  ...o,
});
const char = ['charmander', 'charmeleon', 'charizard'];

test('an empty page has no text', () => {
  assert.deepEqual(autoPageText([]), { title: '', description: '' });
  assert.deepEqual(autoBinderText([[], []]), { title: '', description: '' });
});

test('one Pokémon across the sets', () => {
  const t = autoPageText([
    card('Pikachu', { types: ['Lightning'], setName: 'A', illustrator: 'X' }),
    card('Pikachu ex', { types: ['Lightning'], setName: 'B', illustrator: 'Y' }),
    card('Pikachu V', { types: ['Lightning'], setName: 'C', illustrator: 'Z' }),
  ]);
  assert.equal(t.title, 'Pikachu through the sets');
  assert.equal(t.description, 'Mostly Pikachu. From A, B and C.');
});

test('one Pokémon by one artist', () => {
  const t = autoPageText([card('Mew', { illustrator: 'Akira Komayama' }), card('Mew ex', { illustrator: 'Akira Komayama' })]);
  assert.equal(t.title, 'Mew by Akira Komayama');
});

test('a complete evolution line, and a partial one', () => {
  const full = autoPageText([card('Charmander', { evolutionLine: char }), card('Charmeleon', { evolutionLine: char }), card('Charizard', { evolutionLine: char })]);
  assert.equal(full.title, 'The Charmander line, complete');
  assert.equal(full.description, 'The Charmander line, every stage. All from Base Set.');
  const part = autoPageText([card('Charmander', { evolutionLine: char }), card('Charizard', { evolutionLine: char }), card('Squirtle', { types: ['Water'] })]);
  assert.equal(part.title, 'The Charmander line');
  assert.equal(part.description, 'The Charmander line, two of its three stages. All from Base Set.');
});

test('a shared scene, a shared type, a shared set', () => {
  assert.equal(
    autoPageText([card('A', { sceneTags: ['sunset'], types: ['Water'] }), card('B', { sceneTags: ['sunset', 'sea'], types: ['Grass'] }), card('C', { types: ['Psychic'] })]).title,
    'Sunset scenes',
  );
  assert.equal(autoPageText([card('Vulpix'), card('Growlithe'), card('Ponyta', { types: ['Water'] })]).title, 'Fire types');
  const set = autoPageText([card('A', { types: ['Water'] }), card('B', { types: ['Grass'] }), card('C', { types: ['Psychic'], setName: 'Other' })]);
  assert.equal(set.title, 'Base Set');
});

test('nothing in common: the names', () => {
  const t = autoPageText([card('Eevee', { types: ['Colorless'], setName: 'A' }), card('Mew', { types: ['Psychic'], setName: 'B' })]);
  assert.equal(t.title, 'Eevee and Mew');
  const many = autoPageText(['Eevee', 'Mew', 'Snorlax', 'Ditto', 'Abra'].map((n, i) => card(n, { types: [`T${i}`], setName: `S${i}` })));
  assert.equal(many.title, 'Eevee, Mew and 3 more');
});

test('a description is about the art: lines first, then scenes, then 1-3 rarities and sets (owner 2026-11-10)', () => {
  const sq = ['squirtle', 'wartortle', 'blastoise'];
  const bu = ['bulbasaur', 'ivysaur', 'venusaur'];
  const ir = { rarity: 'Illustration Rare' };
  const page = [
    card('Charmander', { ...ir, evolutionLine: char, sceneTags: ['clouds'] }),
    card('Charmeleon', { ...ir, evolutionLine: char, sceneTags: ['clouds'] }),
    card('Charizard', { ...ir, evolutionLine: char, sceneTags: ['sky'] }),
    card('Squirtle', { ...ir, evolutionLine: sq, types: ['Water'], sceneTags: ['ocean'] }),
    card('Wartortle', { ...ir, evolutionLine: sq, types: ['Water'], sceneTags: ['ocean'] }),
    card('Blastoise', { ...ir, evolutionLine: sq, types: ['Water'], sceneTags: ['ocean'] }),
    card('Bulbasaur', { ...ir, evolutionLine: bu, types: ['Grass'], sceneTags: ['jungle'] }),
    card('Ivysaur', { ...ir, evolutionLine: bu, types: ['Grass'], sceneTags: ['jungle'] }),
    card('Venusaur', { ...ir, evolutionLine: bu, types: ['Grass'], sceneTags: ['jungle'] }),
  ].map((c, i) => ({ ...c, setName: `Set ${i}` }));
  assert.equal(autoPageText(page).description, 'Three evolution lines: Charmander, Squirtle and Bulbasaur. In the art: jungle, ocean and clouds. Illustration Rares only.');
});

test('no em dashes anywhere', () => {
  const t = autoPageText([card('Charmander', { evolutionLine: char }), card('Charizard', { evolutionLine: char })]);
  assert.ok(!/[—–]/.test(t.title + t.description));
});

test('a binder: its main Pokémon, else its friends', () => {
  const b = autoBinderText([[card('Pikachu'), card('Pikachu ex')], [card('Raichu', { types: ['Lightning'] })]]);
  assert.equal(b.title, 'Pikachu collection');
  assert.equal(b.description, 'Three cards on two pages: Pikachu and Raichu, mostly Fire.');
  const mixed = autoBinderText([[card('Eevee', { types: ['A'], setName: '1' }), card('Mew', { types: ['B'], setName: '2' }), card('Abra', { types: ['C'], setName: '3' })]]);
  assert.equal(mixed.title, 'Eevee and friends');
});

test('the facts the ✨ sends: short plain lines, empty fields left out', async () => {
  const { factsText } = await import('./autoNames.ts');
  const t = factsText([card('Charmander', { evolutionLine: char }), card('Charizard', { evolutionLine: char, sceneTags: ['volcano'] })]);
  assert.match(t, /^2 cards: Charmander, Charizard\nTypes: Fire 2\n/);
  assert.match(t, /Evolution line: Charmander > Charmeleon > Charizard \(2 of 3 here\)/);
  assert.match(t, /Scenes in the art: volcano 1/);
  assert.equal(factsText([]), '');
});
