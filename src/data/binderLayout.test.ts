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
  PANEL_GAP,
  PANEL_MAX_WIDTH,
  PANEL_MIN_WIDTH,
  panelLayout,
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

test('A SHORT WINDOW SHRINKS THE PAGE, so the page still fits in it', () => {
  // THIS TEST USED TO ASSERT THE OPPOSITE, and the reversal is the point rather than an accident.
  //
  // It read "a short window is never shrunk below what it renders today" and held pageWidth at or
  // above LEGACY_MIN_WIDTH (560) for exactly these heights, on the reasoning that fitting alone
  // would make every laptop's page smaller than it used to be. True — and it bought that size with
  // the one thing a binder page cannot afford, which is being cut off by the fold. A floor above
  // the height budget is an instruction to overflow.
  //
  // So the promise is inverted: at these heights the page comes out SMALLER than the old floor, and
  // in exchange it fits.
  for (const h of [700, 760, 900]) {
    const { pageWidth } = spread(1888, h);
    assert.ok(
      pageHeightAt(pageWidth, 3, 3, false) <= h + 1,
      `height ${h}: page is ${pageHeightAt(pageWidth, 3, 3, false)} tall, which does not fit`,
    );
  }
  // And it really is the shrink doing it, not a coincidence of these numbers: 700 and 760 are the
  // heights that used to be held up at 560.
  assert.ok(spread(1888, 700).pageWidth < LEGACY_MIN_WIDTH, 'a 700px-tall window should now shrink');
});

test('the floor that remains is absolute, and it is the only one', () => {
  // MIN_PAGE_WIDTH is where fitting stops: below a stamp there is nothing left to see, and at that
  // point overflowing is the better failure. Every window taller than that fits exactly.
  const tiny = spread(1888, 120);
  assert.equal(tiny.pageWidth, MIN_PAGE_WIDTH);
  assert.ok(pageHeightAt(tiny.pageWidth, 3, 3, false) > 120, 'and this is the case that cannot fit');
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

  // Height binds in both directions now — it grows the book on a tall window and shrinks it on a
  // short one. An open book that does not fit the window is two half-pages.
  const tallFit = bookLayout({ availableWidth: 3000, availableHeight: 1200, rows: 3, cols: 3, captionsOn: false, gap: 16 });
  assert.ok(pageHeightAt(tallFit, 3, 3, false) <= 1201, 'the book fits the height when height binds');
  const short = bookLayout({ availableWidth: 1888, availableHeight: 700, rows: 3, cols: 3, captionsOn: false, gap: 16 });
  assert.ok(pageHeightAt(short, 3, 3, false) <= 701, `short window: book is ${pageHeightAt(short, 3, 3, false)} tall`);
  assert.ok(short < LEGACY_MIN_WIDTH, 'and it got there by shrinking, as the spread does');
});

test('every result is a whole number of pixels', () => {
  for (const w of [391, 703, 1025, 1441]) {
    const { pageWidth, peekWidth } = spread(w, 811);
    assert.equal(pageWidth, Math.floor(pageWidth));
    assert.equal(peekWidth, Math.floor(peekWidth));
  }
});

/* --- the panels beside the page ------------------------------------------------------------- */

const panels = (availableWidth: number, pageNeed: number, n: number) =>
  panelLayout({ availableWidth, pageNeed, panels: n });

test('a 1920 desktop has room for two real panels, not two token ones', () => {
  // The case that prompted this. A height-fitted 3x3 on a 1080p window is about 540px wide, so a
  // 1920 desktop has well over a thousand pixels doing nothing — and the panels used to be a fixed
  // 460 each regardless, leaving hundreds of pixels of margin while the card grid scrolled in a
  // column too narrow for it.
  const out = panels(1888, 560, 2);
  assert.deepEqual(out.fits, ['docked', 'docked']);
  assert.ok(out.panelWidth > 460, `expected the panels to grow past the old fixed 460, got ${out.panelWidth}`);
  // And the arithmetic balances: what the panels took plus what the page kept is what there was.
  assert.equal(out.pageBudget, 1888 - (out.panelWidth + PANEL_GAP) * 2);
});

test('the page keeps what its height entitles it to; the panels divide the rest', () => {
  const out = panels(1888, 560, 2);
  assert.ok(out.pageBudget >= 560, `the page was squeezed to ${out.pageBudget}`);
});

test('surplus goes back to the page rather than into an over-wide panel', () => {
  // On an ultra-wide there is more slack than a browser can use; past PANEL_MAX_WIDTH the extra is
  // margin, so the page keeps it.
  const out = panels(3400, 560, 2);
  assert.equal(out.panelWidth, PANEL_MAX_WIDTH);
  assert.ok(out.pageBudget > 1000, `the page should get the surplus, got ${out.pageBudget}`);
});

test('with room for one panel and not two, ONE keeps its dock', () => {
  // Degrading both at once is tidier and worse: a usable panel beside the page beats symmetry.
  // At 1200 the slack is 640: two panels would be 304 each after gaps, under the 360 that makes a
  // panel worth docking — but one panel gets 624, which is a real browser. (1400 is NOT this case:
  // there the slack affords 404 each and both stay, which is the arithmetic working.)
  const out = panels(1200, 560, 2);
  assert.deepEqual(out.fits, ['docked', 'modal']);
  assert.ok(out.panelWidth >= PANEL_MIN_WIDTH);
});

test('the panel that keeps its dock is the one asked for first', () => {
  // So the caller decides which side survives, rather than it depending on the arithmetic.
  assert.deepEqual(panels(1200, 560, 2).fits, ['docked', 'modal']);
  // And where there IS room for both, both stay.
  assert.deepEqual(panels(1400, 560, 2).fits, ['docked', 'docked']);
});

test('too narrow for even one, and nothing docks', () => {
  const out = panels(900, 560, 2);
  assert.deepEqual(out.fits, ['modal', 'modal']);
  assert.equal(out.panelWidth, 0);
  assert.equal(out.pageBudget, 900);
});

test('a panel never shrinks the page to fit itself', () => {
  // The whole inversion. If the leftover cannot afford a panel, the panel goes to a modal — the
  // page does not give up pixels it needs to keep a panel docked.
  for (const w of [900, 1100, 1400, 1888, 2560]) {
    const out = panels(w, 560, 2);
    assert.ok(out.pageBudget >= 560, `${w}: page budget fell to ${out.pageBudget}`);
  }
});

test('no panels open means the page has the whole width', () => {
  assert.deepEqual(panels(1888, 560, 0), { panelWidth: 0, fits: [], pageBudget: 1888 });
});

test('one panel takes all the usable slack, not half of it', () => {
  const out = panels(1888, 560, 1);
  assert.deepEqual(out.fits, ['docked']);
  assert.equal(out.panelWidth, Math.min(PANEL_MAX_WIDTH, 1888 - 560 - PANEL_GAP));
});

test('every panel width is a whole number of pixels', () => {
  for (const w of [1401, 1607, 1889]) {
    const { panelWidth } = panels(w, 561, 2);
    assert.equal(panelWidth, Math.floor(panelWidth));
  }
});
