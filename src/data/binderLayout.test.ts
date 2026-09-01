/**
 * The page-sizing rules, which exist to make one promise measurable: the page you are looking at
 * takes the space. These tests are the promise written down — a regression here is a return to a
 * 29%-of-a-4K-monitor page, which is what this replaced.
 *
 * The height inverse is the part most likely to rot, because it duplicates BinderGrid's layout
 * sum. It is tested as a round trip against pageHeightAt rather than against fixed numbers, so a
 * change to the grid's padding breaks these loudly instead of drifting quietly.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  LEGACY_MIN_WIDTH,
  MIN_PAGE_WIDTH,
  PEEK_MIN_WIDTH,
  PEEK_WIDTH,
  SPREAD_GAP,
  bookLayout,
  pageHeightAt,
  spreadLayout,
  widthForHeight,
} from './binderLayout.ts';

const TALL = 10_000; // "height is not the constraint here"

function spread(availableWidth: number, availableHeight = TALL, over = {}) {
  return spreadLayout({
    availableWidth,
    availableHeight,
    rows: 3,
    cols: 3,
    captionsOn: false,
    hasNeighbours: true,
    ...over,
  });
}

test('leftover width goes to the peeks, never back into thirds', () => {
  // A landscape monitor caps the page by HEIGHT, so on a wide window there is width the page
  // cannot use. It goes to the neighbours rather than to blank margin — but never so far that the
  // layout drifts back to the three equal columns this replaced.
  const wide = spread(1888, 760);
  assert.ok(wide.peekWidth > PEEK_WIDTH, `peeks should absorb slack, got ${wide.peekWidth}`);
  assert.ok(
    wide.pageWidth > wide.peekWidth * 2,
    `page ${wide.pageWidth} must still outweigh both peeks (${wide.peekWidth * 2})`,
  );
  const total = wide.pageWidth + 2 * wide.peekWidth + 2 * SPREAD_GAP;
  assert.ok(total <= 1888, `layout overflows: ${total} into 1888`);
});

test('the page takes the width the neighbours used to', () => {
  // The whole point. At a 1440 window the editor has 1408: the old thirds gave the live page 461
  // and its two dimmed companions 922 between them.
  const { pageWidth, peekWidth } = spread(1408);
  assert.equal(peekWidth, PEEK_WIDTH);
  assert.equal(pageWidth, 1408 - 2 * (PEEK_WIDTH + SPREAD_GAP));
  assert.ok(pageWidth > 461 * 2, `expected far more than the old 461, got ${pageWidth}`);
});

test('the live page beats both peeks put together, at every width that shows them', () => {
  // The inversion this replaced: neighbours outweighing the page 2:1.
  for (const w of [700, 900, 1024, 1408, 1888, 2528]) {
    const { pageWidth, peekWidth } = spread(w);
    assert.ok(pageWidth > peekWidth * 2, `${w}: page ${pageWidth} vs peeks ${peekWidth * 2}`);
  }
});

test('height caps growth once there is room to grow', () => {
  // On a tall window the page can outgrow the old ceiling, but only as far as the height allows —
  // otherwise the bottom row goes under the fold on the very screens this is meant to help.
  const { pageWidth } = spread(1888, 1400);
  assert.ok(pageWidth > LEGACY_MIN_WIDTH, `expected growth past ${LEGACY_MIN_WIDTH}, got ${pageWidth}`);
  assert.ok(pageHeightAt(pageWidth, 3, 3, false) <= 1401, 'and it still fits');
  assert.ok(pageWidth < 1888 - 2 * (PEEK_WIDTH + SPREAD_GAP), 'height bound before width');
});

test('a SHORT window is never shrunk below what it renders today', () => {
  // The correction the measurements forced. Fitting a 3x3 into a 1080p window's height gives about
  // 540px and a 768-tall one about 320px — so fitting alone would have made every laptop worse
  // than the 560px it already had. The fit may grow the page; it may not shrink it.
  for (const h of [700, 760, 900]) {
    const { pageWidth } = spread(1888, h);
    assert.ok(pageWidth >= LEGACY_MIN_WIDTH, `height ${h} gave ${pageWidth}, worse than today`);
  }
});

test('no height budget means width alone decides — never worse than before', () => {
  const withHeight = spread(1408, 0);
  const unbounded = spread(1408, TALL);
  assert.equal(withHeight.pageWidth, unbounded.pageWidth);
});

test('widthForHeight is the true inverse of pageHeightAt', () => {
  const shapes: { rows: number; cols: number; captions: boolean }[] = [
    { rows: 3, cols: 3, captions: false },
    { rows: 3, cols: 3, captions: true },
    { rows: 2, cols: 2, captions: false },
    { rows: 3, cols: 4, captions: true },
    { rows: 4, cols: 4, captions: false },
  ];
  for (const { rows, cols, captions } of shapes) {
    for (const h of [500, 760, 900, 1400]) {
      const w = widthForHeight(h, rows, cols, captions);
      const back = pageHeightAt(w, rows, cols, captions);
      assert.ok(Math.abs(back - h) < 1, `${rows}x${cols} caps=${captions} h=${h}: round-tripped to ${back}`);
    }
  }
});

test('captions cost height, so they cost width too', () => {
  const without = spread(1888, 800, { captionsOn: false }).pageWidth;
  const withCaps = spread(1888, 800, { captionsOn: true }).pageWidth;
  assert.ok(withCaps < without, 'a caption strip per row must shrink the height-fitted page');
});

test('more rows in the same height means smaller CARDS, not a narrower page', () => {
  // Worth stating because the obvious guess is wrong: a 4x4 comes out marginally WIDER than a
  // 3x3 in the same vertical budget, since four columns plus their extra gaps roughly cancel the
  // shorter cells. What actually shrinks is the card, which is the thing that matters.
  const cardWidth = (pageWidth: number, cols: number) => (pageWidth - 24 - 6 * (cols - 1)) / cols;
  const three = spread(1888, 800, { rows: 3, cols: 3 }).pageWidth;
  const four = spread(1888, 800, { rows: 4, cols: 4 }).pageWidth;
  assert.ok(
    cardWidth(four, 4) < cardWidth(three, 3),
    `4x4 cards ${cardWidth(four, 4)} should be smaller than 3x3 ${cardWidth(three, 3)}`,
  );
  assert.ok(pageHeightAt(four, 4, 4, false) <= 801, 'and it still fits the height');
});

test('narrow windows drop the peeks entirely rather than starving the page', () => {
  const { showPeeks, peekWidth, pageWidth } = spread(PEEK_MIN_WIDTH - 1);
  assert.equal(showPeeks, false);
  assert.equal(peekWidth, 0);
  assert.equal(pageWidth, PEEK_MIN_WIDTH - 1, 'the page gets the whole width instead');
});

test('a single-page binder never shows peeks', () => {
  const { showPeeks, pageWidth } = spread(1888, TALL, { hasNeighbours: false });
  assert.equal(showPeeks, false);
  assert.equal(pageWidth, 1888);
});

test('the phone keeps what already worked', () => {
  // 390px window, 358 available. It was the one size already keeping the promise (92%).
  const { pageWidth, showPeeks } = spread(358);
  assert.equal(showPeeks, false);
  assert.equal(pageWidth, 358);
});

test('a short window still yields a usable page, not a stamp', () => {
  const { pageWidth } = spread(1888, 200);
  assert.ok(pageWidth >= MIN_PAGE_WIDTH, `floor breached: ${pageWidth}`);
});

test('an explicit maxWidth is respected', () => {
  assert.equal(spread(1888, TALL, { maxWidth: 600 }).pageWidth, 600);
});

test('the book fills the width it has, and fits the height', () => {
  // Double-sided has no dimmed neighbours, so both halves are content: its only old constraint
  // was the 560 ceiling, which left 752px empty on a 1920 window.
  const wide = bookLayout({ availableWidth: 1888, availableHeight: TALL, rows: 3, cols: 3, captionsOn: false, gap: 16 });
  assert.equal(wide, Math.floor((1888 - 16) / 2));
  assert.ok(wide > 560, 'the book must be able to outgrow the old cap');

  // Tall windows let it fit the height; short ones keep today's size rather than shrinking.
  const tallFit = bookLayout({ availableWidth: 3000, availableHeight: 1200, rows: 3, cols: 3, captionsOn: false, gap: 16 });
  assert.ok(pageHeightAt(tallFit, 3, 3, false) <= 1201, 'the book fits the height when height binds');
  const short = bookLayout({ availableWidth: 1888, availableHeight: 700, rows: 3, cols: 3, captionsOn: false, gap: 16 });
  assert.ok(short >= LEGACY_MIN_WIDTH, `short window shrank the book to ${short}`);
});

test('every result is a whole number of pixels', () => {
  for (const w of [391, 703, 1025, 1441]) {
    const { pageWidth, peekWidth } = spread(w, 811);
    assert.equal(pageWidth, Math.floor(pageWidth));
    assert.equal(peekWidth, Math.floor(peekWidth));
  }
});
