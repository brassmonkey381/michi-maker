import assert from 'node:assert/strict';
import { test } from 'node:test';

import { cleanTags, MAX_PER_FACET, pageTagText, TAG_ART_STYLES, TAG_COLOURS, TAG_MOODS, TAG_SCHEMA, TAG_THEMES, tagTerms, usageCost } from './pageTags.ts';

test('the page text is deterministic and keeps pocket order', () => {
  const page = {
    title: 'Forest  friends',
    background: '#2E7D32',
    pictures: 0,
    cards: [
      { name: 'Bulbasaur', types: ['Grass'], illustrator: 'Mitsuhiro Arita', caption: 'Bulbasaur naps under ferns' },
      { name: 'Caterpie', types: ['Grass'], sceneTags: ['forest', 'leaves'] },
    ],
  };
  const a = pageTagText(page);
  assert.equal(a, pageTagText({ ...page }));
  assert.match(a, /^Page title: Forest friends\nBackground: #2e7d32\nCards \(2\):\n1\. Bulbasaur; types Grass; art by Mitsuhiro Arita; art: Bulbasaur naps under ferns\n2\. Caterpie; types Grass; art: forest, leaves$/);
});

test('a picture background is named, never sent as its address', () => {
  const t = pageTagText({ title: null, background: 'https://example.com/x.png', pictures: 2, cards: [] });
  assert.match(t, /Background: a picture/);
  assert.match(t, /Uploaded pictures on the page: 2/);
  assert.doesNotMatch(t, /example\.com/);
});

test('answers are kept to the closed lists and the per-facet limits', () => {
  const t = cleanTags({
    colours: ['Green', 'green', 'teal', 'yellow', 'brown', 'pink'],
    themes: ['forest', 'made-up'],
    moods: ['cozy'],
    art_styles: ['watercolor'],
    description: 'A green forest page.',
  });
  assert.deepEqual(t, { colours: ['green', 'yellow', 'brown'], themes: ['forest'], moods: ['cozy'], art_styles: ['watercolor'], description: 'A green forest page.' });
  assert.equal(t!.colours.length, MAX_PER_FACET.colours);
  assert.deepEqual(tagTerms(t!), ['green', 'yellow', 'brown', 'forest', 'cozy', 'watercolor']);
});

test('an unusable answer is null, not an empty row', () => {
  assert.equal(cleanTags(null), null);
  assert.equal(cleanTags({ colours: ['teal'], themes: [], moods: [], art_styles: [], description: '' }), null);
});

test('the schema enums are the lists, and the lists are lowercase single tokens', () => {
  assert.deepEqual(TAG_SCHEMA.properties.colours.items.enum, [...TAG_COLOURS]);
  for (const w of [...TAG_COLOURS, ...TAG_THEMES, ...TAG_MOODS, ...TAG_ART_STYLES]) assert.match(w, /^[a-z0-9-]+$/);
});

test('cost per 1,000 pages is about a dime at the planned token sizes', () => {
  // ~1,000 system tokens served from cache, ~350 page tokens, ~90 output tokens per page.
  const perThousand = usageCost({ input: 350_000, cacheWrite: 1_000, cacheRead: 1_000_000, output: 90_000 });
  assert.ok(perThousand > 0.02 && perThousand < 0.1, String(perThousand));
});
