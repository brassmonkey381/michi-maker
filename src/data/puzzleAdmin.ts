/**
 * Authoring the daily puzzle, from Studio.
 *
 * EVERY CALL IS AN RPC, never a table read or write. `daily_puzzles` is privileged-write and
 * `daily_puzzle_answers` has no read policy at all, so there is nothing here for a client to reach
 * directly even if it tried; the server decides, and `is_admin()` is the first line of each
 * function. See supabase/migrations/20260924120000_puzzle_admin.sql.
 *
 * THE ANSWER IS FETCHED SEPARATELY, on purpose. `listPuzzles` never carries themes, so the words
 * are not sitting in whatever the panel last rendered; `puzzleThemes` asks for one puzzle's answer
 * at the moment an author opens it.
 */
import { groupSources, type PuzzleSourceBinder, type PuzzleSourcePage } from '@/data/puzzleAuthoring';
import { requireSupabase } from '@/lib/supabase';

export { groupSources, parseThemes, utcToday } from '@/data/puzzleAuthoring';
export type { PuzzleSourceBinder, PuzzleSourcePage } from '@/data/puzzleAuthoring';

export interface AdminPuzzle {
  id: string;
  publishOn: string;
  themeCount: number;
  cardCount: number;
  rows: number;
  cols: number;
  hint: string | null;
  sourceBinderId: string | null;
  plays: number;
  correct: number;
  published: boolean;
}

export interface VocabularyWord {
  word: string;
  suggest: boolean;
  usedIn: number;
}

export async function listPuzzles(limit = 60): Promise<AdminPuzzle[]> {
  const supabase = requireSupabase();
  const { data, error } = await supabase.rpc('admin_puzzle_list', { p_limit: limit });
  if (error) throw new Error(error.message);
  return (data ?? []).map((r: Record<string, unknown>) => ({
    id: String(r.id),
    publishOn: String(r.publish_on),
    themeCount: Number(r.theme_count),
    cardCount: Number(r.card_count),
    rows: Number(r.rows),
    cols: Number(r.cols),
    hint: (r.hint as string | null) ?? null,
    sourceBinderId: (r.source_binder_id as string | null) ?? null,
    plays: Number(r.plays),
    correct: Number(r.correct),
    published: !!r.published,
  }));
}

export async function puzzleThemes(puzzleId: string): Promise<string[]> {
  const supabase = requireSupabase();
  const { data, error } = await supabase.rpc('admin_puzzle_themes', { p_puzzle_id: puzzleId });
  if (error) throw new Error(error.message);
  return (data as string[] | null) ?? [];
}


export async function listSources(): Promise<PuzzleSourceBinder[]> {
  const supabase = requireSupabase();
  const { data, error } = await supabase.rpc('admin_puzzle_sources');
  if (error) throw new Error(error.message);
  const rows: PuzzleSourcePage[] = (data ?? []).map((r: Record<string, unknown>) => ({
    binderId: String(r.binder_id),
    binderTitle: String(r.binder_title ?? 'Untitled'),
    isPublic: !!r.is_public,
    hiddenFromFeeds: !!r.hidden_from_feeds,
    pageId: String(r.page_id),
    position: Number(r.page_position),
    pageTitle: (r.page_title as string | null) ?? null,
    rows: Number(r.rows),
    cols: Number(r.cols),
    cardCount: Number(r.card_count),
  }));
  return groupSources(rows);
}

export async function publishPuzzle(input: {
  publishOn: string;
  pageId: string;
  themes: string[];
  hint?: string | null;
}): Promise<string> {
  const supabase = requireSupabase();
  const { data, error } = await supabase.rpc('admin_publish_puzzle', {
    p_publish_on: input.publishOn,
    p_page_id: input.pageId,
    p_themes: input.themes,
    p_hint: input.hint ?? null,
  });
  if (error) throw new Error(error.message);
  return String(data);
}

export async function unpublishPuzzle(puzzleId: string): Promise<void> {
  const supabase = requireSupabase();
  const { error } = await supabase.rpc('admin_unpublish_puzzle', { p_puzzle_id: puzzleId });
  if (error) throw new Error(error.message);
}

/** Public enough for a share image, invisible to every feed. Both flags move together. */
export async function setBinderShowcase(binderId: string, on: boolean): Promise<void> {
  const supabase = requireSupabase();
  const { error } = await supabase.rpc('admin_set_binder_showcase', { p_binder_id: binderId, p_on: on });
  if (error) throw new Error(error.message);
}

export async function listVocabulary(limit = 500): Promise<VocabularyWord[]> {
  const supabase = requireSupabase();
  const { data, error } = await supabase.rpc('admin_vocabulary', { p_limit: limit });
  if (error) throw new Error(error.message);
  return (data ?? []).map((r: Record<string, unknown>) => ({
    word: String(r.word),
    suggest: !!r.suggest,
    usedIn: Number(r.used_in),
  }));
}

export async function setVocabulary(words: string[], suggest = true): Promise<number> {
  const supabase = requireSupabase();
  const { data, error } = await supabase.rpc('admin_set_vocabulary', { p_words: words, p_suggest: suggest });
  if (error) throw new Error(error.message);
  return Number(data ?? 0);
}


