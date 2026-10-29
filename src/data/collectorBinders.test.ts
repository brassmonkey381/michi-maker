import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  matchSets, characterIndex, characterSet, kindsFor, livingCatalogue, searchCharacters, facetsFor, hasMichiLayouts, heroOnlyLabel, isCharacterCard, michiTemplatesFor,
  type CollectorCard, completeSet, dexNumber, evolutionLineSet, inLanguage, isSecretRare, livingDex, masterSet, MICHI_PAGE_TEMPLATES,
  facetOptions, familyFromEvolvesFrom, filterPockets, isFullArt, isPokemonCard, michiPages, naturalSortKey, NO_FILTERS, numberKey, pagesNeeded, POKEDEX, rarityRank, searchSpecies, sortChangesOrder, sortKeysFor, sortPockets, speciesCounts, speciesOf, speciesSet,
  withCameos,
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

test('an evolution line keeps each era together, stages in family order', () => {
  const line = ['pichu', 'pikachu', 'raichu'];
  const cards = [
    card('r', 'Raichu', '14/102', { evolutionLine: line }),
    card('p', 'Pikachu', '58/102', { evolutionLine: line }),
    card('pi', 'Pichu', '12/111', { evolutionLine: line }),
    card('x', 'Eevee', '51/64'),
    card('p0', 'Pikachu', '58/102', { setId: 'base1', releaseDate: '1999-01-09', evolutionLine: line }),
    card('r0', 'Raichu', '14/102', { setId: 'base1', releaseDate: '1999-01-09', evolutionLine: line }),
  ];
  assert.deepEqual(evolutionLineSet(cards, 'Pikachu').pockets.map((p) => p.cardId), ['p0', 'r0', 'pi', 'p', 'r']);
  assert.deepEqual(evolutionLineSet(cards, 'Charmander').pockets, []);
  // No evolution_line anywhere (the gated catalogue): the family comes from "evolves from".
  const bare = [
    card('z', 'Charizard ex', '6/165', { evolvesFrom: 'Charmeleon' }),
    card('m', 'Charmeleon', '5/165', { evolvesFrom: 'Charmander' }),
    card('c', 'Charmander', '4/165'),
    card('mega', 'Mega Charizard X ex', '200/165', { evolvesFrom: 'Charizard ex' }),
    card('e', 'Eevee', '133/165'),
    card('v', 'Vaporeon', '134/165', { evolvesFrom: 'Eevee' }),
    card('j', 'Jolteon', '135/165', { evolvesFrom: 'Eevee' }),
  ];
  assert.deepEqual(familyFromEvolvesFrom(bare, 'charmander'), ['charmander', 'charmeleon', 'charizard']);
  assert.deepEqual(familyFromEvolvesFrom(bare, 'charizard'), ['charmander', 'charmeleon', 'charizard']);
  assert.deepEqual(familyFromEvolvesFrom(bare, 'eevee'), ['eevee', 'vaporeon', 'jolteon']);
  assert.deepEqual(evolutionLineSet(bare, 'Charmeleon').pockets.map((p) => p.cardId), ['c', 'm', 'z', 'mega']);
  assert.deepEqual(evolutionLineSet(bare, 'Vaporeon').pockets.map((p) => p.cardId), ['e', 'v', 'j']);
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

test('secret rares are the numbers past the printed total, and can be left out', () => {
  assert.equal(isSecretRare('200/165'), true);
  assert.equal(isSecretRare('165/165'), false);
  assert.equal(isSecretRare('TG05/TG30'), false);
  const cards = [card('a', 'Bulbasaur', '001/165'), card('s', 'Mew ex', '205/165', { rarity: 'Hyper Rare' })];
  assert.deepEqual(completeSet(cards).pockets.map((p) => p.cardId), ['a', 's']);
  assert.deepEqual(completeSet(cards, { secrets: false }).pockets.map((p) => p.cardId), ['a']);
});

test('a master set can seat each reverse holo beside its card', () => {
  const r = masterSet([card('a', 'Bulbasaur', '001/165'), card('b', 'Ivysaur', '002/165')], () => true, { reverse: 'beside' });
  assert.deepEqual(r.pockets.map((p) => `${p.cardId}${p.finish ? 'R' : ''}`), ['a', 'aR', 'b', 'bR']);
});

test('the language bound keeps the asked-for printing only', () => {
  const cards = [card('en', 'Pikachu', '025/165'), card('ja', 'Pikachu', '025/165', { language: 'ja' })];
  assert.deepEqual(inLanguage(cards, 'en').map((c) => c.id), ['en']);
  assert.deepEqual(inLanguage(cards, 'ja').map((c) => c.id), ['ja']);
  assert.equal(inLanguage(cards, 'both').length, 2);
});

test('cameos ride after the result, in release order, never twice', () => {
  const base = speciesSet([card('p', 'Pikachu', '025/165')], 'Pikachu');
  const cameos = [card('p', 'Pikachu', '025/165'), card('late', 'Rare Candy', '191/198', { releaseDate: '2024-01-01' }), card('early', 'Bill', '91/102', { setId: 'base1', releaseDate: '1999-01-09' })];
  const r = withCameos(base, cameos);
  assert.deepEqual(r.pockets.map((p) => p.cardId), ['p', 'early', 'late']);
  assert.equal(r.pockets[1].cameo, true);
  assert.equal(r.pockets[0].cameo, undefined);
});

test('michi pages draw a layout per page, seat every card in order around the art, and repeat for a seed', () => {
  assert.ok(MICHI_PAGE_TEMPLATES.length >= 4);
  const pockets = Array.from({ length: 40 }, (_, i) => ({ cardId: `c${i}`, ...(i % 7 === 0 ? { finish: 'Reverse Holofoil' as const } : {}) }));
  let n = 0;
  const mk = () => `id${(n += 1)}`;
  const pages = michiPages(pockets, mk, 'test');
  const seated = pages.flatMap((pg) => pg.slots.filter((s) => s.type === 'card').map((s) => s.cardId));
  assert.deepEqual(seated, pockets.map((p) => p.cardId));
  for (const pg of pages) {
    assert.ok(pg.slots.some((s) => s.type === 'artwork'), 'every page has art');
    const cells = new Set<string>();
    for (const s of pg.slots) for (let r = s.row; r < s.row + s.rowSpan; r += 1) for (let c = s.col; c < s.col + s.colSpan; c += 1) {
      assert.ok(!cells.has(`${r},${c}`), 'no overlap');
      cells.add(`${r},${c}`);
    }
    const cards = pg.slots.filter((s) => s.type === 'card');
    for (let i = 1; i < cards.length; i += 1) assert.ok(cards[i].row * 3 + cards[i].col > cards[i - 1].row * 3 + cards[i - 1].col, 'reading order');
  }
  for (let i = 1; i < pages.length - 1; i += 1) {
    const a = pages[i - 1].slots.find((s) => s.type === 'artwork')?.artTemplateId;
    const b = pages[i].slots.find((s) => s.type === 'artwork')?.artTemplateId;
    assert.notEqual(a, b, 'neighbours differ');
  }
  assert.equal(pages.flatMap((pg) => pg.slots).find((s) => s.cardId === 'c7')?.finish, 'Reverse Holofoil');
  const layouts = (ps: ReturnType<typeof michiPages>) => ps.map((pg) => pg.slots.find((s) => s.type === 'artwork')?.artTemplateId);
  assert.deepEqual(layouts(michiPages(pockets, mk, 'test')), layouts(pages));
  assert.notDeepEqual(layouts(michiPages(pockets, mk, 'other')), layouts(pages));
});

test('sorting a species result: rarest, artist, name, newest; counts per species', () => {
  const cards = [
    card('c', 'Charmander', '4/102', { setId: 'base1', releaseDate: '1999-01-09', rarity: 'Common', illustrator: 'Mitsuhiro Arita' }),
    card('z', 'Charizard', '4/102', { setId: 'base1', releaseDate: '1999-01-09', rarity: 'Holo Rare', illustrator: 'Mitsuhiro Arita' }),
    card('s', 'Charizard ex', '223/197', { releaseDate: '2023-11-03', rarity: 'Special Illustration Rare', illustrator: 'Nurikabe' }),
    card('a', 'Charmeleon', '5/102', { setId: 'base1', releaseDate: '1999-01-09', rarity: 'Uncommon', illustrator: 'Atsuko Nishida' }),
  ];
  const cardOf = (id: string) => cards.find((c) => c.id === id);
  const base = { pockets: cards.map((c) => ({ cardId: c.id })), missing: [] };
  const by = (key: 'number' | 'dex' | 'release' | 'rarity' | 'value' | 'artist' | 'name', dir: 'asc' | 'desc', valueOf?: (id: string) => number) =>
    sortPockets(base, cardOf, { key, dir }, valueOf).pockets.map((p) => p.cardId);
  // Every shape sorts: by set number, and by Pokédex number (Charmander 4, Charmeleon 5, Charizard 6).
  assert.deepEqual(by('number', 'asc').slice(0, 2).sort(), ['c', 'z']);
  assert.deepEqual(by('number', 'desc')[0], 's');
  assert.deepEqual(by('dex', 'asc'), ['c', 'a', 'z', 's']);
  assert.equal(naturalSortKey('complete'), 'number');
  assert.equal(naturalSortKey('dex'), 'dex');
  assert.equal(naturalSortKey('line'), 'release');
  assert.deepEqual(sortKeysFor('master').map((k) => k.id), ['number', 'rarity', 'value', 'artist', 'name']);
  assert.deepEqual(sortKeysFor('dex').map((k) => k.id), ['dex', 'release', 'rarity', 'value', 'artist', 'name']);
  assert.deepEqual(sortKeysFor('species').map((k) => k.id), ['release', 'rarity', 'value', 'artist', 'name']);
  assert.equal(sortChangesOrder('master', { key: 'number', dir: 'asc' }), false);
  assert.equal(sortChangesOrder('master', { key: 'number', dir: 'desc' }), true);
  assert.equal(sortChangesOrder('master', { key: 'rarity', dir: 'desc' }), true);
  assert.deepEqual(by('rarity', 'desc'), ['s', 'z', 'a', 'c']);
  assert.deepEqual(by('rarity', 'asc'), ['c', 'a', 'z', 's']);
  assert.deepEqual(by('artist', 'asc'), ['a', 'z', 'c', 's']);
  assert.deepEqual(by('name', 'asc'), ['z', 's', 'c', 'a']);
  assert.deepEqual(by('name', 'desc'), ['a', 'c', 's', 'z']);
  assert.equal(by('release', 'desc')[0], 's');
  assert.equal(by('release', 'asc')[3], 's');
  const value: Record<string, number> = { s: 120, z: 400, a: 1 };
  assert.deepEqual(by('value', 'desc', (id) => value[id] ?? 0), ['z', 's', 'a', 'c']);
  assert.ok(rarityRank('Hyper Rare') > rarityRank('Illustration Rare') && rarityRank('Illustration Rare') > rarityRank('Common'));
  assert.equal(rarityRank('Something New'), rarityRank('Rare'));
  assert.deepEqual(speciesCounts(base, cardOf), [{ species: 'Charmander', count: 1 }, { species: 'Charizard', count: 2 }, { species: 'Charmeleon', count: 1 }]);
});

test('filters narrow a result by facet, full art, Pokémon only and owned', () => {
  const cards = [
    card('c', 'Charmander', '4/102', { setId: 'base1', releaseDate: '1999-01-09', rarity: 'Common', illustrator: 'Mitsuhiro Arita', types: ['Fire'], cardType: ['Pokémon'] }),
    card('t', 'Professor Oak', '88/102', { setId: 'base1', releaseDate: '1999-01-09', rarity: 'Uncommon', illustrator: 'Ken Sugimori', types: [], cardType: ['Trainer'] }),
    card('s', 'Charizard ex', '223/197', { releaseDate: '2023-11-03', rarity: 'Special Illustration Rare', illustrator: 'Nurikabe', types: ['Fire'], fullArt: true }),
    card('w', 'Squirtle', '7/165', { releaseDate: '2023-09-22', rarity: 'Common', illustrator: 'Nurikabe', types: ['Water'], fullArtKind: 'windowed' }),
  ];
  const cardOf = (id: string) => cards.find((c) => c.id === id);
  const base = { pockets: cards.map((c) => ({ cardId: c.id })), missing: [] };
  const ctx = { seriesOf: (setId: string) => (setId === 'base1' ? 'wotc' : 'sv'), ownedIds: new Set(['c', 's']), labelOf: (_f: string, id: string) => id.toUpperCase() };
  const ids = (f: Partial<typeof NO_FILTERS>) => filterPockets(base, cardOf, { ...NO_FILTERS, ...f }, ctx).pockets.map((p) => p.cardId);
  assert.deepEqual(ids({}), ['c', 't', 's', 'w']);
  assert.deepEqual(ids({ rarities: ['Common'] }), ['c', 'w']);
  assert.deepEqual(ids({ series: ['wotc'] }), ['c', 't']);
  assert.deepEqual(ids({ sets: ['sv3pt5'] }), ['s', 'w']);
  assert.deepEqual(ids({ artists: ['Nurikabe'] }), ['s', 'w']);
  assert.deepEqual(ids({ types: ['Water', 'Grass'] }), ['w']);
  assert.deepEqual(ids({ fullArt: true }), ['s']);
  assert.deepEqual(ids({ pokemonOnly: true }), ['c', 's', 'w']);
  assert.deepEqual(ids({ owned: 'owned' }), ['c', 's']);
  assert.deepEqual(ids({ owned: 'missing' }), ['t', 'w']);
  assert.deepEqual(ids({ rarities: ['Common'], owned: 'missing' }), ['w']);
  assert.equal(isFullArt(cards[2]), true);
  assert.equal(isFullArt(cards[3]), false);
  assert.equal(isPokemonCard(cards[1]), false);
  assert.equal(isPokemonCard(card('x', 'Pikachu', '1/1')), true);
  const opts = facetOptions(base, cardOf, ctx);
  assert.deepEqual(opts.rarities.map((o) => `${o.label} ${o.count}`), ['SPECIAL ILLUSTRATION RARE 1', 'UNCOMMON 1', 'COMMON 2']);
  assert.deepEqual(opts.series.map((o) => o.id), ['sv', 'wotc']);
  assert.deepEqual(opts.artists.map((o) => o.id), ['Nurikabe', 'Ken Sugimori', 'Mitsuhiro Arita']);
  assert.deepEqual(opts.types.map((o) => o.id), ['Fire', 'Water']);
});

test('matchSets finds a set by a loose code, by name words, or by a substring', () => {
  const sets = [
    { name: 'Romance Dawn', code: 'OP01' },
    { name: 'Paramount War', code: 'OP02' },
    { name: 'Scarlet & Violet', code: 'sv1' },
    { name: 'Obsidian Flames', code: 'sv3' },
    { name: '151', code: 'sv3pt5' },
  ];
  const names = (q: string) => matchSets(sets, q).map((s) => s.code);
  assert.deepEqual(names('OP-01'), ['OP01'], 'punctuation in a code is ignored');
  assert.deepEqual(names('op 01'), ['OP01'], 'so is a space');
  assert.deepEqual(names('op'), ['OP01', 'OP02'], 'a code prefix lists the family');
  assert.deepEqual(names('sv3'), ['sv3', 'sv3pt5'], 'the exact code leads its prefix matches');
  assert.deepEqual(names('scarlet vio'), ['sv1'], 'every word typed starts a word of the name');
  assert.deepEqual(names('dawn'), ['OP01'], 'a later word of the name is enough');
  assert.deepEqual(names('151'), ['sv3pt5'], 'a name that is a number');
  assert.deepEqual(names('x'), [], 'one character is too little to match on');
  assert.deepEqual(names('zzz'), [], 'nothing invents a hit');
});

test('one character for the other games: keyed by the catalogue, labelled by the shortest name, oldest first', () => {
  const card = (id: string, name: string, key: string, releaseDate: string): CollectorCard =>
    ({ id, name, number: id, setId: 's', releaseDate, rarity: 'C', evolutionLine: [key] });
  void card;
  const cards = [
    card('3', 'Elsa - Spirit of Winter', 'elsa', '2024-02-01'),
    card('1', 'Elsa - Snow Queen', 'elsa', '2023-08-18'),
    card('2', 'Anna - Heir to Arendelle', 'anna', '2023-08-18'),
    card('4', 'Darius, Trifarian', 'darius', '2025-10-01'),
    { ...card('5', 'Luffy Is the Man', 'luffy is the man', '2024-01-01'), cardType: ['Event'] },
  ];
  const index = characterIndex(cards);
  assert.deepEqual(index.map((e) => `${e.label}:${e.count}`), ['Elsa:2', 'Anna:1', 'Darius:1']);
  assert.deepEqual(searchCharacters(index, 'el'), ['Elsa']);
  assert.deepEqual(searchCharacters(index, 'ar'), ['Darius']);
  assert.deepEqual(searchCharacters(index, 'luffy'), [], 'an event card is not a character');
  assert.equal(characterIndex(cards, { charactersOnly: false }).length, 4, 'Magic keeps every printing');
  assert.deepEqual(characterSet(cards, 'Elsa').pockets.map((p) => p.cardId), ['1', '3']);
  assert.deepEqual(kindsFor('lorcana').map((k) => k.id), ['complete', 'character', 'everything']);
  assert.equal(kindsFor('digimon')[1].label, 'One Digimon');
  assert.equal(kindsFor('pokemon').some((k) => k.id === 'character'), false);
  assert.deepEqual(kindsFor('onepiece').map((k) => k.id), ['complete', 'character', 'everything']);
  // One of everything: one card per name, events included, in order of debut; newest print stands for the name.
  assert.deepEqual(livingCatalogue(cards, 'newest').pockets.map((p) => p.cardId), ['2', '3', '5', '4']);
  assert.deepEqual(livingCatalogue(cards, 'oldest').pockets.map((p) => p.cardId), ['2', '1', '5', '4']);
});

test('the chips bend to the game: no Artist, the colour word, creatures only by card type, no michi on a 2x2', () => {
  assert.deepEqual(facetsFor('lorcana').map((f) => f.label), ['Rarity', 'Series', 'Set', 'Ink']);
  assert.deepEqual(facetsFor('pokemon').map((f) => f.label), ['Rarity', 'Series', 'Set', 'Artist', 'Type']);
  assert.deepEqual(sortKeysFor('complete', 'onepiece').map((k) => k.id), ['number', 'rarity', 'value', 'name']);
  assert.equal(heroOnlyLabel('yugioh'), 'Monsters only');
  const card = (id: string, cardType: string[]): CollectorCard => ({ id, name: id, number: id, setId: 's', releaseDate: '2024-01-01', rarity: 'C', evolutionLine: [id], cardType });
  const is = (t: string[]) => isCharacterCard(card('x', t));
  assert.equal(is(['Legendary Creature']), true);
  assert.equal(is(['Artifact Creature']), true);
  assert.equal(is(['Enchantment']), false);
  assert.equal(is(['Normal Spell']), false);
  assert.equal(is(['Effect Monster']), true);
  assert.equal(is(['Digimon/Option']), true);
  assert.equal(is(['Program']), false);
  const cards = [card('luffy', ['Character']), card('gum', ['Event']), card('ship', ['Stage'])];
  const base = { pockets: cards.map((c) => ({ cardId: c.id })), missing: [] };
  const ctx = { seriesOf: () => '', game: 'onepiece' };
  assert.deepEqual(filterPockets(base, (id) => cards.find((c) => c.id === id), { ...NO_FILTERS, pokemonOnly: true }, ctx).pockets.map((p) => p.cardId), ['luffy']);
  assert.equal(hasMichiLayouts({ rows: 3, cols: 4 }), true);
  assert.equal(hasMichiLayouts({ rows: 2, cols: 2 }), false);
  assert.ok(michiTemplatesFor({ rows: 3, cols: 4 }).length >= 4);
  assert.ok(michiTemplatesFor({ rows: 3, cols: 4 }).every((t) => t.cardPockets >= 6 && t.cardPockets <= 9));
  const pockets = Array.from({ length: 50 }, (_, i) => ({ cardId: `c${i}` }));
  let n = 0;
  const pages = michiPages(pockets, () => `id${(n += 1)}`, 'test', { rows: 3, cols: 4 });
  assert.ok(pages.every((pg) => pg.rows === 3 && pg.cols === 4 && pg.slots.some((s) => s.type === 'artwork')));
  assert.deepEqual(pages.flatMap((pg) => pg.slots.filter((s) => s.type === 'card').map((s) => s.cardId)), pockets.map((p) => p.cardId));
  assert.throws(() => michiPages(pockets, () => 'x', 'test', { rows: 2, cols: 2 }), /2×2/);
});
