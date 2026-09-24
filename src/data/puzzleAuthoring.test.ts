import assert from 'node:assert/strict';
import test from 'node:test';

import { groupSources, parseThemes, utcToday, type PuzzleSourcePage } from './puzzleAuthoring.ts';

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
 * The day boundary is UTC, so "today" must not be the device's idea of it. A machine in Honolulu at
 * 20:00 on the 23rd is already the 24th in UTC, and the puzzle it should be offered is the 24th's.
 */
test('today is the UTC date, not the local one', () => {
  assert.equal(utcToday(new Date('2026-09-24T06:00:00Z')), '2026-09-24');
  assert.equal(utcToday(new Date('2026-09-24T06:00:00-10:00')), '2026-09-24');
  assert.equal(utcToday(new Date('2026-09-23T23:30:00Z')), '2026-09-23');
});
