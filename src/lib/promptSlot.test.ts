/**
 * The uninvited-dialog turn-taking. Run: `npm test`.
 *
 * Two properties, and the second is the one a browser test had to find: prompts must not stack,
 * AND answering one must not immediately summon the other. A prompt that never opened keeps its
 * place, because it recorded nothing.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  claimPromptSlot,
  promptSlotHolder,
  releasePromptSlot,
  resetPromptSlot,
  spendPromptSlot,
} from './promptSlot.ts';

test('the first claim wins and the second is refused', () => {
  resetPromptSlot();
  assert.equal(claimPromptSlot('rights'), true);
  assert.equal(claimPromptSlot('avatar'), false);
  assert.equal(promptSlotHolder(), 'rights');
});

test('a turn given back UNUSED goes to the one that was refused', () => {
  resetPromptSlot();
  assert.equal(claimPromptSlot('avatar'), true);
  // The photo turned out to be a generated monogram: nothing was shown, so nothing is owed.
  releasePromptSlot('avatar');
  assert.equal(promptSlotHolder(), null);
  assert.equal(claimPromptSlot('rights'), true);
});

test('a turn that SHOWED something is spent for the rest of the visit', () => {
  resetPromptSlot();
  assert.equal(claimPromptSlot('avatar'), true);
  spendPromptSlot('avatar');
  // Answering the photo question must not open the sharing question a second later.
  releasePromptSlot('avatar'); // the dialog closed, and the door stays shut
  assert.equal(claimPromptSlot('rights'), false);
  assert.equal(promptSlotHolder(), 'avatar');
});

test('re-claiming your own slot is not a conflict (a re-render must not lock you out)', () => {
  resetPromptSlot();
  assert.equal(claimPromptSlot('avatar'), true);
  assert.equal(claimPromptSlot('avatar'), true);
});

test('spending a slot you do not hold changes nothing', () => {
  resetPromptSlot();
  assert.equal(claimPromptSlot('rights'), true);
  spendPromptSlot('avatar');
  releasePromptSlot('rights');
  assert.equal(claimPromptSlot('avatar'), true, 'rights released unused, so avatar may go');
});

test('releasing a slot you never held leaves the holder alone', () => {
  resetPromptSlot();
  assert.equal(claimPromptSlot('rights'), true);
  releasePromptSlot('avatar');
  assert.equal(promptSlotHolder(), 'rights');
});

test('a fresh page load starts everyone over', () => {
  resetPromptSlot();
  claimPromptSlot('avatar');
  spendPromptSlot('avatar');
  resetPromptSlot();
  assert.equal(promptSlotHolder(), null);
  assert.equal(claimPromptSlot('rights'), true);
});
