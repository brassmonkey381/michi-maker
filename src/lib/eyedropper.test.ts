/**
 * The eyedropper's arming rules. Run: `npm test`.
 *
 * Two failures matter more than the rest, and both are about a tap going to the wrong place: a
 * disarmed dropper must never swallow a tap (that would steal a card placement), and an armed one
 * must consume exactly ONE (that would leave the user stuck in a mode changing their mix every
 * time they touched a card).
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import {
  armEyedropper,
  cancelEyedropper,
  eyedropperArmed,
  eyedropperVersion,
  pickWithEyedropper,
  subscribeEyedropper,
} from './eyedropper.ts';

test('a disarmed dropper never swallows a tap', () => {
  cancelEyedropper();
  assert.equal(eyedropperArmed(), false);
  assert.equal(pickWithEyedropper('123'), false, 'the tap must fall through to the real handler');
});

test('an armed dropper consumes the tap and reports the card', () => {
  const seen: string[] = [];
  armEyedropper((id) => seen.push(id));
  assert.equal(eyedropperArmed(), true);
  assert.equal(pickWithEyedropper('456'), true);
  assert.deepEqual(seen, ['456']);
});

test('one shot: the tap after a pick goes back to being an ordinary tap', () => {
  const seen: string[] = [];
  armEyedropper((id) => seen.push(id));
  pickWithEyedropper('first');
  assert.equal(eyedropperArmed(), false);
  assert.equal(pickWithEyedropper('second'), false);
  assert.deepEqual(seen, ['first'], 'the second tap must not reach the handler');
});

test('cancel puts it away without taking a colour', () => {
  let called = 0;
  armEyedropper(() => { called += 1; });
  cancelEyedropper();
  assert.equal(eyedropperArmed(), false);
  assert.equal(pickWithEyedropper('789'), false);
  assert.equal(called, 0);
});

test('an empty id is not a card, and is not consumed', () => {
  armEyedropper(() => { throw new Error('must not fire'); });
  assert.equal(pickWithEyedropper(''), false);
  assert.equal(pickWithEyedropper(null), false);
  assert.equal(pickWithEyedropper(undefined), false);
  assert.equal(eyedropperArmed(), true, 'a non-card tap leaves it armed and waiting');
  cancelEyedropper();
});

test('re-arming replaces the waiting handler instead of stacking two', () => {
  const seen: string[] = [];
  armEyedropper(() => seen.push('first'));
  armEyedropper(() => seen.push('second'));
  pickWithEyedropper('card');
  assert.deepEqual(seen, ['second'], 'only the latest arm may answer the tap');
});

test('a handler that re-arms during its own pick is not re-entered by it', () => {
  // The real case: picking opens the colour sheet, which itself contains tappable things.
  let depth = 0;
  let maxDepth = 0;
  armEyedropper(() => {
    depth += 1;
    maxDepth = Math.max(maxDepth, depth);
    pickWithEyedropper('again'); // must be a no-op: the dropper was disarmed before we were called
    depth -= 1;
  });
  pickWithEyedropper('card');
  assert.equal(maxDepth, 1);
});

test('subscribers hear every arm, pick and cancel', () => {
  cancelEyedropper();
  let beats = 0;
  const stop = subscribeEyedropper(() => { beats += 1; });
  const before = eyedropperVersion();
  armEyedropper(() => {});
  pickWithEyedropper('card');
  armEyedropper(() => {});
  cancelEyedropper();
  stop();
  assert.equal(beats, 4);
  assert.ok(eyedropperVersion() > before, 'the version must move so useSyncExternalStore repaints');
  armEyedropper(() => {});
  assert.equal(beats, 4, 'an unsubscribed listener hears nothing');
  cancelEyedropper();
});
