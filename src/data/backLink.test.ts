import assert from 'node:assert/strict';
import { test } from 'node:test';

import { discoverHref, safeBackHref, shelfFromParam } from './backLink.ts';

test('an ordinary path on this site is kept', () => {
  assert.equal(safeBackHref('/discover'), '/discover');
  assert.equal(safeBackHref('/discover?sort=likes&shelf=3'), '/discover?sort=likes&shelf=3');
});

/**
 * THE ONE THAT MATTERS. `?back=` is part of the address, so anyone can put anything in it. A link
 * that sends a reader wherever a crafted address says is an open redirect: the link reads as
 * michi-maker.com and the destination is not, with nothing to warn the reader before they arrive.
 */
test('anything pointing off this site becomes the home page', () => {
  assert.equal(safeBackHref('https://example.com'), '/');
  assert.equal(safeBackHref('http://example.com'), '/');
  // Protocol-relative: a browser reads this as another origin even though it starts with a slash,
  // which is why "starts with /" cannot be the whole check.
  assert.equal(safeBackHref('//example.com'), '/');
  assert.equal(safeBackHref('///example.com'), '/');
  const backslash = String.fromCharCode(92);
  assert.equal(safeBackHref('/' + backslash + backslash + 'example.com'), '/');
  assert.equal(safeBackHref('javascript:alert(1)'), '/');
  assert.equal(safeBackHref('data:text/html,<script>'), '/');
});

test('junk and missing values become the home page rather than throwing', () => {
  assert.equal(safeBackHref(undefined), '/');
  assert.equal(safeBackHref(null), '/');
  assert.equal(safeBackHref(''), '/');
  assert.equal(safeBackHref(42), '/');
  assert.equal(safeBackHref({}), '/');
  assert.equal(safeBackHref('discover'), '/', 'a relative path has no leading slash');
});

test('a repeated query parameter arrives as an array and the first one is used', () => {
  assert.equal(safeBackHref(['/discover', '/studio']), '/discover');
  assert.equal(safeBackHref(['https://example.com', '/discover']), '/');
});

test('surrounding whitespace does not smuggle anything through', () => {
  assert.equal(safeBackHref('  /discover  '), '/discover');
  assert.equal(safeBackHref('  //example.com'), '/');
});

test('the discover address carries only what it needs', () => {
  assert.equal(discoverHref('recent', 0), '/discover?sort=recent');
  assert.equal(discoverHref('likes', 3), '/discover?sort=likes&shelf=3');
  assert.equal(discoverHref('', 0), '/discover');
});

test('a shelf page out of a parameter, or zero', () => {
  assert.equal(shelfFromParam('3'), 3);
  assert.equal(shelfFromParam('0'), 0);
  assert.equal(shelfFromParam(['2', '9']), 2);
  for (const bad of ['-1', '1.5', 'abc', '', undefined, null, '1e9', '99999']) {
    assert.equal(shelfFromParam(bad), 0, String(bad) + ' should not be a page');
  }
});
