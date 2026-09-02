import { test } from 'node:test';
import assert from 'node:assert/strict';

import { buildStickerLibrary, filterStickers, stickerSeries, type StickerTaxonomy } from './stickerLibrary.ts';

/** A stub of the two taxonomy calls, shaped like the kit's, with one set lacking a logo. */
const tax: StickerTaxonomy = {
  listSeries: () => [
    { id: 'sv', name: 'Scarlet & Violet', coverUri: 'https://x/sv.png', releaseDate: '2023-03-31' },
    { id: 'swsh', name: 'Sword & Shield', coverUri: 'https://x/swsh.png', releaseDate: '2020-02-07' },
    { id: 'nologo', name: 'Series Without Art', releaseDate: '2010-01-01' },
  ],
  listSets: (seriesId) =>
    seriesId === 'sv'
      ? [
          { id: 'sv1', name: 'Scarlet & Violet', code: 'SV1', seriesId: 'sv', coverUri: 'https://x/sv1.png', releaseDate: '2023-03-31' },
          { id: 'sv3', name: 'Obsidian Flames', code: 'SV3', seriesId: 'sv', coverUri: 'https://x/sv3.png', releaseDate: '2023-08-11' },
          { id: 'sv2', name: 'Paldea Evolved', code: 'SV2', seriesId: 'sv', releaseDate: '2023-06-09' }, // no logo
        ]
      : seriesId === 'swsh'
        ? [{ id: 'swsh1', name: 'Sword & Shield', code: 'SWSH1', seriesId: 'swsh', coverUri: 'https://x/swsh1.png', releaseDate: '2020-02-07' }]
        : [{ id: 'old1', name: 'Old Set', code: 'OLD', seriesId: 'nologo', coverUri: 'https://x/old.png', releaseDate: '2010-01-01' }],
};

test('every logo the taxonomy has, and nothing without one', () => {
  const items = buildStickerLibrary(tax);
  assert.deepEqual(
    items.map((i) => i.id),
    ['series:sv', 'set:sv3', 'set:sv1', 'series:swsh', 'set:swsh1', 'set:old1'],
  );
  // The set with no coverUri is not a sticker; the series with none still contributes its sets.
  assert.ok(!items.some((i) => i.id === 'set:sv2'));
  assert.ok(items.some((i) => i.id === 'set:old1'));
});

test('newest first: the series logo leads its sets, newest set first', () => {
  const items = buildStickerLibrary(tax);
  assert.equal(items[0].kind, 'series');
  assert.equal(items[1].id, 'set:sv3'); // 2023-08 before 2023-03
  const svIdx = items.findIndex((i) => i.seriesId === 'sv');
  const swshIdx = items.findIndex((i) => i.seriesId === 'swsh');
  assert.ok(svIdx < swshIdx);
});

test('a sticker carries the key that lets a changed logo URL be re-resolved', () => {
  const items = buildStickerLibrary(tax);
  const sv3 = items.find((i) => i.id === 'set:sv3')!;
  assert.equal(sv3.code, 'SV3');
  assert.equal(sv3.seriesName, 'Scarlet & Violet');
  assert.equal(sv3.uri, 'https://x/sv3.png');
});

test('filter matches name, code, series name and the series abbreviation', () => {
  const items = buildStickerLibrary(tax);
  assert.deepEqual(filterStickers(items, 'obsidian').map((i) => i.id), ['set:sv3']);
  assert.deepEqual(filterStickers(items, 'sv3').map((i) => i.id), ['set:sv3']);
  assert.ok(filterStickers(items, 'sword').every((i) => i.seriesId === 'swsh'));
  assert.equal(filterStickers(items, '').length, items.length);
  assert.equal(filterStickers(items, '   ').length, items.length);
});

test('the series chip row is distinct, in library order, with the series logo where there is one', () => {
  const s = stickerSeries(buildStickerLibrary(tax));
  assert.deepEqual(
    s.map((x) => [x.id, x.uri ?? null]),
    [
      ['sv', 'https://x/sv.png'],
      ['swsh', 'https://x/swsh.png'],
      ['nologo', null],
    ],
  );
});
