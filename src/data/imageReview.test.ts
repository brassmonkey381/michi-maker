/**
 * MIC-029: the image safety check's verdict rules (supabase/functions/image-review/classify.ts).
 * Run: `npm test`. Pinned: only "safe" is ever shown to visitors; anything unreadable is held.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { REVIEW_MODEL, REVIEW_SCHEMA, noticeText, parseAnswer, verdictFor } from '../../supabase/functions/image-review/classify.ts';

test('only safe is approved; suggestive is held too (owner default, 2026-11-09)', () => {
  assert.equal(verdictFor('safe'), 'approved');
  assert.equal(verdictFor('suggestive'), 'flagged');
  assert.equal(verdictFor('explicit'), 'flagged');
  assert.equal(verdictFor('refused'), 'flagged');
  assert.equal(verdictFor('unchecked'), 'unchecked');
});

test('a malformed or unexpected answer is never read as safe', () => {
  assert.equal(parseAnswer('not json').label, 'unchecked');
  assert.equal(parseAnswer('{"label":"fine"}').label, 'unchecked');
  assert.equal(parseAnswer('{}').label, 'unchecked');
  assert.equal(verdictFor(parseAnswer('{"label":"SAFE"}').label), 'unchecked');
});

test('a well-formed answer comes through, minor concern only when explicitly true', () => {
  assert.deepEqual(parseAnswer('{"label":"explicit","minor_concern":true,"reason":"nudity"}'), { label: 'explicit', minor_concern: true, reason: 'nudity' });
  assert.equal(parseAnswer('{"label":"safe","minor_concern":"yes","reason":"x"}').minor_concern, false);
});

test('the schema allows exactly the three labels, and the model is the small one', () => {
  assert.deepEqual([...REVIEW_SCHEMA.properties.label.enum], ['safe', 'suggestive', 'explicit']);
  assert.equal(REVIEW_MODEL, 'claude-haiku-5-5');
});

test('held page-mates are flagged with the explicit image', () => {
  assert.equal(verdictFor('held'), 'flagged');
});

test('the admin email carries links and counts, never images', () => {
  const n = noticeText(
    [
      { binderId: 'b1', label: 'explicit', minor: false },
      { binderId: 'b1', label: 'held', minor: false },
      { binderId: 'b2', label: 'suggestive', minor: true },
    ],
    'https://michi-maker.com/studio',
    'https://michi-maker.com',
  );
  assert.match(n.subject, /3 images held for review \(1 possible minor\)/);
  assert.match(n.text, /michi-maker\.com\/binder\/b1 {2}\(1 explicit, 1 held\)/);
  assert.match(n.text, /NCMEC/);
  assert.match(n.text, /Review them in Studio: https:\/\/michi-maker\.com\/studio/);
  assert.doesNotMatch(n.text, /binder-art|\.png|\.jpg/);
});
