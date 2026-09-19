import assert from 'node:assert/strict';
import { test } from 'node:test';

import { EDITOR_HINTS, editorHintKey, pageHalfFull } from './editorHints.ts';

test('every hint is a title and one or three short sentences, with no em-dash', () => {
  for (const [id, copy] of Object.entries(EDITOR_HINTS)) {
    assert.ok(copy.title.length <= 40, `${id} title`);
    assert.ok(copy.body.length <= 140, `${id} body is ${copy.body.length}`);
    assert.ok(!/—/.test(copy.title + copy.body), `${id} has an em-dash`);
  }
});

test('each hint remembers itself under its own key', () => {
  assert.notEqual(editorHintKey('pocket-bar'), editorHintKey('page-bar'));
});

test('half full counts pockets covered, so one 2x2 piece half fills a 3x3 short of it', () => {
  const s = (rowSpan: number, colSpan: number) => ({ rowSpan, colSpan });
  assert.equal(pageHalfFull({ rows: 3, cols: 3, slots: [s(2, 2)] }), false); // 4 of 9
  assert.equal(pageHalfFull({ rows: 3, cols: 3, slots: [s(2, 2), s(1, 1)] }), true); // 5 of 9
  assert.equal(pageHalfFull({ rows: 2, cols: 2, slots: [s(1, 1), s(1, 1)] }), true);
  assert.equal(pageHalfFull({ rows: 2, cols: 2, slots: [] }), false);
});
