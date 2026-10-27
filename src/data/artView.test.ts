import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  ART_FULL_GAP_OVER_W,
  ART_FULL_H_OVER_W,
  ART_FULL_TRIM,
  ART_VIEWS,
  ART_WINDOW,
  ART_WINDOW_H_OVER_W,
  connectedCellAspect,
  connectedCut,
  fullArtPlacement,
  isFullArtCard,
  normalizeArtView,
  stockCardText,
  windowPlacement,
} from './artView.ts';

test('the column is read as a view or nothing', () => {
  assert.equal(normalizeArtView('window'), 'window');
  assert.equal(normalizeArtView('connected'), 'connected');
  assert.equal(normalizeArtView(null), undefined);
  assert.equal(normalizeArtView('stretch'), undefined);
  assert.equal(normalizeArtView(3), undefined);
});

test('every view the picker offers is one the column accepts, plus the plain card', () => {
  assert.deepEqual(ART_VIEWS.map((v) => v.id), ['card', 'window', 'connected']);
  for (const v of ART_VIEWS) assert.ok(v.label && v.blurb, `${v.id} needs a label and a blurb`);
});

test('the window is inside the card and wider than it is tall', () => {
  assert.ok(ART_WINDOW.x0 > 0 && ART_WINDOW.x1 < 1 && ART_WINDOW.y0 > 0 && ART_WINDOW.y1 < 1);
  assert.ok(ART_WINDOW.x1 > ART_WINDOW.x0 && ART_WINDOW.y1 > ART_WINDOW.y0);
  // Measured: about 0.60. A number far from that means someone changed the window and not the test.
  assert.ok(ART_WINDOW_H_OVER_W > 0.55 && ART_WINDOW_H_OVER_W < 0.65, `got ${ART_WINDOW_H_OVER_W}`);
});

test('the placement puts the window exactly over the box', () => {
  const box = 200;
  const p = windowPlacement(box);
  // The window's left edge lands on the box's left edge, and its right edge on the box's right.
  assert.ok(Math.abs(p.left + ART_WINDOW.x0 * p.width) < 1e-9);
  assert.ok(Math.abs(p.left + ART_WINDOW.x1 * p.width - box) < 1e-9);
  // Same for the top: the window's top lands on the box's top, and its height is the aspect's.
  assert.ok(Math.abs(p.top + ART_WINDOW.y0 * p.height) < 1e-9);
  assert.ok(Math.abs(p.top + ART_WINDOW.y1 * p.height - box * ART_WINDOW_H_OVER_W) < 1e-9);
  // The picture itself keeps the card's own proportions: no rescaling in one direction only.
  assert.ok(Math.abs(p.height / p.width - 88 / 63) < 1e-9);
});

test('full art is the catalogue flag first, then the kind', () => {
  assert.equal(isFullArtCard({ fullArt: true, fullArtKind: '' }), true);
  assert.equal(isFullArtCard({ fullArtKind: 'illustration_rare' }), true);
  assert.equal(isFullArtCard({ fullArtKind: 'double_rare' }), true);
  assert.equal(isFullArtCard({ fullArtKind: 'scene_tagged' }), false);
  assert.equal(isFullArtCard({ fullArtKind: '' }), false);
  assert.equal(isFullArtCard(undefined), false);
});

test('the stock card text leaves out what the catalogue does not know', () => {
  const t = stockCardText({
    name: 'Leavanny', types: ['Grass'], stage: 'Stage 2', seriesId: 'Sun & Moon', setName: 'Unified Minds',
    number: '9/236', illustrator: 'Kagemaru Himeno', releaseDate: '2019-08-02',
  });
  assert.equal(t.name, 'Leavanny');
  assert.equal(t.sub, 'No. 542 · Grass · Stage 2');
  assert.equal(t.dex, '542');
  assert.deepEqual(t.rows.map((r) => `${r.label}=${r.value}`), [
    'Series=Sun & Moon', 'Set=Unified Minds', 'Number=9/236', 'Illustrator=Kagemaru Himeno', 'Released=2019',
  ]);
  const bare = stockCardText({ name: 'Whismur', types: [], stage: '', seriesId: '', setName: 'Nintendo Promos', number: '019', illustrator: '', releaseDate: '' });
  assert.equal(bare.sub, 'No. 293', 'the dex number stands alone when the type and stage are unknown');
  const trainer = stockCardText({ name: 'Professor Oak', types: [], stage: '', seriesId: '', setName: 'Base', number: '88', illustrator: '', releaseDate: '' });
  assert.equal(trainer.sub, '');
  assert.equal(trainer.dex, '');
  assert.deepEqual(bare.rows.map((r) => r.label), ['Set', 'Number']);
  assert.equal(stockCardText(undefined, 'Unknown').name, 'Unknown');
});

test('the full-art cut takes the border and keeps the card proportions', () => {
  const box = 200;
  const p = fullArtPlacement(box);
  assert.ok(Math.abs(p.left + ART_FULL_TRIM.left * p.width) < 1e-9);
  assert.ok(Math.abs(p.left + (1 - ART_FULL_TRIM.right) * p.width - box) < 1e-9);
  assert.ok(Math.abs(p.top + ART_FULL_TRIM.top * p.height) < 1e-9);
  assert.ok(Math.abs(p.top + (1 - ART_FULL_TRIM.bottom) * p.height - box * ART_FULL_H_OVER_W) < 1e-9);
  assert.ok(Math.abs(p.height / p.width - 88 / 63) < 1e-9);
  // Nearly the card's own shape: the band is a few percent each side.
  assert.ok(ART_FULL_H_OVER_W > 1.38 && ART_FULL_H_OVER_W < 1.48, `got ${ART_FULL_H_OVER_W}`);
  // An art plus its gap is exactly one whole card: the sheet is the cards butted together.
  assert.ok(Math.abs(box * (1 + ART_FULL_GAP_OVER_W) - p.width) < 1e-9);
});

test('a connected page cuts whole only when every card it knows is full art', () => {
  const full = { fullArt: true, fullArtKind: 'scene_tagged' };
  const windowed = { fullArt: false, fullArtKind: '' };
  assert.equal(connectedCut([full, full, undefined]), 'full');
  assert.equal(connectedCut([full, windowed]), 'window');
  assert.equal(connectedCut([undefined, undefined]), 'window');
  assert.equal(connectedCut([]), 'window');
  assert.equal(connectedCellAspect('full'), ART_FULL_H_OVER_W);
  assert.equal(connectedCellAspect('window'), ART_WINDOW_H_OVER_W);
});

test('the art view resolves pocket over page over binder, and a stored card is the full card said out loud', async () => {
  const { resolveArtView, normalizeArtViewSetting, normalizePocketArtView, PAGE_ART_VIEWS, POCKET_ART_VIEWS } = await import('./artView.ts');
  assert.equal(resolveArtView(undefined, undefined, 'window'), 'window', 'the binder alone');
  assert.equal(resolveArtView(undefined, 'card', 'window'), undefined, 'a plain page inside a windowed binder');
  assert.equal(resolveArtView('window', 'card', undefined), 'window', 'a windowed pocket on a plain page');
  assert.equal(resolveArtView('card', 'window', 'window'), undefined, 'a whole card on a windowed page');
  assert.equal(resolveArtView(null, null, 'connected'), 'connected');
  assert.equal(resolveArtView(), undefined);
  assert.equal(normalizeArtViewSetting('card'), 'card');
  assert.equal(normalizeArtViewSetting('nope'), undefined);
  assert.equal(normalizePocketArtView('connected'), undefined, 'connected is a page shape, never a pocket choice');
  assert.deepEqual(PAGE_ART_VIEWS.map((v) => v.id), ['inherit', 'card', 'window', 'connected']);
  assert.deepEqual(POCKET_ART_VIEWS.map((v) => v.id), ['inherit', 'card', 'window']);
});
