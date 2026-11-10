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
  assert.equal(t.description, 'Three cards, all Lightning, by three artists.');
});

test('one Pokémon by one artist', () => {
  const t = autoPageText([card('Mew', { illustrator: 'Akira Komayama' }), card('Mew ex', { illustrator: 'Akira Komayama' })]);
  assert.equal(t.title, 'Mew by Akira Komayama');
});

test('a complete evolution line, and a partial one', () => {
  const full = autoPageText([card('Charmander', { evolutionLine: char }), card('Charmeleon', { evolutionLine: char }), card('Charizard', { evolutionLine: char })]);
  assert.equal(full.title, 'The Charmander line, complete');
  assert.match(full.description, /all Fire/);
  const part = autoPageText([card('Charmander', { evolutionLine: char }), card('Charizard', { evolutionLine: char }), card('Squirtle', { types: ['Water'] })]);
  assert.equal(part.title, 'The Charmander line');
  assert.match(part.description, /^Three cards, mostly Fire, by three artists.$/);
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
