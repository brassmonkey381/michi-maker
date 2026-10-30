import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { EMPTY_TASTES, mergeTastes, normalizeTastes, tasteOffered, tasteToast, TASTE_FEATURES } from './tastes.ts';

describe('tastes', () => {
  it('normalizes junk to nothing tasted and keeps only known features with a time', () => {
    assert.deepEqual(normalizeTastes(null), EMPTY_TASTES);
    assert.deepEqual(normalizeTastes('x'), EMPTY_TASTES);
    assert.deepEqual(normalizeTastes({ used: { artViews: '2026-10-29T00:00:00Z', fullPrint: '2026-10-29T00:00:00Z', binderTracks: 7 } }), {
      v: 1,
      used: { artViews: '2026-10-29T00:00:00Z' },
    });
  });

  it('merges as a union and keeps the earlier time', () => {
    const a = normalizeTastes({ used: { artViews: '2026-10-29T10:00:00Z' } });
    const b = normalizeTastes({ used: { artViews: '2026-10-29T09:00:00Z', findSimilar: '2026-10-29T11:00:00Z' } });
    assert.deepEqual(mergeTastes(a, b).used, { artViews: '2026-10-29T09:00:00Z', findSimilar: '2026-10-29T11:00:00Z' });
    assert.deepEqual(mergeTastes(b, a).used, mergeTastes(a, b).used);
  });

  it('offers a taste to a free account once, never to guests or paid tiers', () => {
    for (const f of TASTE_FEATURES) {
      assert.equal(tasteOffered('free', EMPTY_TASTES, f), true, f);
      assert.equal(tasteOffered('guest', EMPTY_TASTES, f), false, f);
      assert.equal(tasteOffered('pro', EMPTY_TASTES, f), false, f);
      assert.equal(tasteOffered('vip', EMPTY_TASTES, f), false, f);
      assert.equal(tasteOffered('free', normalizeTastes({ used: { [f]: '2026-10-29T00:00:00Z' } }), f), false, f);
    }
  });

  it('names the feature in the toast', () => {
    assert.match(tasteToast('binderTracks'), /Binder soundtracks/);
  });
});
