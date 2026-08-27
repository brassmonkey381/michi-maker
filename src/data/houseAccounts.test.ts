/**
 * House-account demotion for the Featured shelf. Run: `npm test`.
 *
 * The point of the rule is that community binders come first; the point of these tests is that it
 * demotes rather than deletes, and that it does not quietly re-rank everyone else on the way.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { demoteHouseAccounts, isHouseAccount } from './houseAccounts.ts';

const row = (author_name: string | null, id = author_name ?? 'x') => ({ author_name, id });

test('house binders go last, members keep their ranking', () => {
  const out = demoteHouseAccounts([
    row('fakemichi', 'house-1'),
    row('lemmy'),
    row('fakemichi', 'house-2'),
    row('luctem'),
  ]);
  assert.deepEqual(out.map((r) => r.id), ['lemmy', 'luctem', 'house-1', 'house-2']);
});

test('demoted, never dropped — an empty week still has a shelf', () => {
  const only = demoteHouseAccounts([row('fakemichi', 'a'), row('fakemichi', 'b')]);
  assert.deepEqual(only.map((r) => r.id), ['a', 'b']);
});

test('the members-only case is returned untouched', () => {
  const rows = [row('lemmy'), row('luctem'), row('noahx')];
  assert.deepEqual(demoteHouseAccounts(rows).map((r) => r.id), ['lemmy', 'luctem', 'noahx']);
});

test('case and missing names do not smuggle a house binder to the top', () => {
  assert.equal(isHouseAccount('FakeMichi'), true);
  assert.equal(isHouseAccount(null), false);
  assert.equal(isHouseAccount('fakemichi2'), false, 'exact usernames only, never a prefix');
});
