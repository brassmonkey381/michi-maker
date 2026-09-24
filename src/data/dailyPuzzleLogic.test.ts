import assert from 'node:assert/strict';
import test from 'node:test';

import {
  dailyPuzzleChoice,
  shiftUtcDate,
  streakLength,
  countdownText,
  nextRollover,
  puzzleDay,
  utcDate,
  verdictText,
  withDailyPuzzleChoice,
} from './dailyPuzzleLogic.ts';

const won = (d: string) => ({ publishOn: d, correct: true });
const lost = (d: string) => ({ publishOn: d, correct: false });

test('the choice reads out of preferences, and anything else is unasked', () => {
  assert.equal(dailyPuzzleChoice({ dailyPuzzle: 'on' }), 'on');
  assert.equal(dailyPuzzleChoice({ dailyPuzzle: 'declined' }), 'declined');
  assert.equal(dailyPuzzleChoice({}), null);
  assert.equal(dailyPuzzleChoice(null), null);
  assert.equal(dailyPuzzleChoice('nonsense'), null);
  assert.equal(dailyPuzzleChoice({ dailyPuzzle: 'maybe' }), null);
});

test('recording the choice keeps the rest of the blob', () => {
  const merged = withDailyPuzzleChoice({ cardLanguages: ['en'] }, 'on');
  assert.deepEqual(merged, { cardLanguages: ['en'], dailyPuzzle: 'on' });
  assert.deepEqual(withDailyPuzzleChoice('nonsense', 'declined'), { dailyPuzzle: 'declined' });
});

test('dates move in whole UTC days', () => {
  assert.equal(shiftUtcDate('2026-09-24', -1), '2026-09-23');
  assert.equal(shiftUtcDate('2026-03-01', -1), '2026-02-28');
  assert.equal(shiftUtcDate('2026-01-01', -1), '2025-12-31');
  assert.equal(utcDate(new Date('2026-09-24T06:00:00-10:00')), '2026-09-24');
});

test('a streak counts back from today', () => {
  const plays = [won('2026-09-24'), won('2026-09-23'), won('2026-09-22')];
  assert.equal(streakLength(plays, '2026-09-24'), 3);
});

/**
 * The case that decides whether the number feels fair: opening the site before playing must not
 * read as a broken streak. It is broken by a MISSED day, not an unfinished one.
 */
test('today not yet played keeps yesterday\'s streak', () => {
  const plays = [won('2026-09-23'), won('2026-09-22')];
  assert.equal(streakLength(plays, '2026-09-24'), 2);
});

test('a missed day ends it, and a wrong answer is a missed day', () => {
  assert.equal(streakLength([won('2026-09-24'), won('2026-09-22')], '2026-09-24'), 1);
  assert.equal(streakLength([lost('2026-09-23'), won('2026-09-22')], '2026-09-24'), 0);
});

test('no plays is no streak', () => {
  assert.equal(streakLength([], '2026-09-24'), 0);
});

test('the verdict says how many and never which', () => {
  assert.equal(verdictText(2, 2), 'Correct, all 2.');
  assert.equal(verdictText(1, 1), 'Correct.');
  assert.equal(verdictText(1, 2), '1 of 2. Close.');
  assert.equal(verdictText(0, 2), 'None of those, not this time.');
  for (const text of [verdictText(1, 2), verdictText(0, 2)]) {
    assert.ok(!/lake|city|flower/i.test(text), 'a verdict must never name a theme');
  }
});

/**
 * The day boundary is 3am Pacific, and the reason these assert an INSTANT rather than an offset is
 * that a fixed offset looks right in whichever season it was written in and is an hour out in the
 * other. 10:00Z is 3am PDT in September; 11:00Z is 3am PST in December.
 */
test('the puzzle day turns over at 3am Pacific, in summer', () => {
  assert.equal(puzzleDay(new Date('2026-09-24T09:59:00Z')), '2026-09-23');
  assert.equal(puzzleDay(new Date('2026-09-24T10:00:00Z')), '2026-09-24');
  assert.equal(puzzleDay(new Date('2026-09-24T23:00:00Z')), '2026-09-24');
});

test('and in winter, when the offset is different', () => {
  assert.equal(puzzleDay(new Date('2026-12-24T10:59:00Z')), '2026-12-23');
  assert.equal(puzzleDay(new Date('2026-12-24T11:00:00Z')), '2026-12-24');
});

test('midnight UTC is still the previous puzzle day, which is the whole point', () => {
  assert.equal(puzzleDay(new Date('2026-09-25T00:00:00Z')), '2026-09-24');
});

test('the next rollover is the next 3am Pacific', () => {
  assert.equal(nextRollover(new Date('2026-09-24T12:00:00Z')).toISOString(), '2026-09-25T10:00:00.000Z');
  assert.equal(nextRollover(new Date('2026-12-24T12:00:00Z')).toISOString(), '2026-12-25T11:00:00.000Z');
});

test('a countdown reads in the units a person cares about', () => {
  assert.equal(countdownText(12 * 3600_000 + 27 * 60_000), '12h 27m');
  assert.equal(countdownText(4 * 60_000 + 10_000), '4m 10s');
  assert.equal(countdownText(9_000), '9s');
  assert.equal(countdownText(0), 'any moment');
  assert.equal(countdownText(-5), 'any moment');
});
