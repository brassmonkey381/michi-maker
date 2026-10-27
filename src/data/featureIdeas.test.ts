import { test } from 'node:test';
import assert from 'node:assert/strict';

import { FEATURE_IDEAS, VOTE_CAP, applyToggle, rankedIdeas } from './featureIdeas.ts';

test('ideas: ids are unique, server-shaped, and the copy carries no em-dash', () => {
  const ids = new Set(FEATURE_IDEAS.map((i) => i.id));
  assert.equal(ids.size, FEATURE_IDEAS.length);
  for (const i of FEATURE_IDEAS) {
    assert.match(i.id, /^[a-z][a-z0-9_-]{1,63}$/, i.id);
    assert.ok(!/—/.test(i.label + i.blurb), `${i.id}: no em-dash`);
    assert.ok(i.label.split(' ').length <= 6, `${i.id}: a short label`);
  }
  assert.ok(FEATURE_IDEAS.length <= VOTE_CAP, 'everyone can vote for every idea');
});

test('toggle: a click adds a vote, a second click takes it back, counts never go negative', () => {
  const s0 = { mine: new Set<string>(), counts: new Map([['a', 3]]) };
  const s1 = applyToggle(s0, 'a');
  assert.equal(s1.on, true);
  assert.equal(s1.counts.get('a'), 4);
  assert.ok(s1.mine.has('a'));
  const s2 = applyToggle(s1, 'a');
  assert.equal(s2.on, false);
  assert.equal(s2.counts.get('a'), 3);
  assert.ok(!s2.mine.has('a'));
  const odd = applyToggle({ mine: new Set(['b']), counts: new Map() }, 'b');
  assert.equal(odd.counts.get('b'), 0);
  // The input is not touched.
  assert.equal(s0.counts.get('a'), 3);
  assert.equal(s0.mine.size, 0);
});

test('ranking: most votes first, the written order breaks ties', () => {
  const ideas = [
    { id: 'x', label: 'x', blurb: '' },
    { id: 'y', label: 'y', blurb: '' },
    { id: 'z', label: 'z', blurb: '' },
  ];
  const r = rankedIdeas(new Map([['z', 2], ['y', 2]]), ideas);
  assert.deepEqual(r.map((i) => i.id), ['y', 'z', 'x']);
});
