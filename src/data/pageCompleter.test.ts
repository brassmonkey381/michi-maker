/**
 * Complete page fills the EMPTY pockets from what the page holds and never touches a placed card;
 * what is worth pinning is the reading of the page (which fills apply, what the lines are
 * missing) and that nothing on the page comes back as a new card.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import type { DemoPage } from './binderTypes.ts';
import { type CompleteCatalog, cardsOnPage, completeMethodsFor, completePage, emptyPockets } from './pageCompleter.ts';

const card = (id: string, over: Record<string, unknown> = {}) => ({
  id, name: id, number: '1', rarity: 'Common', cardType: ['Pokemon'], setId: 'set-a', setName: 'A', setCode: 'A', seriesId: 's', releaseDate: '2025-01-01', image: '', kind: 'standard',
  illustrator: 'Ann', types: ['Fire'], stage: 'Basic', hp: 60, evolutionStage: 1, evolvesFrom: '', evolutionLine: [], fullArtKind: '', language: 'en', ...over,
});
const CARDS = [
  card('charmander', { evolutionLine: ['charmander', 'charmeleon', 'charizard'], evolutionStage: 1 }),
  card('charmeleon', { evolutionLine: ['charmander', 'charmeleon', 'charizard'], evolutionStage: 2 }),
  card('charizard', { evolutionLine: ['charmander', 'charmeleon', 'charizard'], evolutionStage: 3 }),
  card('charizard-b', { name: 'charizard', setId: 'set-b', evolutionLine: ['charmander', 'charmeleon', 'charizard'], evolutionStage: 3 }),
  card('vulpix', { illustrator: 'Bob' }),
  card('growlithe', { illustrator: 'Ann', releaseDate: '2026-01-01' }),
  card('squirtle', { types: ['Water'] }),
];
const catalog = { getCard: (id: string) => CARDS.find((c) => c.id === id), listAll: () => CARDS } as unknown as CompleteCatalog;
const page = (ids: (string | null)[]): DemoPage => ({
  id: 'p', rows: 2, cols: 2,
  slots: ids.map((id, i) => (id ? { id: `s${i}`, row: Math.floor(i / 2), col: i % 2, rowSpan: 1, colSpan: 1, type: 'card' as const, cardId: id } : null)).filter((s): s is NonNullable<typeof s> => !!s),
});

test('reads the page: which fills apply, and the empty pockets in reading order', () => {
  const p = page(['charmander', null, 'charmeleon', null]);
  assert.deepEqual(emptyPockets(p), [{ row: 0, col: 1 }, { row: 1, col: 1 }]);
  assert.deepEqual(cardsOnPage(p, catalog).map((c) => c.id), ['charmander', 'charmeleon']);
  const m = completeMethodsFor(p, catalog);
  assert.ok(m.includes('lines'), 'the line is missing charizard');
  assert.ok(m.includes('type') && m.includes('artist') && m.includes('palette') && m.includes('similar'));
  assert.deepEqual(completeMethodsFor(page(['charmander', 'charmeleon', 'charizard', 'vulpix']), catalog), [], 'a full page has nothing to fill');
  assert.deepEqual(completeMethodsFor(page([null, null, null, null]), catalog), [], 'an empty page has nothing to read');
});

test('finish the lines: the missing stage, from the set the line is already in', async () => {
  const p = page(['charmander', null, 'charmeleon', null]);
  const out = await completePage('lines', p, catalog);
  assert.deepEqual(out, [{ row: 0, col: 1, cardId: 'charizard' }], 'set-a charizard, not set-b; one pocket stays open');
});

test('same type and same artist: more of the page, never what is on it, one per species', async () => {
  const p = page(['charmander', null, null, null]);
  const type = await completePage('type', p, catalog);
  const ids = type.map((x) => x.cardId);
  assert.ok(!ids.includes('charmander') && !ids.includes('squirtle'), 'fire only, nothing already placed');
  assert.ok(!(ids.includes('charizard') && ids.includes('charizard-b')), 'one charizard, not two prints');
  const artist = await completePage('artist', p, catalog);
  assert.ok(artist.every((x) => catalog.getCard(x.cardId)!.illustrator === 'Ann'));
  assert.ok(!artist.some((x) => x.cardId === 'vulpix'));
});
