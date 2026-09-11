/**
 * The link preview's page choice, and the deep link that follows from it. Run: `npm test`.
 *
 * THE POINT OF THIS FILE is the last test: the rule exists twice, once in TypeScript for the app
 * and once in `api/_lib.js` for the Open Graph endpoints, and the two must never disagree. A link
 * whose picture shows page 7 and whose `page=` says 4 is worse than no deep link at all. So both
 * implementations are run over the same fixtures here.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { choosePreviewPages, previewDeepLinkPage, PREVIEW_FETCH_CAP } from './previewPages.ts';
import type { DemoBinder, DemoPage, DemoSlot } from './binderTypes.ts';

const slot = (n: number): DemoSlot[] =>
  Array.from({ length: n }, (_, i) => ({
    id: `s${i}`,
    row: Math.floor(i / 3),
    col: i % 3,
    rowSpan: 1,
    colSpan: 1,
    type: 'card' as const,
    cardId: `c${i}`,
  }));

const page = (id: string, cards: number): DemoPage =>
  ({ id, rows: 3, cols: 3, slots: slot(cards) }) as DemoPage;

const binder = (pages: DemoPage[], sharePageIds?: string[]) =>
  ({ id: 'b', title: 't', layoutStyle: 'anchor', isExample: false, pages, sharePageIds }) as unknown as DemoBinder;

test('the two fullest pages are shown, in page order', () => {
  const b = binder([page('a', 2), page('b', 9), page('c', 5)]);
  assert.deepEqual(choosePreviewPages(b).map((p) => p.id), ['b', 'c']);
});

test('an explicit selection wins over fullness', () => {
  const b = binder([page('a', 2), page('b', 9), page('c', 5)], ['a']);
  assert.deepEqual(choosePreviewPages(b).map((p) => p.id), ['a']);
});

test('an empty page is never previewed, even when featured', () => {
  const b = binder([page('a', 0), page('b', 4)], ['a']);
  assert.deepEqual(choosePreviewPages(b).map((p) => p.id), ['b'], 'it falls back rather than show nothing');
});

test('two very full pages cost too much to fetch, so only the fullest is shown', () => {
  const b = binder([page('a', PREVIEW_FETCH_CAP), page('b', PREVIEW_FETCH_CAP)]);
  assert.equal(choosePreviewPages(b).length, 1);
});

test('the deep link points at the LAST page the picture shows', () => {
  const b = binder([page('a', 2), page('b', 9), page('c', 5)]);
  assert.equal(previewDeepLinkPage(b), 3, 'the preview is pages b and c, so the link opens on c');
});

test('no deep link when the preview is the first page, or when there is nothing to show', () => {
  assert.equal(previewDeepLinkPage(binder([page('a', 9), page('b', 0)])), null, 'page 1 is where it opens anyway');
  assert.equal(previewDeepLinkPage(binder([page('a', 0)])), null);
  assert.equal(previewDeepLinkPage(binder([])), null);
});

/**
 * THE DRIFT GUARD. Same fixtures, both implementations, and the server's own module rather than a
 * description of it. If this fails, the app and the link preview have started disagreeing about
 * which page a shared link is a picture of.
 */
test('the app and the Open Graph endpoints choose the same pages', () => {
  const require = createRequire(import.meta.url);
  const lib = require(join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'api', '_lib.js'));

  /** The same binder in the shape the server reads: a Supabase row, not a DemoBinder. */
  const asRow = (pages: DemoPage[], sharePageIds?: string[]) => ({
    share_page_ids: sharePageIds ?? null,
    binder_pages: pages.map((p, position) => ({
      id: p.id,
      position,
      rows: p.rows,
      cols: p.cols,
      binder_slots: (p.slots ?? []).map((s) => ({ card_id: s.cardId ?? null, image_url: s.imageUrl ?? null })),
    })),
  });

  const cases: [DemoPage[], string[] | undefined][] = [
    [[page('a', 2), page('b', 9), page('c', 5)], undefined],
    [[page('a', 2), page('b', 9), page('c', 5)], ['a']],
    [[page('a', 0), page('b', 4)], ['a']],
    [[page('a', PREVIEW_FETCH_CAP), page('b', PREVIEW_FETCH_CAP)], undefined],
    [[page('a', 9)], undefined],
    [[page('a', 0)], undefined],
    [[], undefined],
    [[page('a', 3), page('b', 3)], undefined],
    [[page('a', 1), page('b', 9), page('c', 9)], ['b', 'c']],
  ];

  for (const [pages, featured] of cases) {
    const mine = choosePreviewPages(binder(pages, featured)).map((p) => p.id);
    const theirs = lib.choosePreviewPages(asRow(pages, featured)).map((p: { id: string }) => p.id);
    assert.deepEqual(mine, theirs, `disagreement on ${JSON.stringify({ pages: pages.map((p) => p.id), featured })}`);
  }
});
