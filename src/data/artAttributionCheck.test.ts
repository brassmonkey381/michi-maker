/**
 * The public-binder PRIVATE-ART gate. Run: `npm test`.
 *
 * This decides whether a binder can be shared at all, and it fails in two directions — letting
 * unverifiable art out, or trapping art that was always fine. Both are pinned here, especially
 * the card-catalog case: art cropped from our OWN card images was historically stamped 'external'
 * by the generic URL path, which quietly made those binders unshareable.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { isCardCatalogArt, isPrivateArt, markCopiedArtBorrowed, privateArtInBinder } from './artAttributionCheck.ts';
import type { DemoBinder, DemoSlot } from './binderTypes.ts';

const CARD = 'https://bmhjizcmwtmcrstadqto.supabase.co/storage/v1/object/public/cards/sv1/25.png';
const OWN_BUCKET = 'https://piikwvntldytjejxmcla.supabase.co/storage/v1/object/public/binder-art/x.png';
const HOTLINK = 'https://images.example.com/fan-art.png';
const PROCEDURAL = 'data:image/svg+xml,%3Csvg%3E%3C/svg%3E';

let seq = 0;
function slot(partial: Partial<DemoSlot>): DemoSlot {
  seq += 1;
  return { id: `s${seq}`, row: 0, col: 0, rowSpan: 1, colSpan: 1, type: 'artwork', ...partial };
}
function binderWith(slots: DemoSlot[]): DemoBinder {
  return { id: 'copy', title: 't', layoutStyle: 'anchor', isExample: false, pages: [{ id: 'p1', rows: 3, cols: 3, slots }] };
}

test('card-catalog art is public-eligible, whatever the stored origin says', () => {
  // The misfiled-provenance case: stamped external, but demonstrably our own card image.
  assert.equal(isPrivateArt({ sourceName: 'official card art', origin: 'external' }, CARD), false);
  assert.equal(isPrivateArt({ sourceName: 'official card art', origin: 'card' }, CARD), false);
  assert.equal(isPrivateArt(null, CARD), false);
});

test("origin 'card' is public-eligible on its own", () => {
  assert.equal(isPrivateArt({ sourceName: 'official card art', origin: 'card' }, undefined), false);
});

test('genuine hotlinks stay PRIVATE — the gate still does its job', () => {
  assert.equal(isPrivateArt({ sourceName: 'Pinterest', origin: 'external' }, HOTLINK), true);
  // Legacy art with no origin flag, hosted off-site ⇒ private on host alone.
  assert.equal(isPrivateArt(null, HOTLINK), true);
  assert.equal(isPrivateArt({ sourceName: 'custom art' }, HOTLINK), true);
});

test('user uploads in our own bucket stay public-eligible', () => {
  assert.equal(isPrivateArt({ sourceName: 'your upload', origin: 'upload' }, OWN_BUCKET), false);
  assert.equal(isPrivateArt(null, OWN_BUCKET), false);
  assert.equal(isPrivateArt(null, 'blob:http://localhost/abc'), false);
});

test('imported art WE HOST is public-eligible (the 2026-08-26 loosening)', () => {
  // importRemoteArtToBucket re-hosts every pull into the user's bucket, and the account-level
  // rights attestation plus the credit strip plus a working takedown path carry the risk. The
  // origin stamp is unchanged; only what the gate does with it moved.
  assert.equal(isPrivateArt({ sourceName: 'Pinterest', origin: 'external' }, OWN_BUCKET), false);
  // No URL to verify hosting with, so still private: eligibility is about where the bytes
  // live, not the flag alone.
  assert.equal(isPrivateArt({ sourceName: 'Pinterest', origin: 'external' }, undefined), true);
});

test('copied art WE HOST is public-eligible (widened 2026-08-26)', () => {
  // Today's only copied source is duplicating OUR example/demo binders, so the art behind the
  // stamp is house content the owner chose to let circulate. If cross-user duplication ever
  // ships, this test is the one to flip back (see the header guard in artAttributionCheck).
  assert.equal(isPrivateArt({ sourceName: 'copied from a binder', origin: 'copied' }, OWN_BUCKET), false);
  // No URL to verify hosting with ⇒ still private, same as external.
  assert.equal(isPrivateArt({ sourceName: 'x', origin: 'copied' }, undefined), true);
  // A copied slot pointing at an off-site image stays private on host alone.
  assert.equal(isPrivateArt({ sourceName: 'x', origin: 'copied' }, HOTLINK), true);
  // Copied CARD art was always fine: a card image is public wherever it comes from.
  assert.equal(isPrivateArt({ sourceName: 'x', origin: 'copied' }, CARD), false);
});

test('markCopiedArtBorrowed stamps inherited custom art, spares cards + inserts', () => {
  const before = binderWith([
    slot({ imageUrl: OWN_BUCKET }), // custom bucket art, no origin — was PUBLIC on copy (the leak)
    slot({ imageUrl: OWN_BUCKET, attribution: { sourceName: 'your upload', origin: 'upload' } }),
    slot({ imageUrl: CARD, attribution: { sourceName: 'official card art', origin: 'card' } }),
    slot({ type: 'card', cardId: '25' }),
    slot({ imageUrl: PROCEDURAL }), // procedural themeBackground insert (app-owned)
  ]);
  // Nothing is private before (this is exactly the copy+reshare hole).
  assert.equal(privateArtInBinder(before).length, 0);

  const after = markCopiedArtBorrowed(before);
  const slots = after.pages[0].slots;
  assert.equal(slots[0].attribution?.origin, 'copied'); // bucket custom art → borrowed
  assert.equal(slots[1].attribution?.origin, 'copied'); // upload → borrowed
  assert.equal(slots[1].attribution?.sourceName, 'your upload'); // original credit preserved
  assert.equal(slots[2].attribution?.origin, 'card'); // catalog card art → untouched
  assert.equal(slots[3].attribution, undefined); // a card slot → untouched
  assert.equal(slots[4].attribution, undefined); // procedural insert → untouched

  // Since the 2026-08-26 widening the stamp no longer blocks: both copied pieces are hosted in
  // our bucket, so the copy is shareable and the stamp is provenance, not a lock. This assertion
  // is the one to flip back to 2 if cross-user duplication ever ships.
  assert.equal(privateArtInBinder(after).length, 0);
});

test('isCardCatalogArt recognises catalog URLs and nothing else', () => {
  assert.equal(isCardCatalogArt(CARD), true);
  assert.equal(isCardCatalogArt('/cards/sv1/25.png'), true);
  assert.equal(isCardCatalogArt('https://cdn.example.com/card-imgs/25.png'), true);
  assert.equal(isCardCatalogArt(OWN_BUCKET), false);
  assert.equal(isCardCatalogArt(HOTLINK), false);
  assert.equal(isCardCatalogArt(null), false);
  assert.equal(isCardCatalogArt(undefined), false);
});
