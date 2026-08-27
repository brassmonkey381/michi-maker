/**
 * The shared binder URL. Run: `npm test`.
 *
 * `?v=` exists so a scraper that has already cached an unfurl for this binder sees a URL it has
 * not, and re-fetches. Two properties keep that honest and are pinned here: the version appears
 * when there is one to show, and the SAME unedited binder always yields the SAME link (a URL that
 * churned on every copy would strand yesterday's link on a stale embed forever).
 *
 * appUrl imports react-native for Platform, which `node --test` cannot load, so the URL rule is
 * restated here rather than imported. It is three lines; the cost of the copy is lower than the
 * cost of not testing it, and a drift shows up as this file disagreeing with the source.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

const ORIGIN = 'https://michi-maker.com';
/** Mirrors binderShareUrl in src/lib/appUrl.ts. */
function shareUrl(id: string, shareVersion?: number | null): string {
  const base = `${ORIGIN}/binder/${id}`;
  return shareVersion && shareVersion > 1 ? `${base}?v=${shareVersion}` : base;
}

test('a fresh binder shares as a clean link', () => {
  // v=1 is the default for every binder ever created, so appending it would put a query string on
  // every link in the product to say nothing.
  assert.equal(shareUrl('abc', 1), `${ORIGIN}/binder/abc`);
  assert.equal(shareUrl('abc', undefined), `${ORIGIN}/binder/abc`);
  assert.equal(shareUrl('abc', null), `${ORIGIN}/binder/abc`);
  assert.equal(shareUrl('abc', 0), `${ORIGIN}/binder/abc`);
});

test('an edited binder shares as a URL no scraper has seen', () => {
  assert.equal(shareUrl('abc', 2), `${ORIGIN}/binder/abc?v=2`);
  assert.equal(shareUrl('abc', 47), `${ORIGIN}/binder/abc?v=47`);
});

test('the same unedited binder yields the same link every time', () => {
  // The property that makes this safe to put in front of users: copying twice is not two links.
  assert.equal(shareUrl('abc', 5), shareUrl('abc', 5));
  assert.notEqual(shareUrl('abc', 5), shareUrl('abc', 6));
});
