/** MIC-025: what the app says about who can see a binder. Run: `npm test`. */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { sharePictureFailure, shareVisibility, visibilityChip, visibilityDetail } from './shareVisibility.ts';

test('both switches decide it', () => {
  assert.equal(shareVisibility(true, true), 'public');
  assert.equal(shareVisibility(true, false), 'hidden');
  assert.equal(shareVisibility(false, true), 'private');
  assert.equal(shareVisibility(false, false), 'private');
});

test('an unknown profile counts as public, as the database policy does', () => {
  assert.equal(shareVisibility(true, null), 'public');
  assert.equal(shareVisibility(true, undefined), 'public');
});

test('a hidden binder never claims anyone with the link can see it', () => {
  assert.doesNotMatch(visibilityDetail('hidden'), /anyone with the link can view/i);
  assert.match(visibilityDetail('hidden'), /Public profile/);
  assert.equal(visibilityChip('hidden').label, 'Hidden');
  assert.match(sharePictureFailure('hidden'), /Turn on Public profile in Settings/);
});

test('the failure line names the switch to change', () => {
  assert.match(sharePictureFailure('private'), /Anyone with the link/);
  assert.doesNotMatch(sharePictureFailure('public'), /has to be public/);
});
