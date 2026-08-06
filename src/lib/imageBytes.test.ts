/**
 * Art format sniffing. Run: `npm test`.
 *
 * The case that matters: a real object in the `binder-art` bucket is AVIF stored as `.jpg` and
 * served as `image/jpeg`, because the import path believed the remote header. Satori draws
 * nothing for AVIF and doesn't throw, so that pocket unfurled as a black hole on Discord. These
 * pin the two halves of the fix — the bytes win, and AVIF/HEIC/WebP get re-encoded.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { extForMime, needsTranscode, sniffImageMime } from './imageBytes.ts';

/** `....ftyp<brand>` — the ISO-BMFF header AVIF and HEIC share. */
const ftyp = (brand: string) =>
  new Uint8Array([
    0, 0, 0, 0x20, 0x66, 0x74, 0x79, 0x70, ...[...brand].map((c) => c.charCodeAt(0)), 0, 0, 0, 0,
  ]);

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 0, 0, 0, 0]);
const GIF = new Uint8Array([0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 0, 0, 0, 0, 0, 0]);
const WEBP = new Uint8Array([
  0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50,
]);

test('the bytes identify the format, whatever the file is called', () => {
  assert.equal(sniffImageMime(PNG), 'image/png');
  assert.equal(sniffImageMime(JPEG), 'image/jpeg');
  assert.equal(sniffImageMime(GIF), 'image/gif');
  assert.equal(sniffImageMime(WEBP), 'image/webp');
});

test('AVIF is recognised — the format that shipped mislabelled as image/jpeg', () => {
  assert.equal(sniffImageMime(ftyp('avif')), 'image/avif');
  assert.equal(sniffImageMime(ftyp('avis')), 'image/avif');
  // HEIC shares the container and is equally undecodable downstream.
  assert.equal(sniffImageMime(ftyp('heic')), 'image/heic');
  assert.equal(sniffImageMime(ftyp('mif1')), 'image/heic');
});

test('unrecognised or truncated input returns null so the caller can fall back', () => {
  assert.equal(sniffImageMime(new Uint8Array([1, 2, 3])), null);
  assert.equal(sniffImageMime(new Uint8Array()), null);
  // A near-miss must not be claimed: RIFF without the WEBP tag is some other RIFF file.
  assert.equal(sniffImageMime(new Uint8Array([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 1, 2, 3, 4])), null);
  // ftyp with an unknown brand is some other ISO-BMFF file (mp4, …), not an image we can name.
  assert.equal(sniffImageMime(ftyp('mp42')), null);
});

test('only the formats the share renderer cannot read are re-encoded', () => {
  assert.equal(needsTranscode('image/avif'), true);
  assert.equal(needsTranscode('image/heic'), true);
  assert.equal(needsTranscode('image/webp'), true);
  assert.equal(needsTranscode('image/png'), false);
  assert.equal(needsTranscode('image/jpeg'), false);
  // GIF is left alone on purpose — flattening it would kill the animation.
  assert.equal(needsTranscode('image/gif'), false);
  // Nothing sniffed = nothing to convert; the upload keeps whatever the source declared.
  assert.equal(needsTranscode(null), false);
});

test('extensions match the stored content type', () => {
  assert.equal(extForMime('image/jpeg'), 'jpg');
  assert.equal(extForMime('image/png'), 'png');
  assert.equal(extForMime('image/avif'), 'avif');
  assert.equal(extForMime(null), null);
  assert.equal(extForMime('application/pdf'), null);
});
