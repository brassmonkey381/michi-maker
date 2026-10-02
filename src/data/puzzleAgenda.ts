/**
 * The puzzle queue seen as DAYS rather than as a list of rows.
 *
 * WHY (owner, 2026-10-02). The Studio panel was built for a workflow that no longer exists: pick a
 * binder page, type a date into a free-text box, type the themes, publish. scripts/puzzles/
 * fill-queue.mjs now does all four, so what is left for a person is reviewing what is queued and
 * writing hints — and the panel had no idea a queue existed. "The queue ends on the 3rd" was
 * something a script had to tell the owner instead of something the screen showed.
 *
 * An agenda makes the empty days VISIBLE, which is the whole point: a missing puzzle is invisible
 * in a list of what exists and obvious in a list of dates.
 */
import { shiftUtcDate } from './dailyPuzzleLogic.ts';

/** Only what the agenda needs, so this module does not depend on the admin row shape. */
export interface AgendaPuzzle {
  id: string;
  publishOn: string;
  sourcePageId: string | null;
  hint: string | null;
}

export interface AgendaDay<P extends AgendaPuzzle> {
  /** yyyy-mm-dd. */
  date: string;
  /** 'Mon' … 'Sun', for the row label. */
  weekday: string;
  /** The puzzle scheduled for that day, or null when the day is empty. */
  puzzle: P | null;
  /** The day the game currently counts as today. */
  isToday: boolean;
  /** Already gone: its puzzle, if any, has been played and cannot be usefully changed. */
  isPast: boolean;
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** The three-letter weekday for a yyyy-mm-dd, read in UTC so it cannot drift by a timezone. */
export function weekdayOf(date: string): string {
  const t = Date.parse(`${date}T00:00:00Z`);
  return Number.isNaN(t) ? '' : WEEKDAYS[new Date(t).getUTCDay()];
}

/**
 * `days` rows starting at `from`, each carrying the puzzle scheduled for it or null.
 *
 * Starting a day or two BEFORE today is deliberate: the day just gone is the one whose play count
 * you want to glance at, and a queue that begins at today hides it.
 *
 * A date holding more than one puzzle cannot happen (publish_on is unique), so the first match
 * wins and the rest are ignored rather than silently merged.
 */
export function buildAgenda<P extends AgendaPuzzle>(
  puzzles: readonly P[],
  today: string,
  { from = today, days = 14 }: { from?: string; days?: number } = {},
): AgendaDay<P>[] {
  const byDate = new Map<string, P>();
  for (const p of puzzles) if (!byDate.has(p.publishOn)) byDate.set(p.publishOn, p);

  const out: AgendaDay<P>[] = [];
  for (let i = 0; i < Math.max(0, days); i += 1) {
    const date = shiftUtcDate(from, i);
    out.push({
      date,
      weekday: weekdayOf(date),
      puzzle: byDate.get(date) ?? null,
      isToday: date === today,
      isPast: date < today,
    });
  }
  return out;
}

/** The first empty day at or after today, which is where a new puzzle should go by default. */
export function firstFreeDay<P extends AgendaPuzzle>(agenda: readonly AgendaDay<P>[]): string | null {
  return agenda.find((d) => !d.puzzle && !d.isPast)?.date ?? null;
}

/** How many days from today onwards are already filled, counting only an unbroken run. */
export function runwayDays<P extends AgendaPuzzle>(agenda: readonly AgendaDay<P>[]): number {
  let n = 0;
  for (const d of agenda) {
    if (d.isPast) continue;
    if (!d.puzzle) break;
    n += 1;
  }
  return n;
}

/**
 * The puzzle that publishing to `date` would REPLACE, or null when nothing would be lost.
 *
 * THE INCIDENT THIS EXISTS FOR (2026-09-28). `admin_publish_puzzle` upserts on `publish_on`, so
 * publishing while the date box said one day and the page picker was on another silently replaced
 * a scheduled puzzle with a copy of a different one. Two dates then held the same binder and the
 * same page, and nothing on screen said so; it was found days later by an audit.
 *
 * Re-publishing the SAME page to the SAME date is not a clash — that is how a hint or a theme gets
 * corrected, and prompting for it would train the prompt away.
 */
export function clashOnDate<P extends AgendaPuzzle>(
  puzzles: readonly P[],
  date: string,
  pageId: string | null,
): P | null {
  const existing = puzzles.find((p) => p.publishOn === date);
  if (!existing) return null;
  if (pageId && existing.sourcePageId === pageId) return null;
  return existing;
}
