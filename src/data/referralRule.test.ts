import assert from 'node:assert/strict';
import { test } from 'node:test';

import { referralCounts } from '../../supabase/functions/_shared/referralRule.ts';

const NOW = Date.parse('2026-12-05T12:00:00Z');
const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

test('a new account made after opening the link is a referral', () => {
  assert.equal(referralCounts({ inviterId: 'a', inviteeId: 'b', openedAtMs: NOW - 2 * HOUR, accountCreatedMs: NOW - HOUR, nowMs: NOW }), true);
});

test('a guest session made as the link page loads still counts (30 minutes of slack)', () => {
  assert.equal(referralCounts({ inviterId: 'a', inviteeId: 'b', openedAtMs: NOW - HOUR, accountCreatedMs: NOW - HOUR - 60 * 1000, nowMs: NOW }), true);
});

test('an old account that opens a link gets no referral', () => {
  assert.equal(referralCounts({ inviterId: 'a', inviteeId: 'b', openedAtMs: NOW - HOUR, accountCreatedMs: NOW - 40 * DAY, nowMs: NOW }), false);
});

test('two old accounts swapping links: neither counts', () => {
  const aCreated = NOW - 60 * DAY;
  const bCreated = NOW - 30 * DAY;
  assert.equal(referralCounts({ inviterId: 'a', inviteeId: 'b', openedAtMs: NOW - HOUR, accountCreatedMs: bCreated, nowMs: NOW }), false);
  assert.equal(referralCounts({ inviterId: 'b', inviteeId: 'a', openedAtMs: NOW - HOUR, accountCreatedMs: aCreated, nowMs: NOW }), false);
});

test('your own link never counts', () => {
  assert.equal(referralCounts({ inviterId: 'a', inviteeId: 'a', openedAtMs: NOW - HOUR, accountCreatedMs: NOW, nowMs: NOW }), false);
});

test('no open time, a future one, or one older than 90 days: no referral', () => {
  const base = { inviterId: 'a', inviteeId: 'b', accountCreatedMs: NOW, nowMs: NOW };
  assert.equal(referralCounts({ ...base, openedAtMs: null }), false);
  assert.equal(referralCounts({ ...base, openedAtMs: NOW + DAY }), false);
  assert.equal(referralCounts({ ...base, openedAtMs: NOW - 91 * DAY }), false);
});
