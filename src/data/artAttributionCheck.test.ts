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

import { isCardCatalogArt, isPrivateArt } from './artAttributionCheck.ts';

const CARD = 'https://bmhjizcmwtmcrstadqto.supabase.co/storage/v1/object/public/cards/sv1/25.png';
const OWN_BUCKET = 'https://piikwvntldytjejxmcla.supabase.co/storage/v1/object/public/binder-art/x.png';
const HOTLINK = 'https://images.example.com/fan-art.png';

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

test('an external flag still wins over a bucket-hosted copy (imported hotlinks)', () => {
  // importRemoteArtToBucket re-hosts a pulled image; the ORIGIN is what marks it unverifiable.
  assert.equal(isPrivateArt({ sourceName: 'Pinterest', origin: 'external' }, OWN_BUCKET), true);
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
