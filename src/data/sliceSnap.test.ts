/**
 * The snapping arithmetic, which is the part that is easy to get subtly wrong and impossible to
 * eyeball: an off-by-one-gap grid line or an inverted zoom anchor both LOOK like a slightly
 * awkward tool rather than like a bug, so they survive a manual pass.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  activeGuides,
  gridLines,
  snapAnchor,
  snapAxis,
  zoomWindow,
  SNAP_TOLERANCE_PX,
} from './sliceSnap.ts';

test('a gap has two edges, and both are places art can align to', () => {
  // 3 pockets of 100px with a 10px gap: pockets at 0..100, 110..210, 220..320.
  const lines = gridLines(3, 100, 10);
  assert.deepEqual(lines, [0, 100, 110, 160, 210, 220, 320]);
  // 160 is the canvas centre — the only line that is not a pocket edge.
});

test('a grid with no pockets, or pockets with no size, offers nothing to snap to', () => {
  assert.deepEqual(gridLines(0, 100, 10), []);
  assert.deepEqual(gridLines(3, 0, 10), []);
});

test('a single pocket still snaps to its own edges', () => {
  assert.deepEqual(gridLines(1, 200, 10), [0, 100, 200]);
});

test('the left edge of the art clicks onto a pocket edge', () => {
  // Window showing the middle half of the image, on a 320px canvas. The image's left edge (u=0)
  // is off-canvas to the left; nudge the window so it lands just shy of x=0 and it should click.
  const lines = gridLines(3, 100, 10);
  const size = 0.5;
  // Put u=0 at canvas 3px: ((0 - pos)/0.5)*320 = 3  =>  pos = -3*0.5/320
  const pos = (-3 * size) / 320;
  const snap = snapAxis(pos, size, 320, lines);
  assert.equal(snap.guide, 0);
  assert.ok(Math.abs(snap.value - 0) < 1e-12, `left edge flush, got ${snap.value}`);
});

test('nothing in reach means nothing moves', () => {
  const lines = gridLines(3, 100, 10);
  // u=0 at canvas 50px — 50 from the nearest line, way outside tolerance.
  const size = 0.5;
  const pos = (-50 * size) / 320;
  const snap = snapAxis(pos, size, 320, lines);
  assert.equal(snap.guide, null);
  assert.equal(snap.value, pos);
});

test('the tolerance is measured on screen, not in the image', () => {
  // The SAME 6px-on-canvas miss must snap whether the window is wide (zoomed out) or narrow
  // (zoomed in). In image fractions those two are an order of magnitude apart, and judging the
  // distance there would make the snap grab from a mile away at one zoom and never fire at the
  // other.
  const lines = [0];
  for (const size of [1, 0.1]) {
    const pos = (-6 * size) / 320;
    const snap = snapAxis(pos, size, 320, lines);
    assert.equal(snap.guide, 0, `size ${size} should snap`);
  }
});

test('just outside the tolerance does not snap, just inside does', () => {
  const lines = [0];
  const size = 1;
  const inside = snapAxis(((-SNAP_TOLERANCE_PX + 0.5) * size) / 320, size, 320, lines);
  const outside = snapAxis(((-SNAP_TOLERANCE_PX - 0.5) * size) / 320, size, 320, lines);
  assert.equal(inside.guide, 0);
  assert.equal(outside.guide, null);
});

test('the nearest line wins when two are in reach', () => {
  // Lines at 0 and 6; put the edge at 5 — both are within 7px, and 6 is nearer.
  const size = 1;
  const snap = snapAxis((-5 * size) / 320, size, 320, [0, 6]);
  assert.equal(snap.guide, 6);
});

test('the middle of the art can align too, not only its edges', () => {
  // u=0.5 just off the canvas centre line of a 320px canvas.
  const size = 1;
  const lines = [160];
  // ((0.5 - pos)/1)*320 = 157  =>  pos = 0.5 - 157/320
  const pos = 0.5 - 157 / 320;
  const snap = snapAxis(pos, size, 320, lines);
  assert.equal(snap.guide, 160);
  // Snapped, the centre lands exactly on the line.
  assert.ok(Math.abs((0.5 - snap.value) * 320 - 160) < 1e-9);
});

test('a canvas with no width snaps nothing rather than dividing by zero', () => {
  const snap = snapAxis(0.2, 0.5, 0, [0, 100]);
  assert.equal(snap.value, 0.2);
  assert.equal(snap.guide, null);
});

test('a window with no extent is left alone', () => {
  const snap = snapAxis(0.2, 0, 320, [0, 100]);
  assert.equal(snap.value, 0.2);
  assert.equal(snap.guide, null);
});

test('guides are read back off the window, so they cannot disagree with it', () => {
  const lines = gridLines(3, 100, 10);
  const snapped = snapAxis((-3 * 0.5) / 320, 0.5, 320, lines);
  // Two guides, not one: with the left edge on 0 and a window showing half the image, the image's
  // MIDDLE lands on 320 — the far edge of the last pocket — so both alignments are real and both
  // are worth drawing. Reading them off the window is what surfaces the second one at all.
  assert.deepEqual(activeGuides(snapped.value, 0.5, 320, lines), [0, 320]);
});

test('a window that is not aligned draws no guide', () => {
  const lines = gridLines(3, 100, 10);
  assert.deepEqual(activeGuides((-30 * 0.5) / 320, 0.5, 320, lines), []);
});

test('two features on two lines draw two guides', () => {
  // A window showing exactly the whole image on a canvas whose full width is a line: the left
  // edge sits on 0 and the right edge on the far line.
  const lines = [0, 320];
  assert.deepEqual(activeGuides(0, 1, 320, lines), [0, 320]);
});

test('zooming about the middle keeps the middle still', () => {
  const out = zoomWindow({ x: 0.25, y: 0.25, w: 0.5, h: 0.5 }, 0.5, 0.5, 0.5);
  assert.deepEqual(out, { x: 0.375, y: 0.375, w: 0.25, h: 0.25 });
  // The centre of the window is unchanged.
  assert.equal(out.x + out.w / 2, 0.5);
  assert.equal(out.y + out.h / 2, 0.5);
});

test('zooming about a corner keeps THAT corner still', () => {
  // The whole point of anchoring: the image point under the pointer must not move. Anchor at the
  // window's top-left (0,0) and the top-left image coordinate stays put.
  const out = zoomWindow({ x: 0.2, y: 0.3, w: 0.4, h: 0.4 }, 0.5, 0, 0);
  assert.equal(out.x, 0.2);
  assert.equal(out.y, 0.3);
});

test('the anchored point stays under the anchor for an arbitrary anchor', () => {
  const win = { x: 0.1, y: 0.1, w: 0.6, h: 0.6 };
  const ax = 0.73;
  const under = win.x + win.w * ax; // the image coordinate beneath the anchor, before
  const out = zoomWindow(win, 0.37, ax, ax);
  assert.ok(Math.abs(out.x + out.w * ax - under) < 1e-12);
});

test('a factor above one zooms OUT — the window grows', () => {
  // Inverted from how a person says it, and the one sign error that would make every control in
  // the studio work backwards.
  const out = zoomWindow({ x: 0.25, y: 0.25, w: 0.5, h: 0.5 }, 2, 0.5, 0.5);
  assert.equal(out.w, 1);
  assert.equal(out.x, 0);
});

test('nothing aligned means no anchor, and the caller falls back to the middle', () => {
  assert.equal(snapAnchor((-30 * 0.5) / 320, 0.5, 320, gridLines(3, 100, 10)), null);
});

test('an art edge flush with the canvas edge anchors the zoom there', () => {
  // Left edge on 0 -> anchor 0: the zoom grows to the RIGHT and the flush edge stays flush.
  assert.equal(snapAnchor(0, 0.5, 320, [0, 320]), 0);
});

test('a right-flush edge anchors on the right, so the art grows leftward', () => {
  // The image's right edge (u=1) sits at 320 when the window shows exactly the right half.
  assert.equal(snapAnchor(0.5, 0.5, 320, [320]), 1);
});

test('the near edge wins when both edges are on lines, because only one point can stay put', () => {
  // The whole image exactly fills the canvas: u=0 on 0 AND u=1 on 320. A scale cannot hold both.
  assert.equal(snapAnchor(0, 1, 320, [0, 320]), 0);
});

test('an edge beats the middle even when the middle is checked first elsewhere', () => {
  // IMAGE_FEATURES runs 0, 0.5, 1 — so a naive search would return the MIDDLE here and zoom about
  // the centre of a right-flush image, which is the whole bug this function exists to avoid.
  // u=0.5 sits at 160 and u=1 sits at 320; both are lines.
  assert.equal(snapAnchor(0.5, 0.5, 320, [160, 320]), 1);
});

test('the anchor really does hold the alignment through a zoom', () => {
  // The end-to-end claim, not just the lookup: snap, zoom about the anchor, and the edge that was
  // on the line is still on it.
  const lines = gridLines(3, 100, 10);
  const win = { x: 0, y: 0, w: 0.5, h: 0.5 };
  const ax = snapAnchor(win.x, win.w, 320, lines);
  assert.equal(ax, 0);
  const out = zoomWindow(win, 0.6, ax, ax);
  assert.ok(Math.abs(((0 - out.x) / out.w) * 320 - 0) < 1e-9, `left edge drifted to ${((0 - out.x) / out.w) * 320}`);
});

test('zooming about the middle would NOT have held it — the test above is not vacuous', () => {
  const win = { x: 0, y: 0, w: 0.5, h: 0.5 };
  const out = zoomWindow(win, 0.6, 0.5, 0.5);
  assert.ok(Math.abs(((0 - out.x) / out.w) * 320) > 1, 'centre zoom should move the flush edge');
});
