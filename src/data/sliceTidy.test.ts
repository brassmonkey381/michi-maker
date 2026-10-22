import assert from 'node:assert/strict';
import { test } from 'node:test';

import type { DemoBinder, DemoSlot } from './binderTypes.ts';
import type { SavedSlice } from './savedSlices.ts';
import { isSliceUsed, tidyGroups, usedSliceSignatures } from './sliceTidy.ts';

const slice = (id: string, imageUrl: string, extra: Partial<SavedSlice> = {}): SavedSlice => ({
  id,
  imageUrl,
  crop: { x: 0, y: 0, w: 0.5, h: 1 },
  rs: 1,
  cs: 1,
  ...extra,
});

const artSlot = (imageUrl: string, crop: DemoSlot['imageCrop']): DemoSlot =>
  ({ id: `s-${imageUrl}`, type: 'artwork', row: 0, col: 0, rowSpan: 1, colSpan: 1, imageUrl, imageCrop: crop }) as DemoSlot;

const binder = (slots: DemoSlot[]): DemoBinder =>
  ({ id: 'b', title: 'B', pages: [{ id: 'p', rows: 3, cols: 3, slots }] }) as unknown as DemoBinder;

test('a piece is used when any binder pocket shows the same image window', () => {
  const used = usedSliceSignatures([binder([artSlot('https://a.test/x.png', { x: 0, y: 0, w: 0.5, h: 1 })])]);
  assert.ok(isSliceUsed(slice('1', 'https://a.test/x.png'), used));
  assert.ok(!isSliceUsed(slice('2', 'https://a.test/x.png', { crop: { x: 0.5, y: 0, w: 0.5, h: 1 } }), used), 'other half of the picture');
  assert.ok(!isSliceUsed(slice('3', 'https://a.test/y.png'), used), 'other picture');
});

test('tidyGroups lists only pictures with unused pieces, most unused first, with the in-use count', () => {
  const used = usedSliceSignatures([binder([artSlot('https://a.test/x.png', { x: 0, y: 0, w: 0.5, h: 1 })])]);
  const groups = tidyGroups(
    [
      slice('1', 'https://a.test/x.png', { groupId: 'gx' }),
      slice('2', 'https://a.test/x.png', { groupId: 'gx', crop: { x: 0.5, y: 0, w: 0.5, h: 1 } }),
      slice('3', 'https://b.test/y.png', { groupId: 'gy', label: 'pexels.com' }),
      slice('4', 'https://b.test/y.png', { groupId: 'gy', crop: { x: 0.5, y: 0, w: 0.5, h: 1 } }),
      slice('5', 'https://c.test/z.png', { groupId: 'gz' }),
    ],
    used,
  );
  assert.deepEqual(groups.map((g) => [g.key, g.unused.length, g.usedCount]), [['gy', 2, 0], ['gx', 1, 1], ['gz', 1, 0]]);
  assert.equal(groups[0].name, 'pexels.com');
  assert.equal(groups[1].name, 'a.test');
});
