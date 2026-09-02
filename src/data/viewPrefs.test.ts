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
  assert.deepEqual(
    normalizeViewPrefs({ owned: true, scans: false, doubleSided: true, navDock: 'left' }),
    { owned: true, scans: false, doubleSided: true, navDock: 'left' },
  );
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
  // A release that adds a pill must not invalidate everyone's stored preference — which is exactly
  // what happened when navDock was added: every bag written before it is a partial bag now.
  assert.deepEqual(normalizeViewPrefs({ doubleSided: true }), {
    owned: false,
    scans: false,
    doubleSided: true,
    navDock: 'bottom',
  });
});

test('a truthy non-boolean does NOT switch a pill on', () => {
  // The one that matters: Owned and Scans expose what the viewer owns. "yes", 1 and {} are all
  // truthy, and none of them is a preference anyone expressed.
  assert.deepEqual(normalizeViewPrefs({ owned: 'yes', scans: 1, doubleSided: {} }), {
    ...VIEW_PREF_DEFAULTS,
  });
});

test('navDock is an enum, so anything but the two known values is not an answer', () => {
  // A boolean guard would have let "right" or true through and put the rail somewhere that does
  // not exist. Every unknown falls back rather than being trusted.
  assert.equal(normalizeViewPrefs({ navDock: 'left' })?.navDock, 'left');
  assert.equal(normalizeViewPrefs({ navDock: 'bottom' })?.navDock, 'bottom');
  for (const bad of ['right', 'LEFT', true, 1, null, {}]) {
    assert.equal(normalizeViewPrefs({ navDock: bad })?.navDock, 'bottom', `navDock: ${String(bad)}`);
  }
});

test('a falsy non-boolean is equally not an answer', () => {
  assert.deepEqual(normalizeViewPrefs({ owned: 0, scans: null, doubleSided: '' }), VIEW_PREF_DEFAULTS);
});

test('unknown keys are ignored rather than carried', () => {
  const out = normalizeViewPrefs({ owned: true, somethingElse: true });
  assert.deepEqual(out, { owned: true, scans: false, doubleSided: false, navDock: 'bottom' });
  assert.equal('somethingElse' in (out as object), false);
});

test('the defaults are all off, and the strip starts where it always was', () => {
  // Every toggle here reveals something about the viewer's collection, so the answer before anybody
  // has chosen is "show nothing extra" — and the strip defaults to the position it has always had,
  // because a layout that moves on upgrade is a bug however good the new position is.
  assert.deepEqual(VIEW_PREF_DEFAULTS, {
    owned: false,
    scans: false,
    doubleSided: false,
    navDock: 'bottom',
  });
});
