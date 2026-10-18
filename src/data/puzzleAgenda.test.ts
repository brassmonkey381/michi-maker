import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  buildAgenda, clashOnDate, firstFreeDay, monthGrid, monthLabel, monthOf, runwayDays, shiftMonth, weekdayOf,
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

test('a month grid is seven wide, padded to the weekday, with every day of the month once', () => {
  const grid = monthGrid([p('2026-10-31')], '2026-10-18', '2026-10');
  assert.ok(grid.every((w) => w.length === 7));
  // October 2026 starts on a Thursday (column 4) and has 31 days.
  assert.deepEqual(grid[0].slice(0, 4), [null, null, null, null]);
  assert.equal(grid[0][4]?.date, '2026-10-01');
  const days = grid.flat().filter((d): d is NonNullable<typeof d> => d !== null);
  assert.equal(days.length, 31);
  assert.equal(days[30].date, '2026-10-31');
  assert.ok(days[30].puzzle);
  assert.equal(days.find((d) => d.isToday)?.date, '2026-10-18');
});

test('months shift either way across a year end', () => {
  assert.equal(shiftMonth('2026-12', 1), '2027-01');
  assert.equal(shiftMonth('2027-01', -1), '2026-12');
  assert.equal(shiftMonth('2026-10', 14), '2027-12');
  assert.equal(monthOf('2026-10-18'), '2026-10');
  assert.equal(monthLabel('2026-10'), 'October 2026');
});
