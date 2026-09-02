/**
 * What comes back out of storage is not what you put in.
 *
 * A stored preference is read from two places nobody controls tightly — AsyncStorage on a device
 * that has survived several releases, and a `profiles.preferences` JSON bag that a person can edit.
 * Two of these three pills reveal what someone owns, so "a truthy value turned a pill on" is not an
 * acceptable failure mode; the normalizer is the only thing standing between a stale shape and a
 * binder rendering somebody's collection detail because a string was in a boolean's place.
 *
 * It is also where the prefs epoch lands (see `prefsEpoch`), which is the harder thing to keep
 * honest: a rollout that forces a setting on has to force it exactly once, leave the settings it
 * does not name alone, and stop applying the moment its owner says otherwise. All three are tested
 * here, because the failure mode of getting them wrong is a preference that will not stay off.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { PREFS_EPOCH } from './prefsEpoch.ts';
import { VIEW_PREF_DEFAULTS, normalizeViewPrefs, storedViewPrefs } from './viewPrefs.ts';

/** A bag as this release writes it: the fields, plus the stamp saying the rollout is done. */
const stamped = (prefs: Record<string, unknown>) => ({ ...prefs, v: PREFS_EPOCH });

test('a well-formed stamped bag comes through as itself', () => {
  assert.deepEqual(
    normalizeViewPrefs(stamped({ owned: true, scans: false, doubleSided: true, navDock: 'left' })),
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

test('a partial stamped bag keeps what it says and defaults the rest', () => {
  // A release that adds a pill must not invalidate everyone's stored preference — which is exactly
  // what happened when navDock was added: every bag written before it is a partial bag now.
  assert.deepEqual(normalizeViewPrefs(stamped({ scans: true })), {
    owned: true,
    scans: true,
    doubleSided: true,
    navDock: 'left',
  });
});

test('a non-boolean is not an answer, however truthy', () => {
  // Owned and Scans expose what the viewer owns. "yes", 1 and {} are all truthy, and none of them
  // is a preference anyone expressed — each field falls back to its default instead of being read.
  // `scans` is the one that still discriminates now that the other two default on, and it is also
  // the one that matters most: it puts the viewer's own photographs on the page.
  assert.deepEqual(normalizeViewPrefs(stamped({ owned: 'yes', scans: 1, doubleSided: {} })), {
    ...VIEW_PREF_DEFAULTS,
  });
  assert.equal(normalizeViewPrefs(stamped({ scans: 'true' }))?.scans, false);
});

test('a falsy non-boolean is equally not an answer', () => {
  assert.deepEqual(
    normalizeViewPrefs(stamped({ owned: 0, scans: null, doubleSided: '' })),
    VIEW_PREF_DEFAULTS,
  );
});

test('navDock is an enum, so anything but the two known values is not an answer', () => {
  // A boolean guard would have let "right" or true through and put the rail somewhere that does
  // not exist. Every unknown falls back rather than being trusted.
  assert.equal(normalizeViewPrefs(stamped({ navDock: 'left' }))?.navDock, 'left');
  assert.equal(normalizeViewPrefs(stamped({ navDock: 'bottom' }))?.navDock, 'bottom');
  for (const bad of ['right', 'LEFT', true, 1, null, {}]) {
    assert.equal(
      normalizeViewPrefs(stamped({ navDock: bad }))?.navDock,
      'left',
      `navDock: ${String(bad)}`,
    );
  }
});

test('unknown keys are ignored rather than carried', () => {
  const out = normalizeViewPrefs(stamped({ owned: true, somethingElse: true }));
  assert.deepEqual(out, { owned: true, scans: false, doubleSided: true, navDock: 'left' });
  assert.equal('somethingElse' in (out as object), false);
});

test('the defaults are the binder as it is meant to read', () => {
  // Owned ticks, paired pages and the rail down the side. Scans stays off: it replaces catalogue
  // art with the viewer's own photographs, which is a real change to what a binder looks like and
  // not something to decide on anyone's behalf.
  assert.deepEqual(VIEW_PREF_DEFAULTS, {
    owned: true,
    scans: false,
    doubleSided: true,
    navDock: 'left',
  });
});

test('an unstamped bag gets the rollout, whatever it used to say', () => {
  // The whole point: these three were stored OFF by a previous release, and today everyone gets
  // them on. A default change alone would never have reached this bag.
  assert.deepEqual(
    normalizeViewPrefs({ owned: false, scans: false, doubleSided: false, navDock: 'bottom' }),
    { owned: true, scans: false, doubleSided: true, navDock: 'left' },
  );
});

test('the rollout leaves the settings it does not name alone', () => {
  // Scans is not part of it. Someone who turned it on keeps it on, and resetting the bag to the
  // new defaults would have quietly taken it away.
  assert.equal(normalizeViewPrefs({ scans: true, doubleSided: false })?.scans, true);
});

test('a stamped bag is never overridden — off stays off', () => {
  // Force-on has to be a nudge, not a lock. Once someone has saved a choice of their own, the
  // rollout is done with them, and a bag that says off has to keep saying off on every read.
  assert.deepEqual(
    normalizeViewPrefs(stamped({ owned: false, scans: false, doubleSided: false, navDock: 'bottom' })),
    { owned: false, scans: false, doubleSided: false, navDock: 'bottom' },
  );
});

test('what we write back carries the stamp', () => {
  // Without this the rollout re-applies on the next read and the choice above never sticks.
  const bag = storedViewPrefs({ owned: false, scans: false, doubleSided: false, navDock: 'bottom' });
  assert.equal(bag.v, PREFS_EPOCH);
  assert.deepEqual(normalizeViewPrefs(bag), {
    owned: false,
    scans: false,
    doubleSided: false,
    navDock: 'bottom',
  });
});

test('a stale stamp is treated as unstamped', () => {
  // A bag from a future release rolled back, or a hand-edited number. Anything that is not this
  // epoch has not been through this rollout.
  for (const v of [0, PREFS_EPOCH - 1, PREFS_EPOCH + 1, '1', true, null]) {
    assert.equal(
      normalizeViewPrefs({ owned: false, doubleSided: false, navDock: 'bottom', v })?.doubleSided,
      true,
      `v: ${String(v)}`,
    );
  }
});
