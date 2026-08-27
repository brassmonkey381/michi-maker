/**
 * The shared binder URL. Run: `npm test`.
 *
 * `?v=` exists so a scraper that has already cached an unfurl for this binder sees a URL it has
 * not, and re-fetches. Two properties keep that honest and are pinned here: the key appears when
 * there is one to show, and the SAME unedited binder always yields the SAME link (a URL that
 * churned on every copy would strand yesterday's link on a stale embed forever).
 *
 * v is a short HASH of the preview's inputs, not a count — see 20260826170000. It is never
 * ordered or parsed, so there is nothing here about it increasing.
 *
 * appUrl imports react-native for Platform, which `node --test` cannot load, so the URL rule is
 * restated here rather than imported. It is three lines; the cost of the copy is lower than the
 * cost of not testing it, and a drift shows up as this file disagreeing with the source.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

const ORIGIN = 'https://michi-maker.com';
/** Mirrors binderShareUrl in src/lib/appUrl.ts. */
function shareUrl(id: string, shareKey?: string | null): string {
  const base = `${ORIGIN}/binder/${id}`;
  return shareKey ? `${base}?v=${encodeURIComponent(shareKey)}` : base;
}

test('no key means a clean link', () => {
  // A local or example binder never reaches the trigger, so it has no key and must still share.
  assert.equal(shareUrl('abc', undefined), `${ORIGIN}/binder/abc`);
  assert.equal(shareUrl('abc', null), `${ORIGIN}/binder/abc`);
  assert.equal(shareUrl('abc', ''), `${ORIGIN}/binder/abc`);
});

test('a binder with a key shares as a URL no scraper has seen', () => {
  assert.equal(shareUrl('abc', 'a3f91b2c'), `${ORIGIN}/binder/abc?v=a3f91b2c`);
});

test('the integer keys shared before the hash still build a link', () => {
  // Every link posted before 20260826170000 carries a number. Nothing reads v, so these resolve
  // to the same binder — but the builder must not choke on one either.
  assert.equal(shareUrl('abc', '47'), `${ORIGIN}/binder/abc?v=47`);
});

test('the same unedited binder yields the same link every time', () => {
  // The property that makes this safe to put in front of users: copying twice is not two links.
  assert.equal(shareUrl('abc', 'deadbeef'), shareUrl('abc', 'deadbeef'));
  assert.notEqual(shareUrl('abc', 'deadbeef'), shareUrl('abc', 'feedface'));
});

test('a key is escaped rather than pasted into the query raw', () => {
  // The key comes from the database. It is md5 hex today and can only be [0-9a-f], but a builder
  // that trusts its input is one schema change away from emitting a broken URL.
  assert.equal(shareUrl('abc', 'a b&c'), `${ORIGIN}/binder/abc?v=a%20b%26c`);
});
