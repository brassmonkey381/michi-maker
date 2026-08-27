/**
 * The prompt queue. Run: `npm test`.
 *
 * The behaviour that changed, and the reason this file exists: the old slot allowed ONE uninvited
 * dialog per visit, so answering the photo question silenced the sharing question until a visit
 * that, for most people, never came. Both must be able to happen in one visit; they just must not
 * be on screen together.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { endTurn, onTurnFree, resetTurns, takeTurn, turnHolder } from './promptQueue.ts';

test('one at a time: the second prompt is refused while the first holds it', () => {
  resetTurns();
  assert.equal(takeTurn('avatar'), true);
  assert.equal(takeTurn('rights'), false);
  assert.equal(turnHolder(), 'avatar');
});

test('BOTH can show in one visit, which is the whole point of the change', () => {
  resetTurns();
  takeTurn('avatar');
  endTurn('avatar');
  // The old slot returned false here for the rest of the visit.
  assert.equal(takeTurn('rights'), true);
});

test('re-taking your own turn succeeds, so an effect may re-run safely', () => {
  resetTurns();
  assert.equal(takeTurn('avatar'), true);
  assert.equal(takeTurn('avatar'), true);
});

test('waiters are told when the turn frees, so the loser re-checks', () => {
  resetTurns();
  let woken = 0;
  const off = onTurnFree(() => { woken += 1; });
  takeTurn('avatar');
  assert.equal(takeTurn('rights'), false);
  assert.equal(woken, 0);
  endTurn('avatar');
  // Without this the second prompt would sit unshown until something unrelated re-rendered it.
  assert.equal(woken, 1);
  off();
  takeTurn('rights');
  endTurn('rights');
  assert.equal(woken, 1, 'unsubscribed waiters stop being called');
});

test('only the holder can end the turn', () => {
  resetTurns();
  takeTurn('avatar');
  endTurn('rights'); // not yours
  assert.equal(turnHolder(), 'avatar');
});

test('a prompt that never showed still hands the turn back', () => {
  resetTurns();
  takeTurn('avatar'); // claimed, then decided not to show (no photo to offer after all)
  endTurn('avatar');
  assert.equal(turnHolder(), null);
  assert.equal(takeTurn('rights'), true, 'holding a turn you never used must not silence the other');
});
