/**
 * The daily puzzle, for the person playing it.
 *
 * WHAT A PLAYER'S CLIENT CAN SEE. The puzzle row (its cards, grid, hint and how many themes),
 * their own plays, and the suggestable words. Not the answer: `daily_puzzle_answers` has no read
 * policy for anybody, and the only ways in are `grade_puzzle_guess`, which returns a count and
 * never a word, and `puzzle_answer`, which opens only once the puzzle is yesterday's.
 *
 * SEEN IS A ROW, NOT A TIMESTAMP COMPARISON. `markSeen` inserts on first sight, so "have they been
 * shown today's" is the existence of a row. A reader who is already signed in when a new puzzle
 * lands therefore gets it the next time they reach the home page, which is the behaviour asked for.
 */
import {
  streakLength,
  utcDate,
  type PlayedDay,
} from '@/data/dailyPuzzleLogic';
import { requireSupabase, supabase } from '@/lib/supabase';

export {
  DAILY_PUZZLE_KEY,
  dailyPuzzleChoice,
  shiftUtcDate,
  streakLength,
  utcDate,
  verdictText,
  withDailyPuzzleChoice,
} from '@/data/dailyPuzzleLogic';
export type { DailyPuzzleChoice, PlayedDay } from '@/data/dailyPuzzleLogic';

export interface DailyPuzzle {
  id: string;
  publishOn: string;
  themeCount: number;
  cardIds: string[];
  rows: number;
  cols: number;
  backdropUrl: string | null;
  hint: string | null;
}

export interface MyPlay {
  puzzleId: string;
  guess: string[] | null;
  correct: boolean | null;
  matched: number | null;
  answeredAt: string | null;
}

export interface GuessResult {
  /** Whether this word landed on a theme not already found. */
  hit: boolean;
  /** The answer word it landed on, or null. Safe to show: they just named it. */
  matchedWord: string | null;
  foundCount: number;
  total: number;
  solved: boolean;
}

/** Today's puzzle, or null when none is published for today. */
export async function todaysPuzzle(now = new Date()): Promise<DailyPuzzle | null> {
  if (!supabase) return null;
  const { data, error } = await supabase
    .from('daily_puzzles')
    .select('id, publish_on, theme_count, card_ids, rows, cols, backdrop_url, hint')
    .eq('publish_on', utcDate(now))
    .maybeSingle();
  // A miss is not an error here: most of the interesting states (no puzzle today, not signed in
  // yet, RLS hiding an unpublished row) all look like "nothing", and none of them are worth an
  // error on the home page.
  if (error || !data) return null;
  return {
    id: String(data.id),
    publishOn: String(data.publish_on),
    themeCount: Number(data.theme_count),
    cardIds: (data.card_ids ?? []).map(String),
    rows: Number(data.rows),
    cols: Number(data.cols),
    backdropUrl: data.backdrop_url ?? null,
    hint: data.hint ?? null,
  };
}

export async function myPlay(puzzleId: string): Promise<MyPlay | null> {
  if (!supabase) return null;
  const { data, error } = await supabase
    .from('puzzle_plays')
    .select('puzzle_id, guess, correct, matched, answered_at')
    .eq('puzzle_id', puzzleId)
    .maybeSingle();
  if (error || !data) return null;
  return {
    puzzleId: String(data.puzzle_id),
    guess: data.guess ?? null,
    correct: data.correct ?? null,
    matched: data.matched ?? null,
    answeredAt: data.answered_at ?? null,
  };
}

/**
 * Record that this puzzle was put in front of this person.
 *
 * IGNORES A CONFLICT, because being shown it twice is not news and must not overwrite an answer
 * already recorded. The insert is the whole point: it is what stops the home page offering the
 * same puzzle every time it is opened.
 */
export async function markSeen(puzzleId: string, userId: string): Promise<void> {
  if (!supabase) return;
  await supabase
    .from('puzzle_plays')
    .upsert({ puzzle_id: puzzleId, user_id: userId }, { onConflict: 'user_id,puzzle_id', ignoreDuplicates: true });
}

/**
 * ONE WORD AT A TIME (owner, 2026-09-24). The server decides whether it landed, tolerating plurals
 * and typos, and says which answer word it was. That is safe to show: the player just typed it.
 */
export async function guessWord(puzzleId: string, word: string): Promise<GuessResult> {
  const client = requireSupabase();
  const { data, error } = await client.rpc('guess_puzzle_word', { p_puzzle_id: puzzleId, p_word: word });
  if (error) throw new Error(error.message);
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) throw new Error('That guess could not be checked.');
  return {
    hit: !!row.hit,
    matchedWord: row.matched_word ?? null,
    foundCount: Number(row.found_count),
    total: Number(row.total),
    solved: !!row.solved,
  };
}

/** The words the guess box offers. Curated, and never the tag corpus. */
export async function vocabulary(): Promise<string[]> {
  if (!supabase) return [];
  const { data, error } = await supabase.from('puzzle_vocabulary').select('word').eq('suggest', true);
  if (error || !data) return [];
  return data.map((r) => String(r.word)).sort();
}

/** Yesterday's answer, once it is yesterday's. Today's returns null by the function's own rule. */
export async function revealedAnswer(puzzleId: string): Promise<string[] | null> {
  if (!supabase) return null;
  const { data, error } = await supabase.rpc('puzzle_answer', { p_puzzle_id: puzzleId });
  if (error) return null;
  return (data as string[] | null) ?? null;
}

/** Every day this person has won, newest first, for the streak. */
export async function myPlayedDays(limit = 400): Promise<PlayedDay[]> {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from('puzzle_plays')
    .select('correct, daily_puzzles!inner(publish_on)')
    .order('seen_at', { ascending: false })
    .limit(limit);
  if (error || !data) return [];
  return data.map((r) => {
    const joined = (r as { daily_puzzles?: { publish_on?: string } | { publish_on?: string }[] }).daily_puzzles;
    const row = Array.isArray(joined) ? joined[0] : joined;
    return { publishOn: String(row?.publish_on ?? ''), correct: !!r.correct };
  }).filter((p) => p.publishOn);
}

export async function myStreak(now = new Date()): Promise<number> {
  return streakLength(await myPlayedDays(), utcDate(now));
}
