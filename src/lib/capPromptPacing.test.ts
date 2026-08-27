/**
 * Cap-wall interruption pacing. Run: `npm test`.
 *
 * The two failures worth guarding are opposite and both bad: a dialog on every repeat hit (the
 * reason the pacing exists), and a wall going quiet because another wall spoke first.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { dayKey, markCapPrompted, resetCapPrompts, shouldPromptCap } from './capPromptPacing.ts';

const at = (iso: string) => Date.parse(iso);

test('the first hit of the day prompts, every hit after it does not', () => {
  resetCapPrompts();
  const t = at('2026-08-27T14:00:00');
  assert.equal(shouldPromptCap('binders', t), true);
  markCapPrompted('binders', t);
  assert.equal(shouldPromptCap('binders', t), false);
  // Placing nine cards into a full binder must not open nine dialogs.
  assert.equal(shouldPromptCap('binders', t + 60_000), false);
});

test('each wall is paced on its own — one does not silence another', () => {
  resetCapPrompts();
  const t = at('2026-08-27T14:00:00');
  markCapPrompted('binders', t);
  assert.equal(shouldPromptCap('pagesPerBinder', t), true, 'a different wall still gets its say');
  assert.equal(shouldPromptCap('artUploads', t), true);
});

test('it comes back the next calendar day, not 24 hours later', () => {
  resetCapPrompts();
  markCapPrompted('binders', at('2026-08-27T23:30:00'));
  // Eight and a half hours later, but a new day: they get today's dialog.
  assert.equal(shouldPromptCap('binders', at('2026-08-28T08:00:00')), true);
});

test('later the same day is still the same day', () => {
  resetCapPrompts();
  markCapPrompted('binders', at('2026-08-27T00:05:00'));
  assert.equal(shouldPromptCap('binders', at('2026-08-27T23:55:00')), false);
});

test('the day key is local, so it never rolls at the wrong midnight', () => {
  const d = new Date(2026, 7, 27, 22, 0, 0); // 27 Aug, local
  assert.equal(dayKey(d.getTime()), '2026-08-27');
});
