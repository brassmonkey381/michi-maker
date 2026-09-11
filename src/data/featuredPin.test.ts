/**
 * The Featured pin, and above all that it lets go. Run: `npm test`.
 *
 * The interesting assertions here are the negative ones. A pin is a suspension of the rule that
 * keeps members' work at the front of that shelf, so the tests that matter are the ones proving it
 * ends by itself, survives a missing binder, and never shows the same binder twice.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { activePin, withPinnedFeatured, FEATURED_PIN, type FeaturedPin } from './featuredPin.ts';

const PIN: FeaturedPin = { binderId: 'pinned', until: '2026-09-18', because: 'test' };
const at = (iso: string) => Date.parse(iso);
const b = (id: string) => ({ id });

test('the pin is live before its date and gone on the day itself', () => {
  assert.ok(activePin(at('2026-09-17T23:59:59Z'), PIN));
  assert.equal(activePin(at('2026-09-18T00:00:00Z'), PIN), null, 'until is exclusive');
  assert.equal(activePin(at('2026-10-01T00:00:00Z'), PIN), null);
});

test('a malformed date expires rather than pinning forever', () => {
  assert.equal(activePin(at('2026-09-12T00:00:00Z'), { ...PIN, until: 'whenever' }), null);
});

test('no pin configured is not an error', () => {
  assert.equal(activePin(Date.now(), null), null);
  assert.deepEqual(withPinnedFeatured([b('a')], [b('a')], Date.now(), null).map((x) => x.id), ['a']);
});

test('a live pin puts its binder first and keeps the rest in order', () => {
  const out = withPinnedFeatured([b('a'), b('c')], [b('pinned'), b('a'), b('c')], at('2026-09-12T00:00:00Z'), PIN);
  assert.deepEqual(out.map((x) => x.id), ['pinned', 'a', 'c']);
});

test('a pinned binder that is ALSO earning likes appears once, not twice', () => {
  const out = withPinnedFeatured(
    [b('a'), b('pinned'), b('c')],
    [b('pinned'), b('a'), b('c')],
    at('2026-09-12T00:00:00Z'),
    PIN,
  );
  assert.deepEqual(out.map((x) => x.id), ['pinned', 'a', 'c']);
});

test('an expired pin returns the shelf exactly as it was ranked', () => {
  const ranked = [b('a'), b('c')];
  assert.deepEqual(
    withPinnedFeatured(ranked, [b('pinned'), ...ranked], at('2026-12-01T00:00:00Z'), PIN).map((x) => x.id),
    ['a', 'c'],
  );
});

test('a pin naming a binder that is not there leaves the shelf alone', () => {
  const out = withPinnedFeatured([b('a')], [b('a')], at('2026-09-12T00:00:00Z'), PIN);
  assert.deepEqual(out.map((x) => x.id), ['a']);
});

/** The shipped configuration, not a fixture: a wrong id here is a pin that silently does nothing. */
test('the shipped pin names the anniversary binder and expires within a fortnight', () => {
  assert.ok(FEATURED_PIN, 'nothing pinned; delete this test with the pin if that is deliberate');
  assert.equal(FEATURED_PIN!.binderId, 'anniv-thirty-years');
  const until = Date.parse(`${FEATURED_PIN!.until}T00:00:00Z`);
  assert.ok(!Number.isNaN(until), 'the until date must parse, or the pin never applies');
  assert.ok(
    until - Date.parse('2026-09-11T00:00:00Z') <= 14 * 86_400_000,
    'a pin this long stops being a moment and starts being a policy',
  );
});
