/**
 * Arrange is a set of product rules a binder maker would check by eye, written as code; what is
 * worth testing is that each rule holds on a page shaped like the real ones, not that a function
 * does what it says. The rules (docs/ARRANGE.md):
 *
 *  - Strata: a row owns its depth's words and no other row shows them; the FIRST depth word
 *    decides the band (a bird over a volcano is a sky card); nothing is borrowed across bands.
 *  - Lines: a line's stages share a row, adjacent, ascending.
 *  - Connected art is adjacent in every mode.
 *  - No card is ever dropped: seated + held is the whole page.
 *  - The sheet is diverse and starts with the page as it is.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { ART_TEMPLATES } from './artTemplates.ts';
import {
  type ArrangeCard,
  type Cell,
  DEFAULT_TUNING,
  artClassOf,
  arrangeCandidates,
  bandRows,
  cardCells,
  cellKey,
  connectedPairs,
  depthOf,
  depthTagQuery,
  flowRoughness,
  movesFor,
  pageArtMix,
  seatFlow,
  seatLines,
  seatMirror,
  seatStrata,
  templateCells,
} from './arrange.ts';

const lab = (L: number, a: number, b: number) => [{ L, a, b, w: 1 }];

function card(id: string, over: Partial<ArrangeCard> = {}): ArrangeCard {
  return { id, name: id, ...over };
}

/** Eight sky, eight ground, eight underground: a 3x4 spread's worth, with two transitions. */
function lavaPool(): ArrangeCard[] {
  const out: ArrangeCard[] = [];
  for (let i = 0; i < 8; i += 1) {
    out.push(card(`sky${i}`, { depthWords: i < 2 ? ['action:flying', 'scene:volcano'] : ['scene:sky'], palette: lab(70 + i, 10, -20 + i) }));
    out.push(card(`ground${i}`, { depthWords: ['scene:volcano', 'scene:clouds'], palette: lab(40 + i, 30, 30) }));
    out.push(card(`cave${i}`, { depthWords: ['scene:cave'], palette: lab(15 + i, 5, 5) }));
  }
  return out;
}

const spread = { rows: 3, cols: 4, spread: true };
const ctxFor = (cards: ArrangeCard[], reserved = new Set<string>()) => ({
  cells: cardCells(spread.rows, spread.cols, spread.spread, reserved),
  rows: spread.rows,
  cols: spread.cols,
  spread: spread.spread,
  pairs: connectedPairs(cards),
});

test('the first depth word decides the band; a later foreign word only marks a transition', () => {
  assert.deepEqual(depthOf({ depthWords: ['action:flying', 'scene:volcano'] }), { depth: 'above', partly: 'surface' });
  assert.deepEqual(depthOf({ depthWords: ['scene:volcano', 'scene:sky', 'scene:cave'] }), { depth: 'surface', partly: 'above' });
  assert.deepEqual(depthOf({ depthWords: ['cave'] }), { depth: 'below', partly: null });
  assert.deepEqual(depthOf({ depthWords: [] }), { depth: null, partly: null });
  // Rocks and smoke are not depth words.
  assert.deepEqual(depthOf({ depthWords: ['scene:rocks', 'object:smoke'] }), { depth: null, partly: null });
});

test('the depth query is namespaced, as score_cards_by_theme requires', () => {
  const q = depthTagQuery();
  assert.ok(q.length > 40);
  for (const t of q) assert.match(t, /^[a-z]+:.+/);
  assert.ok(q.includes('scene:sky') && q.includes('action:flying') && q.includes('scene:cave'));
});

test('strata: every row holds one depth and nothing is borrowed across bands', () => {
  const cards = lavaPool();
  const ctx = ctxFor(cards);
  const res = seatStrata(cards, ctx)!;
  assert.ok(res);
  const rows = bandRows(3);
  res.seating.forEach((c, i) => {
    if (!c) return;
    const r = ctx.cells[i].row;
    const d = depthOf(c).depth!;
    assert.ok(rows[d].includes(r), `${c.id} sits in row ${r}, which is not a ${d} row`);
  });
  assert.equal(res.held.length, 0);
  assert.equal(res.seating.filter(Boolean).length, 24);
});

test('strata: with transitionsAtEnds, transition cards frame their row; the default mixes them in', () => {
  const cards = lavaPool();
  const ctx = { ...ctxFor(cards), tuning: { transitionsAtEnds: true } };
  const res = seatStrata(cards, ctx)!;
  const top = ctx.cells.map((c, i) => (c.row === 0 ? res.seating[i] : null)).filter((c): c is ArrangeCard => !!c);
  assert.equal(top.length, 8);
  const partlyIdx = top.map((c, i) => (depthOf(c).partly ? i : -1)).filter((i) => i >= 0);
  assert.deepEqual(partlyIdx, [0, 7], 'the two transition cards frame the sky row');
  // The default (lab run 1): the row is one hue order, transitions wherever their colour falls.
  const mixed = seatStrata(cards, ctxFor(cards))!;
  const topMixed = ctxFor(cards).cells.map((c, i) => (c.row === 0 ? mixed.seating[i] : null)).filter((c): c is ArrangeCard => !!c);
  assert.deepEqual(new Set(topMixed.map((c) => c.id)), new Set(top.map((c) => c.id)), 'the same cards in the sky row');
  assert.notDeepEqual(topMixed.map((c) => c.id), top.map((c) => c.id));
});

test('strata: a band one card short leaves the pocket open and asks for that band', () => {
  const cards = lavaPool().filter((c) => c.id !== 'cave7');
  const ctx = ctxFor(cards);
  const res = seatStrata(cards, ctx)!;
  assert.equal(res.seating.filter((c) => !c).length, 1);
  assert.deepEqual(res.ask, { kind: 'band', depth: 'below', open: 1 });
  // The open pocket is in an underground row, not filled by a ground card.
  const openIdx = res.seating.findIndex((c) => !c);
  assert.ok(bandRows(3).below.includes(ctx.cells[openIdx].row));
});

test('strata: free cards fill what is short; with a free partner the pair stays stacked', () => {
  const cards = lavaPool().filter((c) => c.id !== 'cave7' && c.id !== 'ground7');
  cards.push(card('Legend (Top)', { depthWords: ['scene:ocean'] }), card('Legend (Bottom)'));
  const ctx = ctxFor(cards);
  assert.equal(ctx.pairs.length, 1);
  const res = seatStrata(cards, ctx)!;
  const at = (id: string) => ctx.cells[res.seating.findIndex((c) => c?.id === id)];
  const top = at('Legend (Top)');
  const bottom = at('Legend (Bottom)');
  assert.ok(top && bottom, 'both halves seated');
  assert.equal(bottom.leaf, top.leaf);
  assert.equal(bottom.col, top.col);
  assert.equal(bottom.row, top.row + 1);
  assert.equal(res.held.length, 0);
});

test('strata: not offered when only one depth has cards; two bands share the middle row', () => {
  const onlySky = Array.from({ length: 6 }, (_, i) => card(`s${i}`, { depthWords: ['scene:sky'] }));
  assert.equal(seatStrata(onlySky, ctxFor(onlySky)), null);
  const two = [...Array.from({ length: 16 }, (_, i) => card(`s${i}`, { depthWords: ['scene:sky'] })), ...Array.from({ length: 8 }, (_, i) => card(`c${i}`, { depthWords: ['scene:cave'] }))];
  const ctx = ctxFor(two);
  const res = seatStrata(two, ctx)!;
  assert.equal(res.seating.filter(Boolean).length, 24);
  res.seating.forEach((c, i) => {
    if (!c) return;
    const r = ctx.cells[i].row;
    if (depthOf(c).depth === 'above') assert.ok(r <= 1, `${c.id} in row ${r}`);
    else assert.equal(r, 2, `${c.id} in row ${r}`);
  });
});

test('lines: each line shares a row, adjacent, in ascending stage order', () => {
  const line = (sp: string[], stage: number) => ({ evolutionLine: sp, evolutionStage: stage });
  const cards = [
    card('magmortar', line(['magby', 'magmar', 'magmortar'], 3)),
    card('magby', line(['magby', 'magmar', 'magmortar'], 1)),
    card('magmar', line(['magby', 'magmar', 'magmortar'], 2)),
    card('camerupt', line(['numel', 'camerupt'], 2)),
    card('numel', line(['numel', 'camerupt'], 1)),
    card('charizard', line(['charmander', 'charmeleon', 'charizard'], 3)),
    card('charmander', line(['charmander', 'charmeleon', 'charizard'], 1)),
    card('solo1', { fullArtKind: 'illustration_rare' }),
    card('solo2'),
  ];
  const ctx = { ...ctxFor(cards), spread: false, cells: cardCells(3, 3, false, new Set()) };
  const res = seatLines(cards, ctx)!;
  assert.ok(res);
  const where = (id: string) => ctx.cells[res.seating.findIndex((c) => c?.id === id)];
  for (const run of [['magby', 'magmar', 'magmortar'], ['numel', 'camerupt'], ['charmander', 'charizard']]) {
    const cells = run.map(where);
    assert.ok(cells.every((c) => c && c.row === cells[0].row), `${run.join(',')} share a row`);
    for (let i = 1; i < cells.length; i += 1) assert.equal(cells[i].col, cells[i - 1].col + 1, `${run[i]} right of ${run[i - 1]}`);
  }
  assert.equal(res.held.length, 0);
  assert.deepEqual(res.ask, { kind: 'stage', line: ['charmander', 'charmeleon', 'charizard'], stage: 2, species: 'charmeleon' });
});

test('flow: the gradient is no rougher than the seed chain, and every card is seated', () => {
  const cards = lavaPool();
  const ctx = ctxFor(cards);
  const res = seatFlow(cards, ctx)!;
  assert.equal(res.seating.filter(Boolean).length, 24);
  assert.equal(res.held.length, 0);
  assert.ok(res.fit > 0.5, `fit ${res.fit}`);
});

test('mirror: the strongest two take the outer corners and mirror each other', () => {
  const cards = lavaPool();
  cards[0] = { ...cards[0], fullArtKind: 'special_illustration_rare', illustrator: 'A' };
  cards[1] = { ...cards[1], fullArtKind: 'special_illustration_rare', illustrator: 'A' };
  const ctx = ctxFor(cards);
  const res = seatMirror(cards, ctx)!;
  const at = (id: string) => ctx.cells[res.seating.findIndex((c) => c?.id === id)];
  const corners = [at(cards[0].id), at(cards[1].id)].map((c) => `${c.leaf}:${c.row},${c.col}`).sort();
  assert.deepEqual(corners, ['left:0,0', 'right:0,3']);
  assert.equal(res.held.length, 0);
  // Not offered on an even single page: there is no centre column.
  assert.equal(seatMirror(cards, { ...ctx, spread: false, cols: 4, cells: cardCells(3, 4, false, new Set()) }), null);
});

test('connected art stays adjacent in every mode', () => {
  const cards = lavaPool().slice(0, 22);
  cards.push(card('Legend (Top)', { depthWords: ['scene:ocean'], palette: lab(50, 0, 0) }), card('Legend (Bottom)', { palette: lab(52, 0, 0) }));
  const ctx = ctxFor(cards);
  for (const seat of [seatStrata, seatFlow, seatMirror]) {
    const res = seat(cards, ctx)!;
    assert.ok(res, seat.name);
    const at = (id: string) => ctx.cells[res.seating.findIndex((c) => c?.id === id)];
    const t = at('Legend (Top)');
    const b = at('Legend (Bottom)');
    assert.ok(t && b, `${seat.name}: both halves seated`);
    assert.ok(t.leaf === b.leaf && t.col === b.col && b.row === t.row + 1, `${seat.name}: bottom under top`);
    assert.equal(res.seating.filter(Boolean).length + res.held.length, cards.length, `${seat.name}: nothing dropped`);
  }
});

test('a connected pair seated in the last row moves up, and the displaced card takes the freed pocket', () => {
  // Lines seats the Legend halves side by side in the bottom row; the fix-up must stack them
  // without seating one half twice or losing the card it displaces (the bug the first real run hit).
  const cards = lavaPool().slice(0, 22);
  cards.push(card('Legend (Top)', { evolutionLine: ['kyogre'], evolutionStage: 1 }), card('Legend (Bottom)', { evolutionLine: ['kyogre'], evolutionStage: 1 }));
  for (let i = 0; i < 6; i += 1) {
    cards[i] = { ...cards[i], evolutionLine: [`l${i >> 1}a`, `l${i >> 1}b`], evolutionStage: (i % 2) + 1 };
  }
  const ctx = ctxFor(cards);
  const res = seatLines(cards, ctx)!;
  const ids = res.seating.filter((c): c is ArrangeCard => !!c).map((c) => c.id);
  assert.equal(new Set(ids).size, ids.length, 'no card seated twice');
  assert.equal(ids.length + res.held.length, cards.length, 'nothing dropped');
  const at = (id: string) => ctx.cells[res.seating.findIndex((c) => c?.id === id)];
  const t = at('Legend (Top)');
  const b = at('Legend (Bottom)');
  assert.ok(t && b && t.leaf === b.leaf && t.col === b.col && b.row === t.row + 1, 'stacked');
});

test('candidates: the page as it is comes first, modes are diverse, nothing is dropped', () => {
  const cards = lavaPool();
  const current = new Map<string, Cell>();
  cardCells(3, 4, true, new Set()).forEach((c, i) => current.set(cards[i].id, c));
  const templates = ART_TEMPLATES.filter((t) => t.spread && t.rows === 3 && t.cols === 4);
  const out = arrangeCandidates({ ...spread, cards, current, templates });
  assert.equal(out[0].id, 'current');
  assert.equal(out[0].placements.length, 24);
  const rest = out.slice(1);
  // Three here, not four: this pool has no evolution lines, so Lines is not offered.
  assert.ok(rest.length >= 3 && rest.length <= 6, `${rest.length} candidates`);
  const top3 = rest.slice(0, 3).map((c) => c.mode);
  assert.equal(new Set(top3).size, top3.length, 'no two of one mode in the top three');
  const sigs = rest.map((c) => c.placements.map((p) => `${p.cardId}@${cellKey(p.cell)}`).sort().join('|'));
  assert.equal(new Set(sigs).size, sigs.length, 'no two candidates are the same seating');
  // Templates with fewer pockets than cards are not offered (allowHeld off): every candidate seats all 24.
  for (const c of rest) {
    assert.equal(c.held.length, 0, c.id);
    assert.equal(c.placements.length + c.open.length, 24 - c.artCells, c.id);
    for (const p of c.placements) if (c.template) assert.ok(!templateCells(c.template, true).has(cellKey(p.cell)), `${c.id}: card on an art panel`);
  }
  // Deterministic.
  const again = arrangeCandidates({ ...spread, cards, current, templates });
  assert.deepEqual(again.map((c) => c.id), out.map((c) => c.id));
});

test('candidates with allowHeld offer richer templates and name what they hold', () => {
  const cards = lavaPool();
  const templates = ART_TEMPLATES.filter((t) => t.spread && t.rows === 3 && t.cols === 4);
  const out = arrangeCandidates({ ...spread, cards, templates, allowHeld: true });
  const withArt = out.filter((c) => c.artCells > 0);
  assert.ok(withArt.length > 0, 'at least one candidate spends pockets on art');
  for (const c of withArt) assert.equal(c.placements.length + c.held.length, 24, `${c.id}: seated plus held is the page`);
});

test('reserved cells are never used when seating the page as it is', () => {
  const cards = lavaPool().slice(0, 20);
  const reserved = new Set(['left:0,0', 'left:0,1', 'right:0,2', 'right:0,3']);
  const out = arrangeCandidates({ ...spread, cards, reserved });
  for (const c of out) for (const p of c.placements) assert.ok(!reserved.has(cellKey(p.cell)), `${c.id} used ${cellKey(p.cell)}`);
});

test('movesFor skips cards already where the candidate wants them', () => {
  const cards = lavaPool();
  const current = new Map<string, Cell>();
  cardCells(3, 4, true, new Set()).forEach((c, i) => current.set(cards[i].id, c));
  const out = arrangeCandidates({ ...spread, cards, current });
  assert.equal(movesFor(out[0], current).length, 0, 'the current page needs no moves');
  const strata = out.find((c) => c.mode === 'strata')!;
  const moves = movesFor(strata, current);
  assert.ok(moves.length > 0 && moves.length <= 24);
});

test('connectedPairs: Legend halves by name, consecutive numbers by one illustrator in one set', () => {
  const pairs = connectedPairs([
    card('X Legend (Top)'),
    card('X Legend (Bottom)'),
    card('a', { setId: 's', illustrator: 'I', number: '12' }),
    card('b', { setId: 's', illustrator: 'I', number: '13' }),
    card('c', { setId: 's', illustrator: 'J', number: '14' }),
  ]);
  assert.deepEqual(pairs, [
    { a: 'X Legend (Top)', b: 'X Legend (Bottom)', dir: 'vertical' },
    { a: 'a', b: 'b', dir: 'horizontal' },
  ]);
});

// --- Tuning: the taste knobs the Arrange Lab puts in front of the owner ---------------------

test('tuning: strataOrder light sorts a row dark to bright; hue is the default', () => {
  const cards = lavaPool();
  const base = seatStrata(cards, ctxFor(cards))!;
  const light = seatStrata(cards, { ...ctxFor(cards), tuning: { strataOrder: 'light' } })!;
  const ctx = ctxFor(cards);
  // The sky row (row 0) under 'light' runs dark to bright.
  const row0 = ctx.cells.map((c, i) => (c.row === 0 ? light.seating[i] : null)).filter(Boolean) as ArrangeCard[];
  assert.ok(row0.length >= 4);
  for (let i = 1; i < row0.length; i += 1) assert.ok(row0[i].palette![0].L >= row0[i - 1].palette![0].L);
  // Still pure: the same cards per row as the default, only the order inside the row differs.
  const rowSet = (res: typeof base, r: number) => new Set(ctx.cells.map((c, i) => (c.row === r ? res.seating[i]?.id : null)).filter(Boolean));
  for (let r = 0; r < 3; r += 1) assert.deepEqual(rowSet(light, r), rowSet(base, r));
});

test('tuning: transitionsAtEnds off lets a transition card sit mid-row', () => {
  const cards = lavaPool();
  const ctx = ctxFor(cards);
  const mixed = seatStrata(cards, { ...ctx, tuning: { strataOrder: 'light' } })!;
  const row0 = ctx.cells.map((c, i) => (c.row === 0 ? mixed.seating[i] : null)).filter(Boolean) as ArrangeCard[];
  // The two flying-over-volcano transitions are the darkest sky cards, so under 'light' they come first, together.
  const ends = row0.filter((c) => depthOf(c).partly);
  assert.equal(ends.length, 2);
  assert.ok(row0.indexOf(ends[1]) < row0.length - 1, 'a transition card is not forced to the row end');
});

test('tuning: flowStart light seeds the gradient from the brightest card', () => {
  const cards = lavaPool();
  const dark = seatFlow(cards, ctxFor(cards))!;
  const light = seatFlow(cards, { ...ctxFor(cards), tuning: { flowStart: 'light' } })!;
  const first = (res: typeof dark) => res.seating.find(Boolean)!;
  assert.ok(first(dark).palette![0].L < first(light).palette![0].L);
});

test('tuning: flowVertical changes the roughness a seating is judged by', () => {
  const cards = lavaPool();
  const ctx = ctxFor(cards);
  const res = seatFlow(cards, ctx)!;
  const half = flowRoughness(res.seating, ctx);
  const none = flowRoughness(res.seating, { ...ctx, tuning: { flowVertical: 0 } });
  const full = flowRoughness(res.seating, { ...ctx, tuning: { flowVertical: 1 } });
  assert.ok(none < half && half < full);
});

test('tuning: mirrorTwin palette ignores the illustrator', () => {
  const cards = lavaPool().map((c, i) => ({ ...c, illustrator: i % 2 ? 'A' : 'B', fullArtKind: i === 0 ? 'special_illustration_rare' : undefined }));
  const byArtist = seatMirror(cards, ctxFor(cards))!;
  const byPalette = seatMirror(cards, { ...ctxFor(cards), tuning: { mirrorTwin: 'palette' } })!;
  // The default pairs the strongest card with one by the same illustrator and says so in its fit.
  assert.ok(byArtist.fit > byPalette.fit);
});

test('tuning: the app passes nothing and gets the defaults', () => {
  assert.deepEqual(DEFAULT_TUNING, { strataOrder: 'hue', transitionsAtEnds: false, flowVertical: 0.5, flowStart: 'dark', mirrorTwin: 'illustrator' });
  const cards = lavaPool();
  const a = arrangeCandidates({ ...spread, cards });
  const b = arrangeCandidates({ ...spread, cards, tuning: {} });
  assert.deepEqual(a.map((c) => c.placements), b.map((c) => c.placements));
});

test('art class: the three full-art kinds are full, everything else is windowed; a mixed page is named', () => {
  assert.equal(artClassOf('illustration_rare'), 'full');
  assert.equal(artClassOf('special_illustration_rare'), 'full');
  assert.equal(artClassOf('named_full_art'), 'full');
  for (const k of ['scene_tagged', 'measured', 'double_rare', '', undefined]) assert.equal(artClassOf(k), 'windowed');
  assert.deepEqual(pageArtMix([{ fullArtKind: 'illustration_rare' }, { fullArtKind: 'scene_tagged' }, { fullArtKind: '' }]), { full: 1, windowed: 2, mixed: true });
  assert.equal(pageArtMix([{ fullArtKind: 'named_full_art' }, { fullArtKind: 'illustration_rare' }]).mixed, false);
  assert.equal(pageArtMix([]).mixed, false);
});
