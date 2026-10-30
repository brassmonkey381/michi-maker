import assert from 'node:assert/strict';
import { test } from 'node:test';

import { FRESH_WINDOW_MS, freshIdentity } from './freshIdentity.ts';

const now = Date.parse('2026-10-29T20:26:00Z');
const ago = (ms: number) => new Date(now - ms).toISOString();

test('a provider identity minted moments ago on a new user row is an oauth sign-up', () => {
  const u = { id: 'u1', created_at: ago(5_000), identities: [{ provider: 'google', created_at: ago(5_000) }] };
  assert.deepEqual(freshIdentity(u, now), { via: 'oauth', provider: 'google' });
});

test('the same identity on an old anonymous row is a guest upgrade', () => {
  const u = { id: 'u1', created_at: ago(3 * 86_400_000), identities: [{ provider: 'google', created_at: ago(20_000) }] };
  assert.deepEqual(freshIdentity(u, now), { via: 'guest_upgrade', provider: 'google' });
});

test('a returning user, an anonymous user, and a password identity are not fresh', () => {
  const back = { id: 'u2', created_at: ago(40 * 86_400_000), identities: [{ provider: 'google', created_at: ago(40 * 86_400_000) }] };
  assert.equal(freshIdentity(back, now), null);
  const anon = { id: 'u3', created_at: ago(1_000), is_anonymous: true, identities: [] };
  assert.equal(freshIdentity(anon, now), null);
  const pw = { id: 'u4', created_at: ago(1_000), identities: [{ provider: 'email', created_at: ago(1_000) }] };
  assert.equal(freshIdentity(pw, now), null);
  const stale = { id: 'u5', created_at: ago(FRESH_WINDOW_MS + 1), identities: [{ provider: 'google', created_at: ago(FRESH_WINDOW_MS + 1) }] };
  assert.equal(freshIdentity(stale, now), null);
});
