/**
 * The sharing-default rules. Run: `npm test`.
 *
 * These decide who gets asked the rights question and when, and whose binders start public.
 * Both directions matter: a prompt that nags is the thing the 7-day cadence exists to prevent,
 * and a guest's binder defaulting public would surface content with no accountable name on it.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { PROMPT_GAP_MS, defaultBinderPublic, rightsPromptDue } from './sharingDefaults.ts';

const NOW = Date.parse('2026-08-26T12:00:00Z');
const iso = (msAgo: number) => new Date(NOW - msAgo).toISOString();

test('never shown before: the prompt is due (the first-binder moment)', () => {
  assert.equal(rightsPromptDue({ rights_attested_at: null, rights_prompt_at: null }, NOW), true);
});

test('an accepted attestation ends the prompting forever', () => {
  assert.equal(
    rightsPromptDue({ rights_attested_at: iso(0), rights_prompt_at: null }, NOW),
    false,
  );
  // ...even if a stale prompt stamp says it has been ages.
  assert.equal(
    rightsPromptDue({ rights_attested_at: iso(0), rights_prompt_at: iso(PROMPT_GAP_MS * 10) }, NOW),
    false,
  );
});

test('declined recently: not due again until the gap passes', () => {
  const declined = { rights_attested_at: null, rights_prompt_at: iso(PROMPT_GAP_MS - 60_000) };
  assert.equal(rightsPromptDue(declined, NOW), false);
  const overdue = { rights_attested_at: null, rights_prompt_at: iso(PROMPT_GAP_MS + 60_000) };
  assert.equal(rightsPromptDue(overdue, NOW), true);
});

test('no profile loaded yet: never prompt (better late than wrong)', () => {
  assert.equal(rightsPromptDue(null, NOW), false);
  assert.equal(rightsPromptDue(undefined, NOW), false);
});

test('an unparseable prompt stamp fails open to due, not to silence', () => {
  assert.equal(
    rightsPromptDue({ rights_attested_at: null, rights_prompt_at: 'not-a-date' }, NOW),
    true,
  );
});

test('binders default public only for attested, signed-in, ordinary binders', () => {
  const attested = iso(0);
  assert.equal(defaultBinderPublic({ attestedAt: attested, isAnonymous: false }), true);
  // The four ways to stay private-by-default:
  assert.equal(defaultBinderPublic({ attestedAt: null, isAnonymous: false }), false);
  assert.equal(defaultBinderPublic({ attestedAt: attested, isAnonymous: true }), false);
  assert.equal(defaultBinderPublic({ attestedAt: attested, isAnonymous: false, isDemo: true }), false);
  assert.equal(
    defaultBinderPublic({ attestedAt: attested, isAnonymous: false, isExample: true }),
    false,
  );
});

test('the gap is the owner-specified 7 days', () => {
  assert.equal(PROMPT_GAP_MS, 7 * 24 * 60 * 60 * 1000);
});
