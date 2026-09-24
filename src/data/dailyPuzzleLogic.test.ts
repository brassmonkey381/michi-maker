import assert from 'node:assert/strict';
import test from 'node:test';

import {
  dailyPuzzleChoice,
  shiftUtcDate,
  streakLength,
  suggestWords,
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

test('suggestions put prefixes before substrings', () => {
  const vocab = ['great lakes', 'lake', 'lakeside', 'city'];
  assert.deepEqual(suggestWords(vocab, 'lak', []), ['lake', 'lakeside', 'great lakes']);
});

test('suggestions drop what has already been picked', () => {
  const vocab = ['lake', 'lakeside'];
  assert.deepEqual(suggestWords(vocab, 'lak', ['lake']), ['lakeside']);
  assert.deepEqual(suggestWords(vocab, 'lak', ['LAKE']), ['lakeside']);
});

test('nothing typed suggests nothing, rather than the whole vocabulary', () => {
  assert.deepEqual(suggestWords(['lake', 'city'], '   ', []), []);
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
