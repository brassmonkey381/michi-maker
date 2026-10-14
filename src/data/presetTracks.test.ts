import assert from 'node:assert/strict';
import test from 'node:test';

import { PRESET_TRACKS, presetTrackFor, presetTrackName, trackLength } from './presetTracks.ts';

const OURS = /^https:\/\/piikwvntldytjejxmcla\.supabase\.co\/storage\/v1\/object\/public\/binder-audio\//;
const BUCKET_LIMIT = 8 * 1024 * 1024;

test('every preset track is hosted in our own audio bucket and fits its limit', () => {
  assert.ok(PRESET_TRACKS.length >= 12);
  for (const t of PRESET_TRACKS) {
    assert.match(t.url, OURS, t.id);
    assert.ok(t.bytes > 0 && t.bytes <= BUCKET_LIMIT, `${t.id}: ${t.bytes} bytes`);
    assert.ok(t.seconds >= 30 && t.seconds <= 600, `${t.id}: ${t.seconds}s`);
    assert.ok(t.label && t.mood, t.id);
  }
  assert.equal(new Set(PRESET_TRACKS.map((t) => t.id)).size, PRESET_TRACKS.length);
  assert.equal(new Set(PRESET_TRACKS.map((t) => t.url)).size, PRESET_TRACKS.length);
});

test('a stored address is traced back to its preset; an upload is not one', () => {
  const first = PRESET_TRACKS[0];
  assert.equal(presetTrackFor(first.url)?.id, first.id);
  assert.equal(presetTrackFor('https://piikwvntldytjejxmcla.supabase.co/storage/v1/object/public/binder-audio/u/mine.mp3'), undefined);
  assert.equal(presetTrackFor(null), undefined);
});

test('the shown name carries the credit the licence asks for', () => {
  const name = presetTrackName(PRESET_TRACKS[0]);
  assert.ok(name.startsWith(PRESET_TRACKS[0].label));
  assert.match(name, /Kevin MacLeod/);
  assert.match(name, /CC BY 4\.0/);
  assert.equal(trackLength(187), '3:07');
  assert.equal(trackLength(40), '0:40');
});
