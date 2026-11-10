/** MIC-017: the theme dice. Run: `npm test`. */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { DEMO_THEMES } from './demoThemes.ts';
import { rollThemeQuery, rollUntilFound } from './themeDice.ts';

/** A seeded generator so the rolls are repeatable. */
const seeded = (seed: number) => () => {
  seed = (seed * 1103515245 + 12345) % 2147483648;
  return seed / 2147483648;
};

test('every shape appears, and each is valid grammar from the demo list', () => {
  const rand = seeded(7);
  const kinds = new Set<string>();
  for (let i = 0; i < 400; i++) {
    const r = rollThemeQuery(rand);
    kinds.add(r.kind);
    const words = [...r.query.matchAll(/theme:(?:"([^"]+)"|([a-z]+))/g)].map((m) => m[1] ?? m[2]);
    assert.ok(words.length >= 1, r.query);
    for (const w of words) assert.ok(DEMO_THEMES.includes(w), `${w} not a demo theme`);
    if (r.kind === 'pair' || r.kind === 'minus') assert.notEqual(words[0], words[1], r.query);
    if (r.kind === 'minus') assert.match(r.query, / -theme:/);
    if (r.kind === 'exact') assert.match(r.query, /^theme:"[a-z ]+"$/);
  }
  assert.deepEqual([...kinds].sort(), ['exact', 'minus', 'pair', 'single']);
});

test('an empty roll rolls again; the last roll stands after three', async () => {
  const seen: string[] = [];
  const r = await rollUntilFound(seeded(3), 'pokemon', async (q) => { seen.push(q); return seen.length < 3 ? 0 : 12; });
  assert.equal(seen.length, 3);
  assert.equal(r.query, seen[2]);
  const none: string[] = [];
  await rollUntilFound(seeded(5), 'pokemon', async (q) => { none.push(q); return 0; });
  assert.equal(none.length, 3);
});

test('an unknown count is taken as fine, so a slow server never makes the dice look dead', async () => {
  let calls = 0;
  await rollUntilFound(seeded(9), 'pokemon', async () => { calls++; return null; });
  assert.equal(calls, 1);
});
