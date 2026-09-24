import assert from 'node:assert/strict';
import test from 'node:test';

import {
  groupSources,
  parseThemes,
  relevantBinders,
  utcToday,
  type PuzzleSourceBinder,
  type PuzzleSourcePage,
} from './puzzleAuthoring.ts';

const page = (over: Partial<PuzzleSourcePage>): PuzzleSourcePage => ({
  binderId: 'b1',
  binderTitle: 'Daily Puzzle: clouds + lake',
  isPublic: false,
  hiddenFromFeeds: false,
  pageId: 'p1',
  position: 0,
  pageTitle: null,
  rows: 2,
  cols: 2,
  cardCount: 4,
  ...over,
});

test('themes split on commas', () => {
  assert.deepEqual(parseThemes('flowers, city'), ['flowers', 'city']);
  assert.deepEqual(parseThemes('  Flowers ,  CITY  '), ['flowers', 'city']);
});

test('themes split on spaces only when there is no comma', () => {
  assert.deepEqual(parseThemes('flowers city'), ['flowers', 'city']);
});

/**
 * The reason spaces are not always a separator: a theme can be two words, and splitting it would
 * publish the wrong answer AND the wrong count, which nobody notices until a player who got it
 * right is told they are wrong.
 */
test('a two-word theme survives when commas are used', () => {
  assert.deepEqual(parseThemes('white kyurem, night'), ['white kyurem', 'night']);
});

test('duplicates are dropped, so the count is what a player is asked for', () => {
  assert.deepEqual(parseThemes('city, City,  city '), ['city']);
});

test('empty input is no themes, not one empty theme', () => {
  assert.deepEqual(parseThemes('   '), []);
  assert.deepEqual(parseThemes('flowers,,city'), ['flowers', 'city']);
});

test('pages group under their binder, in the order they arrived', () => {
  const grouped = groupSources([
    page({ pageId: 'p1', position: 0 }),
    page({ pageId: 'p2', position: 1 }),
    page({ binderId: 'b2', binderTitle: 'Daily Puzzle: storm + ocean', pageId: 'p3', position: 0 }),
  ]);
  assert.equal(grouped.length, 2);
  assert.deepEqual(grouped.map((b) => b.id), ['b1', 'b2']);
  assert.deepEqual(grouped[0].pages.map((p) => p.pageId), ['p1', 'p2']);
  assert.equal(grouped[1].pages.length, 1);
});

test('grouping keeps the binder flags, which is what the showcase toggle reads', () => {
  const grouped = groupSources([page({ isPublic: true, hiddenFromFeeds: true })]);
  assert.equal(grouped[0].isPublic, true);
  assert.equal(grouped[0].hiddenFromFeeds, true);
});

test('nothing in, nothing out', () => {
  assert.deepEqual(groupSources([]), []);
});

/**
 * Studio's default publish date follows the PUZZLE day, not UTC. Between 5pm and 8pm Pacific a UTC
 * default offers tomorrow's date as today's, and the puzzle would go live a day early. This asserts
 * the alias still points at the right definition, because a well-meaning "fix" back to
 * toISOString().slice(0,10) would look correct and be wrong for three hours every evening.
 */
test('the publish form defaults to the puzzle day, not the UTC date', () => {
  // 01:00 UTC on the 25th is 6pm Pacific on the 24th, and the puzzle day is still the 24th.
  assert.equal(utcToday(new Date('2026-09-25T01:00:00Z')), '2026-09-24');
  // 09:59 UTC is 02:59 Pacific, one minute before the rollover.
  assert.equal(utcToday(new Date('2026-09-24T09:59:00Z')), '2026-09-23');
  assert.equal(utcToday(new Date('2026-09-24T10:00:00Z')), '2026-09-24');
});

const binder = (over: Partial<PuzzleSourceBinder>): PuzzleSourceBinder => ({
  id: 'b', title: 'Binder 1', isPublic: false, hiddenFromFeeds: false, pages: [], ...over,
});

test('the picker defaults to puzzle binders, not every binder you own', () => {
  const all = [
    binder({ id: '1', title: 'Buco' }),
    binder({ id: '2', title: 'Daily Puzzle: clouds + lake' }),
    binder({ id: '3', title: 'All Things Autumn', isPublic: true, hiddenFromFeeds: true }),
  ];
  assert.deepEqual(relevantBinders(all, '', false).map((b) => b.id), ['2', '3']);
  assert.deepEqual(relevantBinders(all, '', true).map((b) => b.id), ['1', '2', '3']);
});

test('a filter searches everything, showcase or not', () => {
  const all = [binder({ id: '1', title: 'Buco' }), binder({ id: '2', title: 'Daily Puzzle: x' })];
  assert.deepEqual(relevantBinders(all, 'buc', false).map((b) => b.id), ['1']);
});

/** An empty list with no explanation reads as broken, so a fresh account sees everything. */
test('nothing marked yet falls back to every binder', () => {
  const all = [binder({ id: '1', title: 'Buco' })];
  assert.deepEqual(relevantBinders(all, '', false).map((b) => b.id), ['1']);
});
