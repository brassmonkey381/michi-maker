import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  EMPTY_TASTES, GUEST_TASTE_FEATURES, guestTasteWall, mergeTastes, normalizeTastes, takeTaste, TASTE_CAP, TASTE_FEATURES,
  TASTE_KIND, tasteOffered, tastesLeft, tasteToast,
} from './tastes.ts';

const T = (n: number) => `2026-10-30T0${n}:00:00Z`;

describe('tastes', () => {
  it('normalizes junk and the old one-per-feature record to nothing tasted, and keeps only known features with times', () => {
    assert.deepEqual(normalizeTastes(null), EMPTY_TASTES);
    assert.deepEqual(normalizeTastes('x'), EMPTY_TASTES);
    assert.deepEqual(normalizeTastes({ v: 1, used: { artViews: T(1) } }), EMPTY_TASTES, 'v1 is the reset');
    assert.deepEqual(normalizeTastes({ v: 2, used: { artViews: [T(2), T(1), T(1)], fullPrint: [T(1)], binderTracks: 7, findSimilar: [] } }), {
      v: 2,
      used: { artViews: [T(1), T(2)] },
    });
  });

  it('merges as a union of every taste either side knows', () => {
    const a = normalizeTastes({ v: 2, used: { artViews: [T(1)] } });
    const b = normalizeTastes({ v: 2, used: { artViews: [T(1), T(3)], findSimilar: [T(2)] } });
    assert.deepEqual(mergeTastes(a, b).used, { artViews: [T(1), T(3)], findSimilar: [T(2)] });
    assert.deepEqual(mergeTastes(b, a).used, mergeTastes(a, b).used);
  });

  it('offers a free account three uses of each action, one visit of each switch, a guest one of the server lookups, paid tiers none', () => {
    assert.equal(TASTE_CAP.use.free, 3);
    assert.equal(TASTE_CAP.use.guest, 1);
    assert.equal(TASTE_CAP.visit.free, 1, 'owner, 2026-10-30: covers, soundtracks, art views, advanced search are one visit');
    assert.equal(TASTE_KIND.findSimilar, 'use');
    assert.equal(TASTE_KIND.fillPage, 'use');
    assert.equal(TASTE_KIND.binderCovers, 'visit');
    for (const f of TASTE_FEATURES) {
      assert.equal(tasteOffered('free', EMPTY_TASTES, f), true, f);
      assert.equal(tastesLeft('free', EMPTY_TASTES, f), TASTE_KIND[f] === 'use' ? 3 : 1, f);
      assert.equal(tasteOffered('guest', EMPTY_TASTES, f), GUEST_TASTE_FEATURES.includes(f), f);
      assert.equal(tasteOffered('pro', EMPTY_TASTES, f), false, f);
      assert.equal(tasteOffered('vip', EMPTY_TASTES, f), false, f);
    }
    let r = EMPTY_TASTES;
    r = takeTaste(r, 'findSimilar', T(1));
    assert.equal(tastesLeft('free', r, 'findSimilar'), 2);
    assert.equal(tastesLeft('guest', r, 'findSimilar'), 0, 'one shot for a guest');
    r = takeTaste(takeTaste(r, 'findSimilar', T(2)), 'findSimilar', T(3));
    assert.equal(tasteOffered('free', r, 'findSimilar'), false);
    assert.equal(tasteOffered('free', r, 'artViews'), true, 'per feature');
    assert.equal(tasteOffered('free', takeTaste(r, 'artViews', T(4)), 'artViews'), false, 'one visit of a switch');
  });

  it('names the feature in the toast, never PRO to a guest, and counts what is left for a free account', () => {
    assert.match(tasteToast('binderTracks'), /Binder soundtracks/);
    assert.match(tasteToast('findSimilar', 'free', 2), /2 samples remaining/);
    assert.match(tasteToast('findSimilar', 'free', 1), /1 sample remaining/);
    assert.doesNotMatch(tasteToast('findSimilar', 'free', 0), /remaining/);
    const guest = tasteToast('findSimilar', 'guest');
    assert.equal(guest, 'Keep using Find similar with a free account');
    assert.doesNotMatch(guest, /PRO/);
    // The fill toast names the method (owner, 2026-10-30: "Keep using Fill Same Pokemon with a free account").
    assert.equal(tasteToast('fillPage', 'guest', 0, 'Fill Same Pokemon'), 'Keep using Fill Same Pokemon with a free account');
    assert.equal(tasteToast('findSimilar', 'free', 2), 'Try PRO for FREE to keep using Find similar (2 samples remaining)');
    assert.doesNotMatch(tasteToast('findSimilar', 'free', 2), /free this visit/, 'owner, 2026-10-30');
    assert.equal(guestTasteWall('findSimilar'), 'Create a free account to keep using Find similar.');
    assert.equal(guestTasteWall('fillPage'), 'Create a free account to keep using Fill page.');
    assert.ok(GUEST_TASTE_FEATURES.includes('fillPage'), 'a guest gets one fill (owner, 2026-10-30)');
  });
});
