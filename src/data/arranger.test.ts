/**
 * The arranger is one score the owner tunes by eye; what is worth pinning is that each term
 * reads what it says on a page shaped like the real ones, that nothing is dropped, and that the
 * answer is the same every time.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { ART_TEMPLATES } from './artTemplates.ts';
import { type ArrangeCard, cardCells, connectedPairs } from './arrange.ts';
import { ARRANGER_WEIGHTS, arrangePage, scoreTerms, totalScore } from './arranger.ts';

const lab = (L: number, a: number, b: number) => [{ L, a, b, w: 1 }];
const card = (id: string, over: Partial<ArrangeCard> = {}): ArrangeCard => ({ id, name: id, ...over });
const ctx3x3 = (cards: ArrangeCard[]) => ({ cells: cardCells(3, 3, false, new Set<string>()), rows: 3, cols: 3, spread: false, pairs: connectedPairs(cards) });

/** Three sky, three ground, three underground, all windowed, one line (fire1 → fire2) on the ground. */
function strataPage(): ArrangeCard[] {
  return [
    card('sky1', { depthWords: ['scene:sky'], types: ['Water'], palette: lab(80, 0, -20) }),
    card('sky2', { depthWords: ['scene:clouds'], types: ['Water'], palette: lab(82, 0, -18) }),
    card('sky3', { depthWords: ['action:flying'], types: ['Colorless'], palette: lab(85, 2, -10) }),
    card('fire1', { depthWords: ['scene:field'], types: ['Fire'], evolutionLine: ['a', 'b'], evolutionStage: 1, palette: lab(50, 40, 40) }),
    card('fire2', { depthWords: ['scene:field'], types: ['Fire'], evolutionLine: ['a', 'b'], evolutionStage: 2, palette: lab(48, 42, 38) }),
    card('grass1', { depthWords: ['scene:meadow'], types: ['Grass'], palette: lab(55, -40, 30) }),
    card('cave1', { depthWords: ['scene:cave'], types: ['Fighting'], palette: lab(20, 5, 5) }),
    card('cave2', { depthWords: ['scene:underground'], types: ['Fighting'], palette: lab(22, 6, 4) }),
    card('cave3', { depthWords: ['scene:cave'], types: ['Darkness'], palette: lab(18, 2, 2) }),
  ];
}

test('terms: a pure strata page with its line in order scores depth 1 and lines 1', () => {
  const cards = strataPage();
  const ctx = ctx3x3(cards);
  // Row 0 sky, row 1 fire1 fire2 grass1, row 2 caves.
  const seating = ['sky1', 'sky2', 'sky3', 'fire1', 'fire2', 'grass1', 'cave1', 'cave2', 'cave3'].map((id) => cards.find((c) => c.id === id)!);
  const t = scoreTerms(seating, ctx, 9, undefined, cards);
  assert.equal(t.depth, 1);
  assert.equal(t.lines, 1);
  assert.equal(t.held, 0);
  assert.equal(t.open, 0);
  assert.ok(t.type !== null, 'a windowed page has a type term');
  // Upside down: the same rows reversed keep purity but lose the order.
  const upside = [...seating.slice(6), ...seating.slice(3, 6), ...seating.slice(0, 3)];
  const u = scoreTerms(upside, ctx, 9, undefined, cards);
  assert.ok(u.depth! < t.depth!);
  // The line split across rows loses its term.
  const split = [...seating];
  [split[3], split[8]] = [split[8], split[3]];
  assert.equal(scoreTerms(split, ctx, 9, undefined, cards).lines, 0);
});

test('terms: similarity reads neighbours and rows; absent when there is no data', () => {
  const cards = strataPage();
  const ctx = ctx3x3(cards);
  const seating = cards;
  const none = scoreTerms(seating, ctx, 9, undefined, cards);
  assert.equal(none.similar, null);
  assert.equal(none.rowSimilar, null);
  const sim = new Map<string, Map<string, number>>();
  const link = (a: string, b: string, v: number) => {
    sim.set(a, new Map([...(sim.get(a) ?? []), [b, v]]));
    sim.set(b, new Map([...(sim.get(b) ?? []), [a, v]]));
  };
  link('sky1', 'sky2', 0.9);
  link('sky2', 'sky3', 0.8);
  const some = scoreTerms(seating, ctx, 9, sim, cards);
  assert.ok(some.similar! > 0 && some.rowSimilar! > 0);
  assert.ok(totalScore(some, ARRANGER_WEIGHTS) > totalScore(none, ARRANGER_WEIGHTS));
});

test('arranger: the answer seats every card or sends it to the tray, is deterministic, and reads the page', () => {
  const cards = strataPage();
  const t0 = performance.now();
  const a = arrangePage({ rows: 3, cols: 3, spread: false, cards, templates: ART_TEMPLATES })!;
  const ms = performance.now() - t0;
  assert.ok(a, 'an answer');
  assert.ok(ms < 1500, `fast enough on a 3x3 with every template: ${ms.toFixed(0)} ms`);
  const b = arrangePage({ rows: 3, cols: 3, spread: false, cards, templates: ART_TEMPLATES })!;
  assert.deepEqual(a.best.placements, b.best.placements);
  for (const take of [a.best, ...a.alternates]) {
    const ids = new Set([...take.placements.map((p) => p.cardId), ...take.held.map((h) => h.id)]);
    assert.equal(ids.size, cards.length, `${take.name}: nothing dropped`);
  }
  assert.ok(a.best.reason.length > 0);
  assert.ok(a.alternates.length >= 1, 'another take is offered');
  assert.notDeepEqual(a.alternates[0].placements, a.best.placements);
});

test('arranger: on the plain 3x3 the answer keeps the depth rows and the line together', () => {
  const cards = strataPage();
  const a = arrangePage({ rows: 3, cols: 3, spread: false, cards, templates: [] })!;
  assert.equal(a.best.template, null);
  assert.ok(a.best.terms.depth! >= 0.75, `depth ${a.best.terms.depth}`);
  assert.equal(a.best.terms.lines, 1);
  assert.equal(a.best.held.length, 0);
});

test('arranger: connected art stays adjacent whatever the weights', () => {
  const cards = strataPage().map((c) => (c.id === 'cave1' ? { ...c, name: 'Legend (Top)' } : c.id === 'sky1' ? { ...c, name: 'Legend (Bottom)' } : c));
  const a = arrangePage({ rows: 3, cols: 3, spread: false, cards, templates: [], weights: { depth: 5 } })!;
  const at = (id: string) => a.best.placements.find((p) => p.cardId === id)!.cell;
  const top = at('cave1');
  const bottom = at('sky1');
  assert.equal(bottom.col, top.col);
  assert.equal(bottom.row, top.row + 1);
});
