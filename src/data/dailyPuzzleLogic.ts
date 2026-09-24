/**
 * The daily puzzle's arithmetic, kept free of every import.
 *
 * PURE ON PURPOSE, like src/data/puzzleAuthoring.ts: `npm test` loads data modules directly, with
 * no bundler and no `@/` alias, so anything worth covering cannot sit beside a Supabase import.
 * src/data/dailyPuzzle.ts holds the calls and re-exports these.
 */

/** Where the opt-in lives inside profiles.preferences. */
export const DAILY_PUZZLE_KEY = 'dailyPuzzle';

export type DailyPuzzleChoice = 'on' | 'declined' | null;

/** A play, as much of it as a streak cares about. */
export interface PlayedDay {
  publishOn: string;
  correct: boolean;
}

/** What the reader said about being shown the puzzle, or null if they have not been asked. */
export function dailyPuzzleChoice(preferences: unknown): DailyPuzzleChoice {
  if (!preferences || typeof preferences !== 'object') return null;
  const v = (preferences as Record<string, unknown>)[DAILY_PUZZLE_KEY];
  return v === 'on' || v === 'declined' ? v : null;
}

/** The preferences blob with the answer merged in, leaving everything else alone. */
export function withDailyPuzzleChoice(preferences: unknown, choice: Exclude<DailyPuzzleChoice, null>): Record<string, unknown> {
  const base = preferences && typeof preferences === 'object' && !Array.isArray(preferences)
    ? { ...(preferences as Record<string, unknown>) }
    : {};
  base[DAILY_PUZZLE_KEY] = choice;
  return base;
}

/** The UTC date, which is the day boundary every puzzle uses. */
export function utcDate(now: Date): string {
  return now.toISOString().slice(0, 10);
}

/** That date shifted by whole days, still in UTC. */
export function shiftUtcDate(date: string, days: number): string {
  const t = Date.parse(`${date}T00:00:00Z`);
  if (Number.isNaN(t)) return date;
  return new Date(t + days * 86400000).toISOString().slice(0, 10);
}

/**
 * How many days in a row, counting back from today.
 *
 * COUNTED FROM THE PLAYS, never stored. A stored counter is a second source of truth that goes
 * wrong exactly once and then stays wrong, and this is cheap: a streak is at most as long as the
 * game is old.
 *
 * TODAY NOT YET PLAYED DOES NOT BREAK IT. Someone opening the site in the morning still has
 * yesterday's streak; it is broken by a MISSED day, not by an unfinished one. So the count may
 * start at today or at yesterday, and starting anywhere earlier is a break.
 */
export function streakLength(plays: PlayedDay[], today: string): number {
  const won = new Set(plays.filter((p) => p.correct).map((p) => p.publishOn));
  let day = won.has(today) ? today : shiftUtcDate(today, -1);
  let n = 0;
  while (won.has(day)) {
    n += 1;
    day = shiftUtcDate(day, -1);
  }
  return n;
}

/**
 * How a finished game reads. Kept for the "how many of how many" line; the per-guess wording lives
 * on the screen now that guesses are one word at a time.
 */
export function verdictText(matched: number, of: number): string {
  if (matched === of) return of === 1 ? 'Correct.' : `Correct, all ${of}.`;
  if (matched === 0) return of === 1 ? 'Not this time.' : 'None of those, not this time.';
  return `${matched} of ${of}. Close.`;
}
