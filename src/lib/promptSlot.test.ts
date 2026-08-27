/**
 * The uninvited-dialog turn-taking. Run: `npm test`.
 *
 * The case that matters is two prompts becoming due on the same screen: one opens, the other
 * stays shut AND stays due, rather than both drawing over each other.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { claimPromptSlot, promptSlotHolder, releasePromptSlot } from './promptSlot.ts';

test('the first claim wins and the second is refused', () => {
  assert.equal(claimPromptSlot('rights'), true);
  assert.equal(claimPromptSlot('avatar'), false);
  assert.equal(promptSlotHolder(), 'rights');
  releasePromptSlot('rights');
});

test('releasing frees it for the one that was refused', () => {
  assert.equal(claimPromptSlot('rights'), true);
  releasePromptSlot('rights');
  assert.equal(promptSlotHolder(), null);
  assert.equal(claimPromptSlot('avatar'), true);
  releasePromptSlot('avatar');
});

test('re-claiming your own slot is not a conflict (a re-render must not lock you out)', () => {
  assert.equal(claimPromptSlot('avatar'), true);
  assert.equal(claimPromptSlot('avatar'), true);
  releasePromptSlot('avatar');
});

test('releasing a slot you never held leaves the holder alone', () => {
  assert.equal(claimPromptSlot('rights'), true);
  releasePromptSlot('avatar');
  assert.equal(promptSlotHolder(), 'rights');
  releasePromptSlot('rights');
  assert.equal(promptSlotHolder(), null);
});
