/** MIC-017 style picker: the lab's ?ui= switch. Run: `npm test`. */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { parseUiParam } from './browseLayout.ts';

test('absent means no override', () => {
  assert.equal(parseUiParam(null), null);
  assert.equal(parseUiParam(undefined), null);
});

test('flags turn on by name, in any order and case', () => {
  assert.deepEqual(parseUiParam('Sort, SHEET'), { filtersSheet: true, typesDropdown: false, sortDropdown: true, artTypeInFilters: true });
  assert.deepEqual(parseUiParam('sheet,arttop'), { filtersSheet: true, typesDropdown: false, sortDropdown: false, artTypeInFilters: false });
});

test('none is today on a desk: open strips, chips, art type in place', () => {
  assert.deepEqual(parseUiParam('none'), { filtersSheet: false, typesDropdown: false, sortDropdown: false, artTypeInFilters: true });
});
