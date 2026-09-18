/**
 * Promoting artwork cards in a colour search. Run: `npm test`.
 *
 * The two ways this can be wrong are opposite and both bad: too weak and a colour page still opens
 * on twelve framed commons, too strong and a beautiful card that is the WRONG COLOUR leads a
 * search whose entire premise was the colour. Both directions are pinned below.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { promoteArtCards } from './artRank.ts';

/** ids are "<kind><n>": i = illustration rare, f = named full art, p = plain. */
const kindOf = (id: string): string | undefined => {
  if (id.startsWith('i')) return 'illustration_rare';
  if (id.startsWith('s')) return 'special_illustration_rare';
  if (id.startsWith('f')) return 'named_full_art';
  if (id.startsWith('?')) return undefined; // unresolvable
  return 'basic';
};

const run = (ids: string[]) => promoteArtCards(ids, kindOf);

test('an illustration rare well down the list is pulled near the front', () => {
  // Ten plain cards, then an IR: it should land inside the first few rather than eleventh.
  const ids = [...Array.from({ length: 10 }, (_, i) => `p${i}`), 'i0'];
  const out = run(ids);
  assert.ok(out.indexOf('i0') <= 3, `expected the IR near the front, got position ${out.indexOf('i0')}`);
});

test('but a distant one does not outrank a close plain match', () => {
  // The IR is 60 results down — the wrong colour. It must stay behind the nearest plain cards.
  const ids = [...Array.from({ length: 60 }, (_, i) => `p${i}`), 'i0'];
  const out = run(ids);
  assert.ok(out.indexOf('i0') > out.indexOf('p5'), 'a far-off IR must not leapfrog a close match');
});

test('the nearest match still leads when it is already artwork', () => {
  assert.equal(run(['i0', 'p0', 'p1'])[0], 'i0');
});

test('the very first result is never displaced by a lower-ranked card of the same band', () => {
  // Guards the rank+1 offset: without it the first result multiplies to zero and ties.
  const out = run(['p0', 'p1', 'p2']);
  assert.deepEqual(out, ['p0', 'p1', 'p2']);
});

test('special illustration rares outrank named full arts, which outrank the frames', () => {
  // Both art cards sit behind four plain ones; each should climb past the plain cards it was
  // behind, in band order. The card that is ALREADY the closest colour keeps the lead: a full art
  // one slot down is not a reason to demote the best match in a search about colour.
  const out = run(['p0', 'p1', 'p2', 'p3', 'f0', 's0']);
  assert.equal(out[0], 'p0', 'the nearest match keeps its place');
  assert.ok(out.indexOf('s0') < out.indexOf('f0'), 'SIR leads the named full art');
  assert.ok(out.indexOf('f0') < out.indexOf('p3'), 'the full art climbs past the plain cards behind it');
});

test('cards of the same band never swap places', () => {
  const ids = ['p0', 'i0', 'p1', 'i1', 'p2', 'i2'];
  const out = run(ids);
  const irs = out.filter((id) => id.startsWith('i'));
  const plains = out.filter((id) => id.startsWith('p'));
  assert.deepEqual(irs, ['i0', 'i1', 'i2'], 'colour order must survive within a band');
  assert.deepEqual(plains, ['p0', 'p1', 'p2']);
});

test('an id the catalog cannot resolve keeps its place rather than being buried', () => {
  const out = run(['?0', '?1', '?2']);
  assert.deepEqual(out, ['?0', '?1', '?2']);
});

test('a game with no art data comes back in exactly the order it went in', () => {
  // One Piece publishes no full_art_kind: every card is an ordinary band, nothing moves.
  const ids = Array.from({ length: 25 }, (_, i) => `p${i}`);
  assert.deepEqual(run(ids), ids);
});

test('every result survives the re-rank — this reorders, it never filters', () => {
  const ids = ['p0', 'i0', '?0', 'f0', 's0', 'p1'];
  assert.deepEqual([...run(ids)].sort(), [...ids].sort());
  assert.equal(run(ids).length, ids.length);
});

test('an empty result set is left alone', () => {
  assert.deepEqual(run([]), []);
});
