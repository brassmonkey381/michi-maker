/**
 * The lease decides who may write. Its two dangerous mistakes are opposite: hand the lease to two
 * tabs at once (the data loss it exists to prevent) or hand it to nobody (the user locked out of
 * their own binders). Both are covered below, along with the awkward middles — a crashed holder,
 * a clock that jumped, storage that throws.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  EditLease,
  LEASE_MS,
  isAbandoned,
  leaseKey,
  newTabId,
  parseLease,
  viewOf,
  type LeaseStorage,
} from './editLock.ts';

/** A localStorage stand-in shared by several "tabs", exactly as one browser profile shares one. */
function fakeStorage(): LeaseStorage & { failWrites?: boolean } {
  const map = new Map<string, string>();
  const store = {
    failWrites: false,
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => {
      if (store.failWrites) throw new Error('QuotaExceeded');
      map.set(k, v);
    },
    removeItem: (k: string) => {
      map.delete(k);
    },
  };
  return store;
}

const USER = 'user-1';

test('a lone tab takes the lease and keeps it across heartbeats', () => {
  const storage = fakeStorage();
  const a = new EditLease(USER, 'tab-a', storage);
  assert.equal(a.peek(1_000), 'free');
  a.claim(1_000);
  assert.equal(a.peek(1_000), 'holder');
  assert.equal(a.renew(1_000 + LEASE_MS * 3), true, 'nobody contested it, so it stays ours');
  assert.equal(a.peek(1_000 + LEASE_MS * 3), 'holder');
});

test('a second tab is a follower while the first keeps stamping', () => {
  const storage = fakeStorage();
  const a = new EditLease(USER, 'tab-a', storage);
  const b = new EditLease(USER, 'tab-b', storage);
  a.claim(1_000);
  assert.equal(b.peek(2_000), 'follower');
  // The follower's heartbeat must NOT quietly steal a live lease — that is two writers again.
  assert.equal(b.renew(2_000), false);
  assert.equal(b.peek(2_000), 'follower');
  assert.equal(a.peek(2_000), 'holder', 'and the holder still holds it');
});

test('a crashed holder frees the lease: no release, just a stamp that stops', () => {
  const storage = fakeStorage();
  const a = new EditLease(USER, 'tab-a', storage);
  const b = new EditLease(USER, 'tab-b', storage);
  a.claim(1_000);
  assert.equal(b.peek(1_000 + LEASE_MS - 1), 'follower', 'still inside the lease');
  assert.equal(b.peek(1_000 + LEASE_MS), 'free', 'the moment it lapses, it is takeable');
  assert.equal(b.renew(1_000 + LEASE_MS), true);
  assert.equal(b.peek(1_000 + LEASE_MS), 'holder');
  assert.equal(a.peek(1_000 + LEASE_MS), 'follower', 'and the zombie now knows it is not the writer');
});

test('a holder that was superseded learns it on the next beat', () => {
  const storage = fakeStorage();
  const a = new EditLease(USER, 'tab-a', storage);
  const b = new EditLease(USER, 'tab-b', storage);
  a.claim(1_000);
  b.claim(1_100); // the deliberate hand-off: the user brought tab B forward
  assert.equal(a.renew(1_200), false, 'A must stop writing rather than stamp over B');
  assert.equal(a.peek(1_200), 'follower');
  assert.equal(b.peek(1_200), 'holder');
});

test('release frees the lease only for the tab that holds it', () => {
  const storage = fakeStorage();
  const a = new EditLease(USER, 'tab-a', storage);
  const b = new EditLease(USER, 'tab-b', storage);
  a.claim(1_000);
  b.release(); // B is closing, but B never held it
  assert.equal(a.peek(1_100), 'holder', "a follower's exit must not free the holder's lease");
  a.release();
  assert.equal(b.peek(1_100), 'free', 'the holder leaving hands over immediately, no lease wait');
});

test('two accounts in two tabs are not contesting anything', () => {
  const storage = fakeStorage();
  const mine = new EditLease('user-1', 'tab-a', storage);
  const theirs = new EditLease('user-2', 'tab-b', storage);
  mine.claim(1_000);
  assert.equal(theirs.peek(1_000), 'free');
  theirs.claim(1_000);
  assert.equal(mine.peek(1_000), 'holder', 'each account has its own lease');
  assert.notEqual(leaseKey('user-1'), leaseKey('user-2'));
});

test('storage that throws on every write leaves the tab EDITABLE, never locked out', () => {
  const storage = fakeStorage();
  storage.failWrites = true;
  const a = new EditLease(USER, 'tab-a', storage);
  a.claim(1_000); // must not throw
  assert.equal(a.peek(1_000), 'free', 'nothing was stored...');
  assert.equal(a.renew(1_000), true, '...and the tab still believes it may write');
});

test('a garbled record reads as no lease rather than locking everyone out', () => {
  assert.equal(parseLease(null), null);
  assert.equal(parseLease(''), null);
  assert.equal(parseLease('not json'), null);
  assert.equal(parseLease('{"tabId":"x"}'), null, 'no timestamp: undateable, so unusable');
  assert.equal(parseLease('{"at":5}'), null);
  assert.equal(parseLease('{"tabId":"","at":5}'), null);
  assert.deepEqual(parseLease('{"tabId":"x","at":5}'), { tabId: 'x', at: 5 });

  const storage = fakeStorage();
  storage.setItem(leaseKey(USER), '{{ truncated');
  assert.equal(new EditLease(USER, 'tab-a', storage).peek(1_000), 'free');
});

test('a stamp from the future is live, not abandoned — clocks jump', () => {
  // A laptop waking or an NTP correction can put another tab's stamp ahead of ours. "I cannot
  // date this" must not read as "that tab is dead", or a clock skew becomes two writers.
  assert.equal(isAbandoned({ tabId: 'x', at: 10_000 }, 1_000), false);
  assert.equal(viewOf({ tabId: 'x', at: 10_000 }, 'me', 1_000), 'follower');
});

test('viewOf: the three answers', () => {
  assert.equal(viewOf(null, 'me', 1_000), 'free');
  assert.equal(viewOf({ tabId: 'me', at: 1_000 }, 'me', 1_000), 'holder');
  assert.equal(viewOf({ tabId: 'you', at: 1_000 }, 'me', 1_000), 'follower');
  assert.equal(viewOf({ tabId: 'you', at: 1_000 }, 'me', 1_000 + LEASE_MS), 'free');
});

test('tab ids do not collide', () => {
  const ids = new Set(Array.from({ length: 500 }, newTabId));
  assert.equal(ids.size, 500);
});
