import assert from 'node:assert/strict';
import { test } from 'node:test';

import { forgetCardAdded, lastCardAdded, rememberCardAdded, themeWordsOf } from './artLead.ts';

test('themeWordsOf keeps theme and art values, drops other operators and exclusions', () => {
  assert.equal(themeWordsOf('theme:forest'), 'forest');
  assert.equal(themeWordsOf('theme:"night sky" set:sv1 sort:price'), 'night sky');
  assert.equal(themeWordsOf('art:ocean -theme:beach type:water'), 'ocean');
  assert.equal(themeWordsOf('pikachu rare:illustration >$100'), 'pikachu');
  assert.equal(themeWordsOf('  Pikachu  theme:Forest '), 'pikachu forest');
  assert.equal(themeWordsOf('set:sv1 have:yes'), '');
  assert.equal(themeWordsOf(''), '');
  assert.equal(themeWordsOf(null), '');
});

test('rememberCardAdded keeps the latest id and ignores blanks', () => {
  forgetCardAdded();
  assert.equal(lastCardAdded(), null);
  rememberCardAdded('a');
  rememberCardAdded(null);
  rememberCardAdded('b');
  assert.equal(lastCardAdded(), 'b');
  forgetCardAdded();
});
