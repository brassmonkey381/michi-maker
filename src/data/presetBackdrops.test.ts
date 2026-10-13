import assert from 'node:assert/strict';
import test from 'node:test';

import { PRESET_PICTURES, presetFor, presetsOf } from './presetBackdrops.ts';

const OURS = /^https:\/\/piikwvntldytjejxmcla\.supabase\.co\/storage\/v1\/object\/public\/binder-art\//;

test('every preset is hosted in our own bucket, never hotlinked (owner, 2026-10-13)', () => {
  for (const p of PRESET_PICTURES) {
    assert.match(p.url, OURS, p.id);
    assert.match(p.thumb, OURS, p.id);
    assert.ok(p.author && p.page.startsWith('https://'), p.id);
  }
});

test('ten textures, twenty themes, every id once', () => {
  assert.equal(presetsOf('texture').length, 10);
  assert.equal(presetsOf('theme').length, 20);
  assert.equal(new Set(PRESET_PICTURES.map((p) => p.id)).size, PRESET_PICTURES.length);
  assert.equal(new Set(PRESET_PICTURES.map((p) => p.url)).size, PRESET_PICTURES.length);
});

test('a stored address is traced back to its preset; a pasted link is not one', () => {
  const gold = presetsOf('texture').find((p) => p.id === 'gold')!;
  assert.equal(presetFor(gold.url)?.id, 'gold');
  assert.equal(presetFor('https://example.com/mine.jpg'), null);
  assert.equal(presetFor(null), null);
});
