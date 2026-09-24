/**
 * The daily puzzle's arithmetic, kept free of every import.
 *
 * PURE ON PURPOSE, like src/data/puzzleAuthoring.ts: `npm test` loads data modules directly, with
 * no bundler and no `@/` alias, so anything worth covering cannot sit beside a Supabase import.
 * src/data/dailyPuzzle.ts holds the calls and re-exports these.
 */

/**
 * The backdrop a puzzle wears when the page it came from had no picture of its own.
 *
 * Our own copy of the question marks, re-hosted from Pixabay (BlenderTimer) by
 * scripts/puzzles/rehost-backdrop.mjs and content-addressed, so it cannot rot the way the signed
 * pixabay.com/get address it replaced could.
 */
export const PUZZLE_BACKDROP_FALLBACK =
  'https://piikwvntldytjejxmcla.supabase.co/storage/v1/object/public/binder-art/'
  + '29a6e25c-c5a0-4c2a-9a5b-62c98e288605/puzzle-backdrop-a6e33f992de04a67.jpg';

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

/**
 * THE PUZZLE DAY, and the only client-side definition of it. Mirrors public.puzzle_today().
 *
 * It turns over at 03:00 Pacific, not midnight UTC (owner, 2026-09-24): midnight UTC is 5pm the
 * previous afternoon in California, so "a new one every morning" was landing mid-afternoon the day
 * before for the readers most likely to see it.
 *
 * A NAMED ZONE, never a fixed offset. "3am PST" is ambiguous for half the year: -8 gives 3am in
 * winter and 4am in summer, -7 the other way round. Intl follows the change.
 */
export const PUZZLE_ZONE = 'America/Los_Angeles';
export const ROLLOVER_HOUR = 3;

/** How far the named zone is from UTC at a given instant, in ms. */
function zoneOffsetMs(at: Date): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: PUZZLE_ZONE, hour12: false,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).formatToParts(at).reduce<Record<string, string>>((acc, p) => {
    if (p.type !== 'literal') acc[p.type] = p.value;
    return acc;
  }, {});
  // `hour` comes back as 24 at midnight under hour12:false in some engines.
  const hour = Number(parts.hour) % 24;
  const asIfUtc = Date.UTC(
    Number(parts.year), Number(parts.month) - 1, Number(parts.day),
    hour, Number(parts.minute), Number(parts.second),
  );
  return asIfUtc - at.getTime();
}

/** Today, as the puzzle counts it: the zone's date, three hours back. */
export function puzzleDay(now: Date): string {
  const shifted = new Date(now.getTime() - ROLLOVER_HOUR * 3600_000);
  // en-CA formats as YYYY-MM-DD, which is the shape the database stores.
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: PUZZLE_ZONE, year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(shifted);
}

/**
 * The instant the next puzzle day begins.
 *
 * The offset is applied TWICE because the first guess can land on the wrong side of a daylight
 * saving change, and the offset that matters is the one in force at the answer, not at the guess.
 */
export function nextRollover(now: Date): Date {
  const tomorrow = shiftUtcDate(puzzleDay(now), 1);
  const wall = `${tomorrow}T${String(ROLLOVER_HOUR).padStart(2, '0')}:00:00Z`;
  let t = Date.parse(wall);
  for (let i = 0; i < 2; i += 1) t = Date.parse(wall) - zoneOffsetMs(new Date(t));
  return new Date(t);
}

/** "12h 27m", or "4m 10s" in the last hour. Never a bare number of seconds ticking from 3600. */
export function countdownText(ms: number): string {
  if (!Number.isFinite(ms) || ms <= 0) return 'any moment';
  const total = Math.floor(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const sec = total % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${sec}s`;
  return `${sec}s`;
}

/** The UTC date. Kept because the streak's tests and its stored dates are plain date strings. */
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
