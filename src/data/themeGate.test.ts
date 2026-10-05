import assert from 'node:assert/strict';
import { test } from 'node:test';

import { themeSearchWall } from './themeGate.ts';

/**
 * Owner decision 2026-10-04: the search box on /browse stops offering the one-press trial. Every
 * trial it had minted was spent on a few searches and never reached the editor, and none paid.
 */
test('on the browse page the wall withholds the trial from a member', () => {
  const wall = themeSearchWall('free', 'browse');
  assert.equal(wall.offersTrial, false);
  assert.equal(wall.trialMessage, undefined);
  assert.ok(wall.message.length > 0, 'the plans note still has something to say');
});

test('in the editor the same wall still offers the trial', () => {
  const wall = themeSearchWall('free', 'binder_editor');
  assert.equal(wall.offersTrial, undefined, 'eligibility decides, as before');
  assert.ok(wall.trialMessage, 'the trial line is present for the dialog to turn into a button');
});

test('a guest never gets the trial line on any surface, as before', () => {
  for (const surface of ['browse', 'binder_editor'] as const) {
    assert.equal(themeSearchWall('guest', surface).trialMessage, undefined, surface);
  }
});

test('everything else about the wall is unchanged by the surface', () => {
  const a = themeSearchWall('free', 'browse');
  const b = themeSearchWall('free', 'binder_editor');
  assert.equal(a.limit, b.limit);
  assert.equal(a.title, b.title);
  assert.equal(a.message, b.message);
  assert.equal(a.always, true);
});
