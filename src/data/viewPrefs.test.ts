/**
 * What comes back out of storage is not what you put in.
 *
 * A stored preference is read from two places nobody controls tightly — AsyncStorage on a device
 * that has survived several releases, and a `profiles.preferences` JSON bag that a person can edit.
 * Two of these three pills reveal what someone owns, so "a truthy value turned a pill on" is not an
 * acceptable failure mode; the normalizer is the only thing standing between a stale shape and a
 * binder rendering somebody's collection detail because a string was in a boolean's place.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { VIEW_PREF_DEFAULTS, normalizeViewPrefs } from './viewPrefs.ts';

test('a well-formed bag comes through as itself', () => {
  assert.deepEqual(normalizeViewPrefs({ owned: true, scans: false, doubleSided: true }), {
    owned: true,
    scans: false,
    doubleSided: true,
  });
});

test('nothing at all is absent, not empty — the next source gets its say', () => {
  // Returning defaults here rather than null would let a missing device entry outrank the account,
  // which is the precedence chain backwards.
  assert.equal(normalizeViewPrefs(null), null);
  assert.equal(normalizeViewPrefs(undefined), null);
  assert.equal(normalizeViewPrefs({}), null);
  assert.equal(normalizeViewPrefs('doubleSided'), null);
  assert.equal(normalizeViewPrefs(42), null);
});

test('an array is not a preference bag', () => {
  // typeof [] === 'object', so without the check a stored array would be read field by field and
  // come back as a bag of defaults that outranks the account.
  assert.equal(normalizeViewPrefs([]), null);
  assert.equal(normalizeViewPrefs([{ owned: true }]), null);
});

test('a partial bag keeps what it says and defaults the rest', () => {
  // A release that adds a pill must not invalidate everyone's stored preference.
  assert.deepEqual(normalizeViewPrefs({ doubleSided: true }), {
    owned: false,
    scans: false,
    doubleSided: true,
  });
});

test('a truthy non-boolean does NOT switch a pill on', () => {
  // The one that matters: Owned and Scans expose what the viewer owns. "yes", 1 and {} are all
  // truthy, and none of them is a preference anyone expressed.
  assert.deepEqual(normalizeViewPrefs({ owned: 'yes', scans: 1, doubleSided: {} }), {
    owned: false,
    scans: false,
    doubleSided: false,
  });
});

test('a falsy non-boolean is equally not an answer', () => {
  assert.deepEqual(normalizeViewPrefs({ owned: 0, scans: null, doubleSided: '' }), VIEW_PREF_DEFAULTS);
});

test('unknown keys are ignored rather than carried', () => {
  const out = normalizeViewPrefs({ owned: true, somethingElse: true });
  assert.deepEqual(out, { owned: true, scans: false, doubleSided: false });
  assert.equal('somethingElse' in (out as object), false);
});

test('the defaults are all off', () => {
  // Every one of these reveals something about the viewer's collection, so the answer before
  // anybody has chosen is "show nothing extra".
  assert.deepEqual(VIEW_PREF_DEFAULTS, { owned: false, scans: false, doubleSided: false });
});
