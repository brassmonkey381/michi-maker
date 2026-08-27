/**
 * The prompt registry: who each prompt is for, where it may open, and what we know about how it
 * went. Run: `npm test`.
 *
 * The case these tests exist for is the one that was broken in production: BOTH prompts due for
 * the SAME person at the same time. Of the twelve accounts whose photo was withdrawn, none had
 * accepted the attestation, so that overlap is the normal case for the population this was built
 * for, not an edge.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  PROMPTS,
  duePrompts,
  promptById,
  PROMPT_GAP_MS,
  type PromptContext,
  type PromptProfile,
  type PromptSurface,
} from './prompts.ts';

const NOW = Date.parse('2026-08-26T12:00:00Z');
const ago = (ms: number) => new Date(NOW - ms).toISOString();
const PHOTO = 'https://lh3.googleusercontent.com/a/photo';

const fresh = (over: Partial<PromptProfile> = {}): PromptProfile => ({
  username: 'builder',
  rights_attested_at: null,
  rights_prompt_at: null,
  avatar_consented_at: null,
  avatar_prompt_at: null,
  avatar_url: null,
  ...over,
});
const ctx = (over: Partial<PromptContext> = {}): PromptContext => ({
  profile: fresh(),
  isGuest: false,
  providerAvatarUrl: PHOTO,
  now: NOW,
  ...over,
});
const ids = (surface: PromptSurface, over: Partial<PromptContext> = {}) =>
  duePrompts(surface, ctx(over)).map((p) => p.id);

test('both prompts can be due for the same person at once', () => {
  // The whole reason the one-per-visit rule had to go.
  assert.deepEqual(ids('my-binders'), ['avatar-consent', 'rights-attestation']);
});

test('the avatar offer goes first', () => {
  // It is a correction to something already done to them; the attestation is an invitation.
  const order = duePrompts('my-binders', ctx());
  assert.equal(order[0].id, 'avatar-consent');
  assert.ok(order[0].priority < order[1].priority);
});

test('surfaces decide where each may open', () => {
  // The attestation belongs where a builder lands; the avatar offer follows them anywhere,
  // because the people it was written for may never open a binder again.
  assert.deepEqual(ids('home'), ['avatar-consent']);
  assert.ok(ids('binder').includes('rights-attestation'));
  assert.ok(ids('my-binders').includes('rights-attestation'));
});

test('guests are never prompted', () => {
  assert.deepEqual(ids('my-binders', { isGuest: true }), []);
});

test('the attestation waits for a username, the avatar offer does not', () => {
  const nameless = { profile: fresh({ username: null }) };
  assert.deepEqual(ids('my-binders', nameless), ['avatar-consent']);
});

test('the avatar offer needs a photo to offer, and stops once one is showing', () => {
  assert.deepEqual(ids('home', { providerAvatarUrl: null }), []);
  assert.deepEqual(ids('home', { profile: fresh({ avatar_url: 'https://example.test/mine.png' }) }), []);
});

test('answering retires a prompt for good', () => {
  assert.ok(!ids('my-binders', { profile: fresh({ rights_attested_at: ago(1) }) }).includes('rights-attestation'));
  assert.ok(!ids('home', { profile: fresh({ avatar_consented_at: ago(1) }) }).includes('avatar-consent'));
});

test('an unanswered prompt waits out the gap, then asks once more', () => {
  const justAsked = { profile: fresh({ rights_prompt_at: ago(PROMPT_GAP_MS - 1000) }) };
  assert.ok(!ids('my-binders', justAsked).includes('rights-attestation'));
  const longAgo = { profile: fresh({ rights_prompt_at: ago(PROMPT_GAP_MS + 1000) }) };
  assert.ok(ids('my-binders', longAgo).includes('rights-attestation'));
});

test('a malformed timestamp asks rather than going silent forever', () => {
  // Failing closed here would retire a prompt permanently on one bad write.
  assert.ok(ids('my-binders', { profile: fresh({ rights_prompt_at: 'not-a-date' }) }).includes('rights-attestation'));
});

test('status reports seen and accepted, and does not claim to know a decline', () => {
  const never = promptById('rights-attestation').status(fresh());
  assert.deepEqual(never, { seenAt: null, acceptedAt: null, response: 'no-answer' });

  const seen = promptById('rights-attestation').status(fresh({ rights_prompt_at: ago(1000) }));
  assert.equal(seen.seenAt, ago(1000));
  // Shown and not accepted reads as 'no-answer', NOT 'declined': closing the dialog and
  // navigating away write the same nothing, and the registry must not invent a difference.
  assert.equal(seen.response, 'no-answer');

  const done = promptById('avatar-consent').status(fresh({ avatar_consented_at: ago(5) }));
  assert.equal(done.response, 'accepted');
  assert.equal(done.acceptedAt, ago(5));
});

test('every prompt declares a surface, or it could never appear', () => {
  for (const p of PROMPTS) {
    assert.ok(p.surfaces.length > 0, `${p.id} has no surface`);
    assert.ok(p.audience.length > 20, `${p.id} does not say who it is for`);
  }
});
