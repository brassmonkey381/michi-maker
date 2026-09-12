import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  EMPTY_RECORD,
  MAX_EDITOR_OPENS,
  WALKTHROUGH_COPY,
  WALKTHROUGH_TOTAL,
  mergeRecord,
  normalizeRecord,
  resolveState,
  type WalkthroughRecord,
} from './firstPocketWalkthrough.ts';

const rec = (over: Partial<WalkthroughRecord> = {}): WalkthroughRecord => ({ ...EMPTY_RECORD, ...over });
const live = {
  hasCard: false,
  hadCardOnArrival: false,
  record: EMPTY_RECORD,
  editing: true,
  studio: false,
  pickerOpen: false,
  pageAdded: false,
};

test('a binder that already held cards retires it silently, before anything is drawn', () => {
  const s = resolveState({ ...live, hasCard: true, hadCardOnArrival: true });
  assert.equal(s.show, false);
  assert.equal(s.show === false && s.retire, 'not-needed');
});

test('the first card landing earns the closing line, and closing the browser hands off to the page step', () => {
  const justPlaced = resolveState({ ...live, hasCard: true, pickerOpen: true });
  assert.equal(justPlaced.show === true && justPlaced.step, 'placed');
  const closed = resolveState({ ...live, hasCard: true, pickerOpen: false });
  assert.equal(closed.show === true && closed.step, 'page');
});

test('the page step ends when a page is actually added, and not before', () => {
  const done = resolveState({ ...live, hasCard: true, pageAdded: true });
  assert.equal(done.show, false);
  assert.equal(done.show === false && done.retire, 'paged');
});

/** The step exists to be ignorable: nothing about it may gate the reader. */
test('the page step never outlives the session it was shown in', () => {
  // Walking away closes the editor, which draws and retires nothing...
  const away = resolveState({ ...live, hasCard: true, editing: false });
  assert.equal(away.show, false);
  assert.equal(away.show === false && away.retire, null);
  // ...and coming back to a binder that now holds a card retires it in silence, so a reader who
  // did not want a fourth step is never shown it twice.
  const back = resolveState({ ...live, hasCard: true, hadCardOnArrival: true });
  assert.equal(back.show === false && back.retire, 'not-needed');
});

test('a page added before a card is placed does not skip the earlier steps', () => {
  const s = resolveState({ ...live, pageAdded: true });
  assert.equal(s.show === true && s.step, 'ring');
});

test('an already-retired record draws nothing and writes nothing', () => {
  const s = resolveState({ ...live, record: rec({ retiredAt: '2026-09-10T00:00:00.000Z' }) });
  assert.equal(s.show, false);
  assert.equal(s.show === false && s.retire, null);
});

test('it retires itself once the editor has been opened too many times without a card', () => {
  const under = resolveState({ ...live, record: rec({ opens: MAX_EDITOR_OPENS }) });
  assert.equal(under.show, true);
  const over = resolveState({ ...live, record: rec({ opens: MAX_EDITOR_OPENS + 1 }) });
  assert.equal(over.show, false);
  assert.equal(over.show === false && over.retire, 'ignored');
});

test('reading the binder, or working in the studio, shows nothing and retires nothing', () => {
  for (const over of [{ editing: false }, { studio: true }]) {
    const s = resolveState({ ...live, ...over });
    assert.equal(s.show, false, JSON.stringify(over));
    assert.equal(s.show === false && s.retire, null, JSON.stringify(over));
  }
});

test('the step follows the browser: the ring until it opens, then the line inside it', () => {
  const shut = resolveState(live);
  assert.equal(shut.show === true && shut.step, 'ring');
  const open = resolveState({ ...live, pickerOpen: true });
  assert.equal(open.show === true && open.step, 'card');
});

test('merging two records is a union, and does not care which came first', () => {
  const a = rec({ opens: 3 });
  const b = rec({ opens: 1, retiredAt: '2026-09-10T10:00:00.000Z' });
  assert.deepEqual(mergeRecord(a, b), mergeRecord(b, a));
  assert.equal(mergeRecord(a, b).opens, 3);
  assert.equal(mergeRecord(a, b).retiredAt, '2026-09-10T10:00:00.000Z');
});

test('two retirements keep the earlier one, so the record only ever moves one way', () => {
  const early = rec({ retiredAt: '2026-09-01T00:00:00.000Z' });
  const late = rec({ retiredAt: '2026-09-10T00:00:00.000Z' });
  assert.equal(mergeRecord(early, late).retiredAt, '2026-09-01T00:00:00.000Z');
  assert.equal(mergeRecord(late, early).retiredAt, '2026-09-01T00:00:00.000Z');
});

test('anything storage hands back that is not a record reads as a fresh one', () => {
  for (const bad of [null, undefined, 42, 'x', [], {}, { v: 2, opens: 9 }, { v: 1, opens: 'lots' }]) {
    assert.deepEqual(normalizeRecord(bad), EMPTY_RECORD, JSON.stringify(bad) ?? 'undefined');
  }
  assert.deepEqual(normalizeRecord({ v: 1, opens: 2.7, retiredAt: '' }), { v: 1, opens: 2, retiredAt: null });
});

test('every callout is numbered, short, em-dash free, and points somewhere', () => {
  const seen = new Set<number>();
  for (const [step, c] of Object.entries(WALKTHROUGH_COPY)) {
    assert.ok(!`${c.title} ${c.body}`.includes('—'), `${step} has an em-dash`);
    assert.ok(c.title.length < 40, `${step}'s heading is too long for a callout`);
    assert.ok(c.body.length < 140, `${step}'s body is too long to be read at a glance`);
    assert.ok(c.arrow === 'up' || c.arrow === 'down', `${step} points nowhere`);
    assert.ok(c.index >= 1 && c.index <= WALKTHROUGH_TOTAL, `${step} is numbered ${c.index}`);
    seen.add(c.index);
  }
  // One number per step, so the counter can never read "2 of 4" twice.
  assert.equal(seen.size, WALKTHROUGH_TOTAL);
  // The pocket's own + glyph is not drawn on a narrow page, so no copy may point at one.
  assert.ok(!WALKTHROUGH_COPY.ring.body.includes('＋'));
});

/**
 * The last step names the add-page button by the words PRINTED ON IT (BinderScreen's `word="Page"`
 * on tool-add-page). If that label is ever changed back to a bare glyph, this copy sends people
 * looking for text that is not on the screen.
 */
test('the page step quotes the button label rather than describing a symbol', () => {
  assert.ok(WALKTHROUGH_COPY.page.body.includes('"+ Page"'));
});
