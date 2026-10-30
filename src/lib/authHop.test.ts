import assert from 'node:assert/strict';
import { test } from 'node:test';

import { HOP_TTL_MS, parseHop } from './authHop.ts';

const now = Date.parse('2026-10-29T22:00:00Z');

test('a fresh note comes back with its campaign, uid and session', () => {
  const raw = JSON.stringify({
    uid: 'anon-1',
    sessionId: 'sess-1',
    params: { utm_source: 'reddit', utm_campaign: 'rd_lidi_image', code: 'rd_lidi_image' },
    referrer: 'https://www.reddit.com/',
    at: now - 6_000,
  });
  assert.deepEqual(parseHop(raw, now), {
    uid: 'anon-1',
    sessionId: 'sess-1',
    params: { utm_source: 'reddit', utm_campaign: 'rd_lidi_image', code: 'rd_lidi_image' },
    referrer: 'https://www.reddit.com/',
    at: now - 6_000,
  });
});

test('a stale, future-dated, or malformed note is nothing', () => {
  assert.equal(parseHop(JSON.stringify({ at: now - HOP_TTL_MS - 1 }), now), null);
  assert.equal(parseHop(JSON.stringify({ at: now + 60_000 }), now), null);
  assert.equal(parseHop('{not json', now), null);
  assert.equal(parseHop(null, now), null);
});

test('only string params with plain keys survive; missing ids are null', () => {
  const raw = JSON.stringify({ params: { utm_source: 'x', bad: 7, 'in<j>': 'y' }, at: now });
  assert.deepEqual(parseHop(raw, now), { uid: null, sessionId: null, params: { utm_source: 'x' }, referrer: null, at: now });
});
