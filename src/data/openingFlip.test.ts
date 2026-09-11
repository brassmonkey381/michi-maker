/**
 * The opening riffle's timing. Run: `npm test`.
 *
 * The interesting property is the one a reader would notice and a refactor would quietly break:
 * the total is bounded no matter how deep the link points. A forty page hop must not take ten
 * seconds, and a two page hop must not crawl just because it has the budget spare.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  flipPlan,
  flipDuration,
  FLIP_BUDGET_MS,
  FLIP_HOLD_MS,
  FLIP_MIN_STEP_MS,
  FLIP_MAX_STEP_MS,
  FLIP_TOTAL_MS,
  FLIP_COVER_BEAT_MS,
  riffleBudget,
} from './openingFlip.ts';

const CEILING = FLIP_HOLD_MS + FLIP_BUDGET_MS;

test('a link with no page plans nothing', () => {
  for (const target of [0, -1, -20]) {
    const plan = flipPlan(target);
    assert.equal(plan.startAt, 0);
    assert.deepEqual(plan.steps, []);
  }
});

test('a non-integer page is ignored rather than argued with', () => {
  assert.deepEqual(flipPlan(Number.NaN).steps, []);
  assert.deepEqual(flipPlan(2.5).steps, []);
});

test('a short hop turns every page and ends on the target', () => {
  const plan = flipPlan(4);
  assert.equal(plan.startAt, 0);
  assert.deepEqual(plan.steps, [1, 2, 3, 4]);
  assert.equal(plan.steps.at(-1), 4, 'it must land exactly on the page the link asked for');
});

test('a short hop is brisk: it does not spend the whole budget on two pages', () => {
  assert.ok(
    flipPlan(2).stepMs <= FLIP_MAX_STEP_MS,
    'two pages at half the budget each would read as a stall, not a riffle',
  );
});

test('a deep link opens partway in and riffles the last stretch', () => {
  const plan = flipPlan(40);
  assert.ok(plan.startAt > 0, 'it must skip most of the book rather than turn forty pages');
  assert.equal(plan.steps.at(-1), 40);
  assert.equal(plan.steps[0], plan.startAt + 1, 'the riffle starts where the binder opened');
});

/** The property worth having a test for at all. */
test('the total is bounded, however deep the link points', () => {
  for (const target of [1, 3, 9, 14, 15, 40, 200, 5000]) {
    const total = flipDuration(flipPlan(target));
    assert.ok(
      total <= CEILING,
      `page ${target} takes ${total}ms, over the ${CEILING}ms ceiling`,
    );
  }
});

test('every step is slow enough to read as a turn', () => {
  for (const target of [1, 5, 14, 40, 200]) {
    assert.ok(
      flipPlan(target).stepMs >= FLIP_MIN_STEP_MS,
      `page ${target} turns faster than the floor, which reads as a flicker`,
    );
  }
});

test('reduce motion lands on the page with no movement and no wait', () => {
  const plan = flipPlan(40, { reduceMotion: true });
  assert.equal(plan.startAt, 40, 'it opens where it was asked to, not at the front');
  assert.deepEqual(plan.steps, []);
  assert.equal(flipDuration(plan), 0);
});

/**
 * With a cover the opening pays for a full cover turn first, so the riffle has less time and must
 * move faster. What must NOT change is the total, which is the number the owner specified.
 */
test('a cover is paid for first, and the whole opening still lands in two to three seconds', () => {
  const { holdMs, budgetMs } = riffleBudget(620);
  assert.equal(holdMs, FLIP_COVER_BEAT_MS + 620, 'the cover turn completes before any page moves');
  for (const target of [1, 6, 14, 40, 300]) {
    const plan = flipPlan(target, { holdMs, budgetMs });
    const total = flipDuration(plan);
    assert.ok(total <= FLIP_TOTAL_MS, `page ${target} with a cover takes ${total}ms, over the ceiling`);
    // No floor on a one page hop: page 1 is the spread the cover just opened onto, and dawdling
    // there would be worse than arriving. The floor only means something once there is a riffle.
    if (target >= 6) {
      assert.ok(total >= 1800, `page ${target} finishes in ${total}ms, too fast to read as an opening`);
    }
  }
});

test('without a cover the riffle gets the ordinary hold and more of the budget', () => {
  const withCover = riffleBudget(620);
  const without = riffleBudget(0);
  assert.ok(without.budgetMs > withCover.budgetMs, 'no cover to pay for means more time to riffle');
  assert.equal(without.holdMs, FLIP_HOLD_MS);
});
