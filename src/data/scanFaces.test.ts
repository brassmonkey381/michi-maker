/**
 * Pocket scan-face allocation (scanFaces.ts).
 *
 * The property under test is the invariant that motivated the module: a binder never shows more
 * pockets wearing a card's scans than the user owns scans of that card (weighted by lot
 * quantity), and a pocket that names its copy wears that copy's photo or none — never a
 * borrowed face.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { allocateScanFaces, type FaceSlot, type ScannedCopy } from './scanFaces.ts';

let n = 0;
const slot = (over: Partial<FaceSlot> = {}): FaceSlot => ({
  id: `slot-${n++}`,
  type: 'card',
  cardId: 'metal-energy',
  ...over,
});
const copy = (entryId: string, quantity = 1): ScannedCopy => ({
  entryId,
  url: `https://scans/${entryId}.jpg`,
  quantity,
});

/** The pool for one card with these scanned copies, newest first. */
const world = (...copies: ScannedCopy[]) => new Map([['metal-energy', copies]]);

test('three stamped pockets wear their own three photos', () => {
  const pool = world(copy('e1'), copy('e2'), copy('e3'));
  const slots = [
    slot({ sourceEntryId: 'e1' }),
    slot({ sourceEntryId: 'e2' }),
    slot({ sourceEntryId: 'e3' }),
  ];
  const faces = allocateScanFaces(slots, pool);
  assert.equal(faces.get(slots[0].id), 'https://scans/e1.jpg');
  assert.equal(faces.get(slots[1].id), 'https://scans/e2.jpg');
  assert.equal(faces.get(slots[2].id), 'https://scans/e3.jpg');
});

test('the fourth copy of three owned shows catalog art, not a borrowed scan', () => {
  // The reported bug: place more copies than owned and the extra pocket wore the newest scan.
  const pool = world(copy('e1'), copy('e2'), copy('e3'));
  const slots = [
    slot({ sourceEntryId: 'e1' }),
    slot({ sourceEntryId: 'e2' }),
    slot({ sourceEntryId: 'e3' }),
    slot({ fromCollection: true }), // over-placement: consumed a copy, no stamp left to give
  ];
  const faces = allocateScanFaces(slots, pool);
  assert.equal(faces.has(slots[3].id), false, 'the pool is spent; no photo left to give');
  assert.equal(faces.size, 3, 'never more faces than owned scans');
});

test('an unclaimed CONSUMING pocket picks up an unworn photo rather than duplicating a worn one', () => {
  // A legacy pre-stamp pocket that consumed a copy: the photo it could show is real and no other
  // pocket is wearing it. Three pockets, three scans owned: three faces is honest.
  const pool = world(copy('e1'), copy('e2'), copy('e3'));
  const slots = [
    slot({ sourceEntryId: 'e1' }),
    slot({ sourceEntryId: 'e2' }),
    slot({ fromCollection: true }),
  ];
  const faces = allocateScanFaces(slots, pool);
  assert.equal(faces.get(slots[2].id), 'https://scans/e3.jpg', 'the one photo not already worn');
});

test('a deliberately aspirational pocket takes nothing, however many photos are unworn', () => {
  // Neither stamp nor fromCollection is a CHOICE: CopyPickerSheet's "just the catalogue image",
  // a duplicated binder, a browse add of a card being hunted. The user said "not one of mine";
  // dressing the pocket in their photo anyway would override the one answer they gave by hand.
  const pool = world(copy('e1'), copy('e2'));
  const slots = [slot(), slot({ fromCollection: true })];
  const faces = allocateScanFaces(slots, pool);
  assert.equal(faces.has(slots[0].id), false, 'explicitly catalogue, stays catalogue');
  assert.equal(faces.get(slots[1].id), 'https://scans/e1.jpg', 'the consuming sibling still draws');
  assert.equal(faces.size, 1);
});

test('a stamp on a copy WITHOUT a photo is catalog art, locked - never a borrowed face', () => {
  // The pocket knows exactly which physical card it holds; that card has no photo. Wearing a
  // different copy's photo is the wrong-face defect. e2's photo stays available to nobody here.
  const pool = new Map([['metal-energy', [copy('e2')]]]);
  const slots = [slot({ sourceEntryId: 'e1' })];
  const faces = allocateScanFaces(slots, pool);
  assert.equal(faces.size, 0);
});

test('a stamp on a DELETED lot is catalog art too, not a scavenge', () => {
  // The pocket named its physical card and the user removed that card from the collection.
  // Catalog is the honest face (and the requested one); wearing the surviving sibling's photo
  // would be the wrong-face defect back again. e1's photo stays for a pocket that can claim it.
  const pool = world(copy('e1'));
  const slots = [slot({ sourceEntryId: 'gone' })];
  const faces = allocateScanFaces(slots, pool);
  assert.equal(faces.size, 0, 'the deleted copy has no photo; the pocket shows catalog');
});

test('a lot of three with one photo backs exactly three pockets', () => {
  const pool = world(copy('lot', 3));
  const slots = [
    slot({ sourceEntryId: 'lot' }),
    slot({ sourceEntryId: 'lot' }),
    slot({ fromCollection: true }),
    slot({ fromCollection: true }), // fourth pocket: the lot's capacity is spent
  ];
  const faces = allocateScanFaces(slots, pool);
  assert.equal(faces.get(slots[0].id), 'https://scans/lot.jpg');
  assert.equal(faces.get(slots[1].id), 'https://scans/lot.jpg');
  assert.equal(faces.get(slots[2].id), 'https://scans/lot.jpg');
  assert.equal(faces.has(slots[3].id), false);
});

test('a claim outranks a scavenge regardless of pocket order', () => {
  // The unstamped pocket sits FIRST in the binder, but the stamped pocket later on is entitled
  // to e1's photo by name. Pass order, not slot order, decides.
  const pool = world(copy('e1'));
  const slots = [slot({ fromCollection: true }), slot({ sourceEntryId: 'e1' })];
  const faces = allocateScanFaces(slots, pool);
  assert.equal(faces.get(slots[1].id), 'https://scans/e1.jpg', 'the named claim wins');
  assert.equal(faces.has(slots[0].id), false, 'the scavenger finds the pool empty');
});

test('duplicate stamps on a quantity-1 lot: the earliest pocket wins, the rest show catalog', () => {
  // Two pockets claiming one physical card cannot both be telling the truth. Deterministic by
  // slot order rather than flickering between claimants. The pool holds a SECOND, unworn photo
  // (e2) precisely so this test can tell "catalog, locked" from "scavenged whatever was left":
  // the losing claimant says it holds e1, so wearing e2's photo would be the wrong-face defect.
  // (The review proved the suite green under exactly that mutation before this pin.)
  const pool = world(copy('e1'), copy('e2'));
  const slots = [slot({ sourceEntryId: 'e1' }), slot({ sourceEntryId: 'e1' })];
  const faces = allocateScanFaces(slots, pool);
  assert.equal(faces.get(slots[0].id), 'https://scans/e1.jpg');
  assert.equal(faces.has(slots[1].id), false, 'locked to catalog, not lent e2');
});

test('legacy pre-stamp binder: unstamped pockets wear the owned scans, capped at what is owned', () => {
  // Wizard fills and legacy collection binders produce stamp-less pockets that consumed owned
  // cards. They keep their scans - the pool just runs dry at the honest count.
  const pool = world(copy('e1'), copy('e2'));
  const slots = [
    slot({ fromCollection: true }),
    slot({ fromCollection: true }),
    slot({ fromCollection: true }),
  ];
  const faces = allocateScanFaces(slots, pool);
  assert.equal(faces.get(slots[0].id), 'https://scans/e1.jpg', 'newest first');
  assert.equal(faces.get(slots[1].id), 'https://scans/e2.jpg');
  assert.equal(faces.has(slots[2].id), false);
});

test('allocation is per card: one card cannot spend another card`s photos', () => {
  const pool = new Map([
    ['metal-energy', [copy('e1')]],
    ['charizard', [copy('z1')]],
  ]);
  const slots = [
    slot({ fromCollection: true }),
    slot({ cardId: 'charizard', fromCollection: true }),
  ];
  const faces = allocateScanFaces(slots, pool);
  assert.equal(faces.get(slots[0].id), 'https://scans/e1.jpg');
  assert.equal(faces.get(slots[1].id), 'https://scans/z1.jpg');
});

test('non-card and cardless slots take nothing from the pool', () => {
  const pool = world(copy('e1'));
  const art = slot({ type: 'artwork', fromCollection: true });
  const bare = slot({ cardId: undefined, fromCollection: true });
  const card = slot({ fromCollection: true });
  const faces = allocateScanFaces([art, bare, card], pool);
  assert.equal(faces.size, 1);
  assert.equal(faces.get(card.id), 'https://scans/e1.jpg');
});

test('binder-wide invariant: faces never exceed owned scan capacity, whatever the slot mix', () => {
  // A stress mix of every pocket kind against a 2-photo pool (one qty-2 lot, one qty-1 lot):
  // capacity 3, so exactly 3 faces, each pinned to the exact slot that must wear it - the
  // review proved count-only assertions let a reordered pass 2 ship a differently rendered
  // binder under a green suite.
  const pool = world(copy('big', 2), copy('one'));
  const slots = [
    slot({ sourceEntryId: 'big' }),
    slot({ sourceEntryId: 'unscanned' }), // a claim with no photo: locked to catalog
    slot({ sourceEntryId: 'gone-1' }), // deleted lot: locked to catalog
    slot({ fromCollection: true }),
    slot({ fromCollection: true }),
    slot({ sourceEntryId: 'big' }),
  ];
  const faces = allocateScanFaces(slots, pool);
  assert.equal(faces.get(slots[0].id), 'https://scans/big.jpg', 'first claimant of the qty-2 lot');
  assert.equal(faces.has(slots[1].id), false, 'the unscanned claim stays catalog');
  assert.equal(faces.has(slots[2].id), false, 'the dead claim stays catalog');
  assert.equal(faces.get(slots[3].id), 'https://scans/one.jpg', 'first scavenger takes the unworn photo');
  assert.equal(faces.has(slots[4].id), false, 'second scavenger finds the pool spent');
  assert.equal(faces.get(slots[5].id), 'https://scans/big.jpg', 'second claimant fits the lot quantity');
  assert.equal(faces.size, 3, 'capacity is 3 faces, exactly');
});
