import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  buildAgenda, clashOnDate, firstFreeDay, runwayDays, weekdayOf,
} from './puzzleAgenda.ts';

const p = (publishOn: string, sourcePageId: string | null = 'page-' + publishOn, hint: string | null = null) =>
  ({ id: 'id-' + publishOn, publishOn, sourcePageId, hint });

test('an agenda has a row per day whether or not a puzzle is on it', () => {
  const agenda = buildAgenda([p('2026-10-02'), p('2026-10-04')], '2026-10-02', { days: 4 });
  assert.deepEqual(agenda.map((d) => d.date), ['2026-10-02', '2026-10-03', '2026-10-04', '2026-10-05']);
  assert.deepEqual(agenda.map((d) => Boolean(d.puzzle)), [true, false, true, false]);
});

test('it marks today and the days already gone', () => {
  const agenda = buildAgenda([], '2026-10-02', { from: '2026-09-30', days: 4 });
  assert.deepEqual(agenda.map((d) => d.isPast), [true, true, false, false]);
  assert.deepEqual(agenda.map((d) => d.isToday), [false, false, true, false]);
});

test('weekdays are read in UTC so a timezone cannot shift them', () => {
  assert.equal(weekdayOf('2026-10-02'), 'Fri');
  assert.equal(weekdayOf('2026-10-04'), 'Sun');
  assert.equal(weekdayOf('nonsense'), '');
});

test('it crosses a month boundary without arithmetic of its own', () => {
  const agenda = buildAgenda([], '2026-09-30', { days: 3 });
  assert.deepEqual(agenda.map((d) => d.date), ['2026-09-30', '2026-10-01', '2026-10-02']);
});

test('the first free day skips filled days and never offers a day already gone', () => {
  const agenda = buildAgenda([p('2026-10-02'), p('2026-10-03')], '2026-10-02', { from: '2026-10-01', days: 5 });
  // 10-01 is empty but in the past, so it is not on offer.
  assert.equal(firstFreeDay(agenda), '2026-10-04');
});

test('runway counts the unbroken run from today, not every filled day', () => {
  const agenda = buildAgenda(
    [p('2026-10-02'), p('2026-10-03'), p('2026-10-06')],
    '2026-10-02', { days: 6 },
  );
  assert.equal(runwayDays(agenda), 2, 'the gap on the 4th ends the runway');
});

test('runway ignores the past, so yesterday being filled does not pad it', () => {
  const agenda = buildAgenda([p('2026-10-01')], '2026-10-02', { from: '2026-10-01', days: 3 });
  assert.equal(runwayDays(agenda), 0);
});

/**
 * The 2026-09-28 incident: publishing while the date box said one day and the picker was on
 * another silently replaced a scheduled puzzle, and two dates ended up holding the same page.
 */
test('a clash is reported when a different page would replace a scheduled puzzle', () => {
  const queue = [p('2026-10-03', 'page-A')];
  const hit = clashOnDate(queue, '2026-10-03', 'page-B');
  assert.equal(hit?.id, 'id-2026-10-03');
});

test('re-publishing the same page to the same date is not a clash', () => {
  const queue = [p('2026-10-03', 'page-A')];
  assert.equal(clashOnDate(queue, '2026-10-03', 'page-A'), null, 'fixing a hint must not prompt');
});

test('an empty date never clashes', () => {
  assert.equal(clashOnDate([p('2026-10-03', 'page-A')], '2026-10-04', 'page-B'), null);
});

test('with no page chosen yet, an occupied date still warns', () => {
  const queue = [p('2026-10-03', 'page-A')];
  assert.equal(clashOnDate(queue, '2026-10-03', null)?.id, 'id-2026-10-03');
});
