/**
 * MIC-029: the image safety check's verdict rules (supabase/functions/image-review/classify.ts).
 * Run: `npm test`. Pinned: only "safe" is ever shown to visitors; anything unreadable is held.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { REVIEW_MODEL, REVIEW_SCHEMA, SAME_PICTURE_BITS, dhashHex, hammingHex, isModelType, noticeText, parseAnswer, renderUrl, samePictureRows, sniffImage, verdictFor } from '../../supabase/functions/image-review/classify.ts';

test('only safe is approved; suggestive is held too (owner default, 2026-11-09)', () => {
  assert.equal(verdictFor('safe'), 'approved');
  assert.equal(verdictFor('suggestive'), 'flagged');
  assert.equal(verdictFor('explicit'), 'flagged');
  assert.equal(verdictFor('refused'), 'flagged');
  assert.equal(verdictFor('unchecked'), 'unchecked');
});

test('a malformed or unexpected answer is never read as safe', () => {
  assert.equal(parseAnswer('not json').label, 'unchecked');
  assert.equal(parseAnswer('{"label":"fine"}').label, 'unchecked');
  assert.equal(parseAnswer('{}').label, 'unchecked');
  assert.equal(verdictFor(parseAnswer('{"label":"SAFE"}').label), 'unchecked');
});

test('a well-formed answer comes through, minor concern only when explicitly true', () => {
  assert.deepEqual(parseAnswer('{"label":"explicit","minor_concern":true,"reason":"nudity"}'), { label: 'explicit', minor_concern: true, reason: 'nudity' });
  assert.equal(parseAnswer('{"label":"safe","minor_concern":"yes","reason":"x"}').minor_concern, false);
});

test('the schema allows exactly the three labels, and the model is the small one', () => {
  assert.deepEqual([...REVIEW_SCHEMA.properties.label.enum], ['safe', 'suggestive', 'explicit']);
  assert.equal(REVIEW_MODEL, 'claude-haiku-5-5');
});

test('held page-mates are flagged with the explicit image', () => {
  assert.equal(verdictFor('held'), 'flagged');
});

test('the admin email carries links and counts, never images', () => {
  const n = noticeText(
    [
      { binderId: 'b1', label: 'explicit', minor: false },
      { binderId: 'b1', label: 'held', minor: false },
      { binderId: 'b2', label: 'suggestive', minor: true },
    ],
    'https://michi-maker.com/studio',
    'https://michi-maker.com',
  );
  assert.match(n.subject, /3 images held for review \(1 possible minor\)/);
  assert.match(n.text, /michi-maker\.com\/binder\/b1 {2}\(1 explicit, 1 held\)/);
  assert.match(n.text, /NCMEC/);
  assert.match(n.text, /Review them in Studio: https:\/\/michi-maker\.com\/studio/);
  assert.doesNotMatch(n.text, /binder-art|\.png|\.jpg/);
});

test('the picture fingerprint survives small changes and tells different pictures apart', () => {
  const gradient = Array.from({ length: 72 }, (_, i) => (i % 9) * 20 + Math.floor(i / 9));
  const brighter = gradient.map((v) => v + 30); // re-encoded a little brighter
  const flipped = gradient.map((_, i) => gradient[Math.floor(i / 9) * 9 + (8 - (i % 9))]);
  const a = dhashHex(gradient);
  assert.equal(a.length, 16);
  assert.equal(hammingHex(a, dhashHex(brighter)), 0);
  assert.ok(hammingHex(a, dhashHex(flipped)) > SAME_PICTURE_BITS);
  assert.throws(() => dhashHex([1, 2, 3]));
});

test('the image type comes from the bytes, not the label the server gave it', () => {
  const b = (...xs: (number | string)[]) => new Uint8Array(xs.flatMap((x) => (typeof x === 'string' ? [...x].map((c) => c.charCodeAt(0)) : [x])));
  assert.equal(sniffImage(b(0xff, 0xd8, 0xff, 0xe0)), 'image/jpeg');
  assert.equal(sniffImage(b(0x89, 'PNG', 0x0d, 0x0a, 0x1a, 0x0a)), 'image/png');
  assert.equal(sniffImage(b('GIF89a')), 'image/gif');
  assert.equal(sniffImage(b('RIFF', 0, 0, 0, 0, 'WEBPVP8 ')), 'image/webp');
  assert.equal(sniffImage(b(0, 0, 0, 0x1c, 'ftypavif', 0, 0, 0, 0)), 'image/avif');
  assert.equal(sniffImage(b(0, 0, 0, 0x18, 'ftypheic', 0, 0, 0, 0)), 'image/heic');
  assert.equal(sniffImage(b('<svg xmlns="http://www.w3.org/2000/svg">')), 'image/svg+xml');
  assert.equal(sniffImage(b('<!DOCTYPE html><html>')), 'text/html');
  assert.equal(sniffImage(b(1, 2, 3)), 'unknown');
  assert.equal(isModelType('image/webp'), true);
  assert.equal(isModelType('image/avif'), false);
});

test('a Storage object URL maps to its re-encoded copy; any other URL does not', () => {
  assert.equal(
    renderUrl('https://piikwvntldytjejxmcla.supabase.co/storage/v1/object/public/binder-art/u1/p.jpg'),
    'https://piikwvntldytjejxmcla.supabase.co/storage/v1/render/image/public/binder-art/u1/p.jpg?width=1568&resize=contain&quality=80',
  );
  assert.equal(renderUrl('https://example.com/p.jpg'), null);
  assert.equal(renderUrl('https://piikwvntldytjejxmcla.supabase.co/storage/v1/object/sign/x/p.jpg?token=t'), null);
});

test('approve follows the picture: same SHA-256, or a near difference hash; nothing else', () => {
  const target = { sha256: 'aa', dhash: '0000000000000000' };
  const rows = [
    { id: 1, sha256: 'aa', dhash: null },
    { id: 2, sha256: 'bb', dhash: '0000000000000003' }, // 2 bits off: the same picture re-saved
    { id: 3, sha256: 'cc', dhash: 'ffffffffffffffff' }, // a different picture
    { id: 4, sha256: null, dhash: null },
  ];
  assert.deepEqual(samePictureRows(target, rows).map((r) => r.id), [1, 2]);
  assert.deepEqual(samePictureRows({ sha256: null, dhash: null }, rows), []);
});
