/**
 * The box arithmetic, pinned. These are the numbers a finger on a handle produces, so each one is
 * stated as a picture: "the far corner stays put", "the rotate grab sits above the top edge and
 * turns with the box", "a rotated box snaps its centre and nothing else".
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  ROTATE_HANDLE_OFFSET,
  SEAM_INSET,
  applyCrop,
  boxToDecoration,
  cursorFor,
  decorationBox,
  handlePoints,
  pointerAngle,
  resizeBox,
  rotateBox,
  snapAngle,
  snapBox,
  surfaceLines,
  type Box,
} from './coverGeometry.ts';
import type { CoverImageDecoration } from './binderTypes.ts';

const near = (a: number, b: number, eps = 1e-6) => assert.ok(Math.abs(a - b) < eps, `${a} vs ${b}`);
const box = (o: Partial<Box> = {}): Box => ({ cx: 200, cy: 150, w: 100, h: 60, rot: 0, ...o });

test('decorationBox: a legacy row is the old w×w square; h is in WIDTH units', () => {
  const legacy = decorationBox({ id: 'a', x: 0.5, y: 0.5, w: 0.34, imageUrl: 'u' }, 400, 300);
  assert.deepEqual(legacy, { cx: 200, cy: 150, w: 136, h: 136, rot: 0 });
  // h 0.2 on a 400-wide surface is 80px whatever the height is.
  assert.equal(decorationBox({ id: 'a', x: 0.5, y: 0.5, w: 0.3, h: 0.2, imageUrl: 'u' }, 400, 300).h, 80);
  assert.equal(decorationBox({ id: 'a', x: 0.5, y: 0.5, w: 0.3, h: 0.2, imageUrl: 'u' }, 400, 900).h, 80);
});

test('boxToDecoration is the inverse, and normalises the angle', () => {
  const d = boxToDecoration({ cx: 100, cy: 75, w: 80, h: 40, rot: -30 }, 400, 300);
  assert.deepEqual(d, { x: 0.25, y: 0.25, w: 0.2, h: 0.1, rot: 330 });
});

test('handlePoints: at 90° the east handle sits below the centre, and the rotate grab turns too', () => {
  const p = handlePoints(box({ rot: 90 }));
  // The box's own +x (east) points down the screen once turned a quarter clockwise.
  near(p.e.x, 200);
  near(p.e.y, 150 + 50);
  // The rotate grab is above the top edge in the box's frame: to the RIGHT on screen at 90°.
  near(p.rotate.y, 150);
  near(p.rotate.x, 200 + 30 + ROTATE_HANDLE_OFFSET);
  const flat = handlePoints(box());
  near(flat.rotate.x, 200);
  near(flat.rotate.y, 150 - 30 - ROTATE_HANDLE_OFFSET);
});

test('resizeBox from a corner keeps the opposite corner fixed', () => {
  const b = box();
  const before = handlePoints(b).nw;
  const after = resizeBox(b, 'se', 20, 12, { keepAspect: true, fromCentre: false, minPx: 8 });
  const afterNw = handlePoints(after).nw;
  near(afterNw.x, before.x);
  near(afterNw.y, before.y);
  // Aspect held: 100:60.
  near(after.w / after.h, 100 / 60);
});

test('resizeBox from an edge only changes that axis, anchored on the far edge', () => {
  const b = box();
  const after = resizeBox(b, 'e', 30, 99, { keepAspect: true, fromCentre: false, minPx: 8 });
  assert.equal(after.w, 130);
  assert.equal(after.h, 60);
  near(handlePoints(after).w.x, handlePoints(b).w.x);
});

test('resizeBox fromCentre keeps the centre and grows both sides', () => {
  const after = resizeBox(box(), 'e', 10, 0, { keepAspect: false, fromCentre: true, minPx: 8 });
  assert.equal(after.cx, 200);
  assert.equal(after.cy, 150);
  assert.equal(after.w, 120);
});

test('resizeBox on a rotated box works in the box frame', () => {
  // At 90° the "east" handle is below the centre; dragging straight DOWN on screen widens it.
  const b = box({ rot: 90 });
  const after = resizeBox(b, 'e', 0, 20, { keepAspect: false, fromCentre: false, minPx: 8 });
  near(after.w, 120);
  near(after.h, 60);
  near(after.rot, 90);
});

test('resizeBox floors at minPx, and a floored corner keeps its aspect', () => {
  const after = resizeBox(box(), 'se', -500, -500, { keepAspect: true, fromCentre: false, minPx: 12 });
  assert.ok(after.w >= 12 && after.h >= 12);
  near(after.w / after.h, 100 / 60);
});

test('snapAngle: 13.5 pulls to 15, 20 stays 20', () => {
  assert.equal(snapAngle(13.5), 15);
  assert.equal(snapAngle(20), 20);
  assert.equal(snapAngle(88), 90);
});

test('rotateBox: sweeping the pointer a quarter turn adds ninety degrees; Shift constrains', () => {
  const b = box({ rot: 10 });
  const angle0 = pointerAngle(b, { x: 300, y: 150 }); // due east
  const turned = rotateBox(b, { x: 200, y: 250 }, { angle0, rot0: 10 }, { constrain: false }); // due south
  near(turned.rot, 100);
  const snapped = rotateBox(b, { x: 200 + 100 * Math.cos(0.82), y: 150 + 100 * Math.sin(0.82) }, { angle0, rot0: 0 }, { constrain: true });
  assert.equal(snapped.rot % 15, 0);
});

test('surfaceLines: edges, seam, centre — then a grid, then the neighbours', () => {
  const base = surfaceLines(400, 300, { seam: 18, grid: null, others: [] });
  assert.deepEqual(base.x, [0, 18, 200, 382, 400]);
  assert.deepEqual(base.y, [0, 18, 150, 282, 300]);
  const grid = surfaceLines(400, 300, { seam: 18, grid: 8, others: [] });
  assert.ok(grid.x.includes(50) && grid.x.includes(350));
  const withOther = surfaceLines(400, 300, { seam: 18, grid: null, others: [box({ cx: 100, cy: 100, w: 40, h: 20 })] });
  assert.ok(withOther.x.includes(80) && withOther.x.includes(100) && withOther.x.includes(120));
  // A rotated neighbour offers only its centre.
  const rotated = surfaceLines(400, 300, { seam: 18, grid: null, others: [box({ cx: 100, cy: 100, w: 40, h: 20, rot: 30 })] });
  assert.ok(rotated.x.includes(100) && !rotated.x.includes(80));
  assert.equal(SEAM_INSET * 400, 18);
});

test('snapBox: an edge five pixels from a line snaps, nine does not', () => {
  const lines = { x: [0, 200, 400], y: [0, 150, 300] };
  const close = snapBox(box({ cx: 55, cy: 999 }), lines); // left edge at 5
  near(close.box.cx, 50);
  assert.equal(close.guideX, 0);
  const far = snapBox(box({ cx: 59, cy: 999 }), lines); // left edge at 9
  assert.equal(far.box.cx, 59);
  assert.equal(far.guideX, null);
});

test('snapBox: a rotated box moves only its centre', () => {
  const lines = { x: [0, 200, 400], y: [0, 150, 300] };
  // Left edge would be at 5 if it were axis-aligned; it is not, so that edge is no target.
  const r = snapBox(box({ cx: 55, cy: 152, rot: 30 }), lines);
  assert.equal(r.guideX, null);
  near(r.box.cy, 150);
  assert.equal(r.guideY, 150);
});

test('applyCrop narrows the window, shrinks the box, and keeps the pixels where they were', () => {
  const d: CoverImageDecoration = { id: 'a', imageUrl: 'u', x: 0.5, y: 0.5, w: 0.4, h: 0.2 };
  const out = applyCrop(d, { l: 0.25, t: 0.25, r: 0.75, b: 0.75 }, 4 / 3);
  assert.deepEqual(out.crop, { x: 0.25, y: 0.25, w: 0.5, h: 0.5 });
  near(out.w, 0.2);
  near(out.h, 0.1);
  // The kept rectangle was centred, so the centre does not move.
  near(out.x, 0.5);
  near(out.y, 0.5);
  // Cropping again composes.
  const again = applyCrop(out, { l: 0, t: 0, r: 0.5, b: 1 }, 4 / 3);
  assert.deepEqual(again.crop, { x: 0.25, y: 0.25, w: 0.25, h: 0.5 });
  near(again.w, 0.1);
});

test('applyCrop of an off-centre rectangle moves the centre, with y scaled by the surface aspect', () => {
  const d: CoverImageDecoration = { id: 'a', imageUrl: 'u', x: 0.5, y: 0.5, w: 0.4, h: 0.2 };
  // Keep the right half: the new centre is a quarter of the old width to the right.
  const out = applyCrop(d, { l: 0.5, t: 0, r: 1, b: 1 }, 2);
  near(out.x, 0.5 + 0.1);
  near(out.y, 0.5);
  // Keep the bottom half: a quarter of the old HEIGHT down, in width units, times W/H.
  const down = applyCrop(d, { l: 0, t: 0.5, r: 1, b: 1 }, 2);
  near(down.y, 0.5 + 0.05 * 2);
});

test('cursorFor turns with the box', () => {
  assert.equal(cursorFor('n', 0), 'ns-resize');
  assert.equal(cursorFor('n', 90), 'ew-resize');
  assert.equal(cursorFor('ne', 0), 'nesw-resize');
  assert.equal(cursorFor('ne', 90), 'nwse-resize');
});
