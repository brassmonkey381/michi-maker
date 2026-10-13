import assert from 'node:assert/strict';
import test from 'node:test';

import { artSearchLinks, pageSubject, speciesOf } from './pageArtSubject.ts';

const pk = (name: string) => ({ name, isPokemon: true });

test('speciesOf strips mechanics, owners and parentheticals, splits tag teams, keeps regional forms', () => {
  assert.deepEqual(speciesOf('Pikachu VMAX'), ['pikachu']);
  assert.deepEqual(speciesOf('Mega Charizard X ex'), ['charizard']);
  assert.deepEqual(speciesOf('M Mewtwo EX (64)'), ['mewtwo']);
  assert.deepEqual(speciesOf("Team Rocket's Wobbuffet"), ['wobbuffet']);
  assert.deepEqual(speciesOf("Iono's Kilowattrel (Poke Ball)"), ['kilowattrel']);
  assert.deepEqual(speciesOf('Raichu & Alolan Raichu GX (Secret)'), ['raichu', 'alolan raichu']);
  assert.deepEqual(speciesOf('Honchkrow LV.X'), ['honchkrow']);
  assert.deepEqual(speciesOf('Rayquaza C LV.X'), ['rayquaza']);
  assert.deepEqual(speciesOf('Hisuian Lilligant V'), ['hisuian lilligant']);
  assert.deepEqual(speciesOf('Dark Gyarados (25)'), ['gyarados']);
});

test('a species on half the page or more is the subject', () => {
  const s = pageSubject([pk('Pikachu'), pk('Pikachu ex'), pk('Pikachu VMAX'), pk('Raichu'), pk('Eevee')], 'My page');
  assert.deepEqual(s, { label: 'Pikachu', query: 'pikachu', basis: 'species' });
});

test('two species that share the page make a pair', () => {
  const s = pageSubject([pk('Eevee'), pk('Eevee'), pk('Sylveon V'), pk('Sylveon VMAX'), pk('Umbreon')], null);
  assert.deepEqual(s, { label: 'Eevee and Sylveon', query: 'eevee sylveon', basis: 'pair' });
});

test('a mixed page falls back to its title, then to nothing; trainers never count', () => {
  const mixed = [pk('Pikachu'), pk('Eevee'), pk('Snorlax'), pk('Gengar'), { name: "Professor's Research", isPokemon: false }];
  assert.deepEqual(pageSubject(mixed, 'Kanto favourites'), { label: 'Kanto favourites', query: 'kanto favourites', basis: 'title' });
  assert.equal(pageSubject(mixed, '  ').basis, 'none');
  // One card is not a pattern.
  assert.equal(pageSubject([pk('Pikachu')], null).basis, 'none');
  // Trainers named after a species still do not count ("Rocket's Admin." is not a Pokémon).
  assert.equal(pageSubject([{ name: "Rocket's Admin.", isPokemon: false }, { name: "Rocket's Admin.", isPokemon: false }], null).basis, 'none');
});

test('every search link carries the query, and the Art of Pokémon one is its real search', () => {
  const links = artSearchLinks('alolan raichu');
  assert.ok(links.length >= 6);
  for (const l of links) {
    assert.ok(l.url.startsWith('https://'), l.title);
    assert.ok(/alolan%20raichu|alolan\+raichu/.test(l.url), `${l.title}: ${l.url}`);
  }
  assert.equal(links[0].url, 'https://www.artofpkm.com/artwork/all?q=alolan%20raichu');
});
