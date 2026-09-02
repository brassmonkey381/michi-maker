/**
 * The decoration list's invariants: a stored cover reads back as itself, a broken row is dropped
 * rather than guessed, the cap is a cap, and the list operations return the same array when
 * they did nothing — which is what stops a no-op from becoming a database write.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  MAX_DECORATIONS_PER_SURFACE,
  MIN_W,
  NEW_DECORATION_W,
  addDecoration,
  defaultName,
  defaultText,
  duplicateDecoration,
  legacyBox,
  moveDecoration,
  normalizeAngle,
  normalizeCover,
  patchDecoration,
  removeDecoration,
  rowToIndex,
  sliceToDecoration,
} from './coverDecorations.ts';
import type { BinderCover, CoverDecoration, CoverImageDecoration } from './binderTypes.ts';

const legacy = (id: string, extra: Partial<CoverImageDecoration> = {}): CoverImageDecoration => ({
  id,
  imageUrl: `https://x/${id}.png`,
  x: 0.5,
  y: 0.5,
  w: 0.34,
  ...extra,
});

const cover = (front: unknown[]): BinderCover => ({
  modelId: 'm',
  colourway: 'c',
  surfaces: { front: front as CoverDecoration[] },
});

test('a legacy sticker reads back as art, with no h added', () => {
  // The upgrade must not move anything already saved. h is the editor's decision on the first
  // transform; a read that added it would be a read that changed a picture.
  const out = normalizeCover(cover([legacy('a')])).surfaces!.front!;
  assert.equal(out.length, 1);
  assert.equal(out[0].kind, 'art');
  assert.equal('h' in out[0], false);
  assert.equal(out[0].x, 0.5);
});

test('rotation is normalised onto [0, 360)', () => {
  assert.equal(normalizeAngle(-15), 345);
  assert.equal(normalizeAngle(360), 0);
  assert.equal(normalizeAngle(725), 5);
  const out = normalizeCover(cover([legacy('a', { rot: -15 })])).surfaces!.front!;
  assert.equal(out[0].rot, 345);
});

test('a row that is not a decoration is dropped, and the rest survive', () => {
  const out = normalizeCover(
    cover([
      null,
      'nope',
      { id: 5, imageUrl: 'x', x: 0, y: 0, w: 0.3 }, // id not a string
      { id: 'nan', imageUrl: 'x', x: NaN, y: 0, w: 0.3 },
      { id: 'no-image', x: 0.5, y: 0.5, w: 0.3 }, // neither imageUrl nor cardId
      legacy('good'),
    ]),
  ).surfaces!.front!;
  assert.deepEqual(
    out.map((d) => d.id),
    ['good'],
  );
});

test('positions are clamped and widths bounded on read', () => {
  const out = normalizeCover(cover([legacy('a', { x: 1.5, y: -2, w: 9 })])).surfaces!.front!;
  assert.equal(out[0].x, 1);
  assert.equal(out[0].y, 0);
  assert.equal(out[0].w, 1.6);
  assert.equal(normalizeCover(cover([legacy('b', { w: 0.001 })])).surfaces!.front![0].w, MIN_W);
});

test('thirteen stored becomes twelve read', () => {
  const many = Array.from({ length: 13 }, (_, i) => legacy(`d${i}`));
  const out = normalizeCover(cover(many)).surfaces!.front!;
  assert.equal(out.length, MAX_DECORATIONS_PER_SURFACE);
  assert.equal(out[0].id, 'd0');
});

test('a surface with nothing valid on it is dropped, not kept empty', () => {
  const out = normalizeCover(cover([null, 'x']));
  assert.equal('front' in (out.surfaces ?? {}), false);
});

test('a text decoration is checked field by field, and a malformed one is dropped', () => {
  const good = { id: 't', kind: 'text', text: 'Hi', font: 'marker', size: 0.06, color: '#112233', x: 0.5, y: 0.5, w: 0.4, h: 0.1 };
  const out = normalizeCover(cover([good, { ...good, id: 'badcolour', color: 'red' }, { ...good, id: 'notext', text: 7 }])).surfaces!.front!;
  assert.deepEqual(out.map((d) => d.id), ['t']);
  const t = out[0];
  assert.equal(t.kind, 'text');
  if (t.kind === 'text') {
    assert.equal(t.font, 'marker');
    assert.equal(t.color, '#112233');
  }
});

test('an unknown font falls back rather than failing the row', () => {
  const out = normalizeCover(cover([{ id: 't', kind: 'text', text: 'Hi', font: 'comic', size: 0.06, color: '#000000', x: 0.5, y: 0.5, w: 0.4 }])).surfaces!.front!;
  assert.equal(out[0].kind === 'text' && out[0].font, 'sans');
});

test('addDecoration returns the SAME array at the cap, so nothing is written', () => {
  const full = Array.from({ length: MAX_DECORATIONS_PER_SURFACE }, (_, i) => legacy(`d${i}`));
  const out = addDecoration(full, legacy('one-more'));
  assert.equal(out, full);
  const notFull = full.slice(0, 5);
  assert.notEqual(addDecoration(notFull, legacy('ok')), notFull);
});

test('hidden layers still count toward the cap', () => {
  const full = Array.from({ length: MAX_DECORATIONS_PER_SURFACE }, (_, i) => legacy(`d${i}`, { hidden: true }));
  assert.equal(addDecoration(full, legacy('x')), full);
});

test('duplicate makes a new id, nudged, named, and respects the cap', () => {
  const items = [legacy('a', { name: 'Logo' })];
  const out = duplicateDecoration(items, 'a');
  assert.equal(out.length, 2);
  assert.notEqual(out[1].id, 'a');
  assert.ok(Math.abs(out[1].x - 0.52) < 1e-9);
  assert.equal(out[1].name, 'Logo copy');
  const full = Array.from({ length: MAX_DECORATIONS_PER_SURFACE }, (_, i) => legacy(`d${i}`));
  assert.equal(duplicateDecoration(full, 'd0'), full);
});

test('move keeps bottom-first order and is a no-op at its own index', () => {
  const items = ['a', 'b', 'c', 'd'].map((id) => legacy(id));
  assert.equal(moveDecoration(items, 'b', 1), items);
  assert.deepEqual(moveDecoration(items, 'd', 0).map((d) => d.id), ['d', 'a', 'b', 'c']);
  assert.deepEqual(moveDecoration(items, 'a', 99).map((d) => d.id), ['b', 'c', 'd', 'a']);
  assert.equal(moveDecoration(items, 'zzz', 0), items);
});

test('patch and remove return the same array when nothing matched', () => {
  const items = [legacy('a')];
  assert.equal(patchDecoration(items, 'nope', { x: 0.1 }), items);
  assert.equal(removeDecoration(items, 'nope'), items);
  const patched = patchDecoration(items, 'a', { rot: -30 });
  assert.equal(patched[0].rot, 330);
  assert.equal(removeDecoration(items, 'a').length, 0);
});

test('legacyBox: a landscape image keeps its width; a portrait one keeps its height', () => {
  const d = legacy('a', { w: 0.34 });
  assert.deepEqual(legacyBox(d, { w: 200, h: 100 }), { w: 0.34, h: 0.17, aspect: 2 });
  const p = legacyBox(d, { w: 100, h: 200 });
  assert.ok(Math.abs(p.w! - 0.17) < 1e-9);
  assert.equal(p.h, 0.34);
  // Unknown size: a square, exactly the old picture.
  assert.deepEqual(legacyBox(d), { w: 0.34, h: 0.34 });
  // Already boxed: untouched.
  assert.deepEqual(legacyBox(legacy('b', { w: 0.2, h: 0.3, aspect: 0.6 })), { w: 0.2, h: 0.3, aspect: 0.6 });
});

test('sliceToDecoration: the quarter-turn lands in rot, and h follows the cropped window', () => {
  const d = sliceToDecoration(
    { imageUrl: 'u', crop: { x: 0, y: 0, w: 0.5, h: 1 }, transform: { rot: 90, flipH: true }, rs: 1, cs: 2 },
    { w: 400, h: 200 }, // natural aspect 2; cropped to half the width => square
  );
  assert.equal(d.kind, 'art');
  assert.equal(d.rot, 90);
  assert.equal(d.flipH, true);
  assert.equal(d.w, NEW_DECORATION_W);
  assert.ok(Math.abs(d.h! - NEW_DECORATION_W) < 1e-9, `h ${d.h}`);
  assert.deepEqual(d.crop, { x: 0, y: 0, w: 0.5, h: 1 });
});

test('sliceToDecoration without a natural size uses the pocket footprint', () => {
  const d = sliceToDecoration({ imageUrl: 'u', rs: 1, cs: 2 });
  // Two pockets wide, one tall: 88 / 126 of the width.
  assert.ok(Math.abs(d.h! - (NEW_DECORATION_W * 88) / 126) < 1e-9);
  assert.equal('rot' in d, false);
});

test('defaultName forms', () => {
  assert.equal(defaultName(legacy('a'), 2), 'Art 3');
  assert.equal(defaultName(legacy('a', { kind: 'sticker' }), 0), 'Sticker 1');
  assert.equal(defaultName({ ...defaultText(), text: 'one two three four five' }, 0), 'Text · “one two three four”');
  assert.equal(defaultName({ ...defaultText(), text: '   ' }, 0), 'Text');
  assert.equal(defaultName(legacy('a', { name: 'Mine' }), 0), 'Mine');
});

test('a fresh text box is valid by its own normaliser', () => {
  const out = normalizeCover(cover([defaultText()])).surfaces!.front!;
  assert.equal(out.length, 1);
  assert.equal(out[0].kind, 'text');
});

test('rowToIndex: the top row is the last array element', () => {
  assert.equal(rowToIndex(4, 0), 3);
  assert.equal(rowToIndex(4, 3), 0);
  const items = ['a', 'b', 'c'].map((id) => legacy(id));
  const rows = [...items].reverse();
  assert.equal(items[rowToIndex(items.length, 0)].id, rows[0].id);
});

test('a background saved by its old one-list name reads as a Normal surface with that edge', () => {
  const t = (shape: string) => ({ id: 't', kind: 'text', text: 'x', font: 'sans', size: 0.05, color: '#000000', x: 0.5, y: 0.5, w: 0.3, bg: { shape, color: '#ffffff' } });
  const read = (shape: string) => {
    const d = normalizeCover(cover([t(shape)])).surfaces!.front![0];
    return d.kind === 'text' ? d.bg : undefined;
  };
  assert.deepEqual(read('rect'), { shape: 'normal', edge: 'square', color: '#ffffff' });
  assert.deepEqual(read('rounded'), { shape: 'normal', edge: 'rounded', color: '#ffffff' });
  assert.deepEqual(read('circle'), { shape: 'normal', edge: 'circle', color: '#ffffff' });
  // A surface that never was an edge keeps its own corners: no edge written.
  assert.deepEqual(read('postit'), { shape: 'postit', color: '#ffffff' });
  // An edge on a surface is kept as an edge.
  const d = normalizeCover(cover([{ ...t('postit'), bg: { shape: 'postit', edge: 'rounded', color: '#ffffff' } }])).surfaces!.front![0];
  assert.deepEqual(d.kind === 'text' ? d.bg : null, { shape: 'postit', edge: 'rounded', color: '#ffffff' });
});
