/**
 * MIC-029 gap 3: a stuck image check is no longer silent. The email goes out when stalled, at most
 * every 6 hours, and Studio's Health row turns red on the 'Stalled:' detail admin_health() writes.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { STALL_EVERY_MIN, stallDue, stallText } from '../../supabase/functions/image-review/classify.ts';
import { toneOf } from './healthTone.ts';

const NOW = Date.parse('2026-11-14T22:00:00Z');

test('a stall email is due when stalled and none went out in the last 6 hours', () => {
  assert.equal(stallDue(true, null, NOW), true);
  assert.equal(stallDue(true, new Date(NOW - (STALL_EVERY_MIN + 1) * 60e3).toISOString(), NOW), true);
  assert.equal(stallDue(true, new Date(NOW - 30 * 60e3).toISOString(), NOW), false);
  assert.equal(stallDue(false, null, NOW), false);
});

test('the stall email names every reason and never shows a picture', () => {
  const { subject, text } = stallText(['queue not moving: 4 waiting', '60 failed calls to the check in the last hour'], 'https://michi-maker.com/studio');
  assert.match(subject, /stopped/);
  assert.match(text, /queue not moving: 4 waiting/);
  assert.match(text, /60 failed calls/);
  assert.match(text, /michi-maker\.com\/studio/);
  assert.doesNotMatch(text, /https?:\/\/\S+\.(png|jpe?g|webp)/);
  assert.doesNotMatch(text, /—/); // copy rule: no em dashes
});

test("Studio's Image check row is red only when stalled, however long it has been quiet", () => {
  const quietForDays = new Date(NOW - 5 * 24 * 3_600_000).toISOString();
  assert.equal(toneOf({ signal: 'Image check', at: quietForDays, detail: '0 waiting, 0 failed calls in the last hour' }, NOW), 'ok');
  assert.equal(toneOf({ signal: 'Image check', at: quietForDays, detail: 'Stalled: schedule paused' }, NOW), 'bad');
  assert.equal(toneOf({ signal: 'Image check', at: null, detail: 'Stalled: schedule missing' }, NOW), 'bad');
});

test('the other Health rows keep their old thresholds', () => {
  assert.equal(toneOf({ signal: 'Michi event recorded', at: new Date(NOW - 3_600_000).toISOString(), detail: '' }, NOW), 'ok');
  assert.equal(toneOf({ signal: 'Michi event recorded', at: new Date(NOW - 30 * 3_600_000).toISOString(), detail: '' }, NOW), 'warn');
  assert.equal(toneOf({ signal: 'Michi event recorded', at: null, detail: '' }, NOW), 'bad');
});
