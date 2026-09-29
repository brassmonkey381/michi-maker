import assert from 'node:assert/strict';
import { beforeEach, test } from 'node:test';

import {
  binderBackHref,
  noteDiscoverVisit,
  recallShelfPage,
  rememberShelfPage,
  resetDiscoverReturn,
  shelfKey,
} from './discoverReturn.ts';

beforeEach(() => resetDiscoverReturn());

test('a shelf comes back on the page it was left on', () => {
  rememberShelfPage('public:recent', 3);
  assert.equal(recallShelfPage('public:recent'), 3);
});

test('a shelf never visited opens on the first page', () => {
  assert.equal(recallShelfPage('public:recent'), 0);
});

test('each ordering keeps its own place, because they are different lists', () => {
  rememberShelfPage(shelfKey('public', 'recent'), 4);
  rememberShelfPage(shelfKey('public', 'likes'), 1);
  assert.equal(recallShelfPage(shelfKey('public', 'recent')), 4);
  assert.equal(recallShelfPage(shelfKey('public', 'likes')), 1);
  // Flipping to an ordering never paged through starts at the top rather than a stale index.
  assert.equal(recallShelfPage(shelfKey('public', 'oldest')), 0);
});

test('shelves do not share a place', () => {
  rememberShelfPage('public:recent', 2);
  assert.equal(recallShelfPage('house'), 0);
});

test('nonsense is ignored rather than stored', () => {
  rememberShelfPage('public:recent', 2);
  for (const bad of [-1, 1.5, NaN, Infinity]) {
    rememberShelfPage('public:recent', bad);
    assert.equal(recallShelfPage('public:recent'), 2, `${bad} overwrote a good value`);
  }
  rememberShelfPage('', 9);
  assert.equal(recallShelfPage(''), 0);
});

test('a binder sends you home until Discover has been open', () => {
  assert.equal(binderBackHref(), '/');
  noteDiscoverVisit();
  assert.equal(binderBackHref(), '/discover');
});

test('the visit outlives paging, so the back link does not depend on having moved a shelf', () => {
  noteDiscoverVisit();
  assert.equal(binderBackHref(), '/discover');
  assert.equal(recallShelfPage('public:recent'), 0);
});
