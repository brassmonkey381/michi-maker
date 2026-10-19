/**
 * The secondary-game table, its published gate, and the one copy of it that lives outside
 * TypeScript. Run: `npm test`.
 *
 * api/og-image-binder.js is CommonJS outside the Expo build, so it cannot import otherGameKeys and
 * carries its own list of bucket prefixes. On 2026-09-18 that list lagged the table by a day and a
 * Lorcana pocket drew empty in every share preview. This pins the copy to the table's PUBLISHED
 * rows, in order, so the two cannot drift again without failing the suite, and a row that is not
 * published cannot reach anything that fetches (the picker, the kit's manifest and price
 * registration, lib/otherGame and the OG render all read PUBLISHED_SECONDARY_GAMES).
 */
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { test } from 'node:test';

import { bucketSaysMissing, PUBLISHED_SECONDARY_GAMES, SECONDARY_GAMES } from './otherGameKeys.ts';

const cjs = createRequire(import.meta.url);

test('every secondary game is one complete row with a unique key', () => {
  const keys = SECONDARY_GAMES.map((g) => g.key);
  assert.equal(new Set(keys).size, keys.length, 'keys are unique');
  assert.ok(!keys.includes('pokemon' as never), 'Pokémon is the primary catalog, never a secondary one');
  for (const g of SECONDARY_GAMES) {
    assert.ok(g.label.trim(), `${g.key} has a label`);
    assert.match(g.prefix, /^[a-z0-9]+$/, `${g.key}: the bucket prefix is one plain path segment`);
    assert.equal(typeof g.published, 'boolean', `${g.key} says whether it is published`);
  }
});

test('the published list is exactly the published rows, in table order', () => {
  assert.deepEqual(
    PUBLISHED_SECONDARY_GAMES.map((g) => g.key),
    SECONDARY_GAMES.filter((g) => g.published).map((g) => g.key),
  );
  const unpublished = SECONDARY_GAMES.filter((g) => !g.published);
  for (const g of unpublished) {
    assert.ok(!PUBLISHED_SECONDARY_GAMES.includes(g), `${g.key} is not published, so nothing may ask for it`);
  }
});

test("the OG renderer asks the bucket for exactly the published prefixes, in the same order", () => {
  const { __tooling } = cjs('../../api/og-image-binder.js') as { __tooling: { SECONDARY_PREFIXES: readonly string[] } };
  assert.deepEqual([...__tooling.SECONDARY_PREFIXES], PUBLISHED_SECONDARY_GAMES.map((g) => g.prefix));
});

test('a missing public object reads as missing, whichever status the bucket uses for it', () => {
  // Supabase storage answers a missing public object with 400, the 404 only in its JSON body.
  for (const status of [400, 401, 403, 404, 410]) assert.equal(bucketSaysMissing(status), true, `${status}`);
  // Worth asking again: success, a timeout, a rate limit, the server.
  for (const status of [200, 206, 304, 408, 429, 500, 502, 503]) assert.equal(bucketSaysMissing(status), false, `${status}`);
});
