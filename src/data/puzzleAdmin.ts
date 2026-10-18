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

export { groupSources, pageLabel, parseThemes, relevantBinders, puzzleToday, unscheduledPages } from '@/data/puzzleAuthoring';
export type { PuzzleSourceBinder, PuzzleSourcePage } from '@/data/puzzleAuthoring';

export interface AdminPuzzle {
  id: string;
  publishOn: string;
  themeCount: number;
  /** The answer words, known to the admin up front since the calendar writes them on each day. */
  themes: string[];
  /** The source page's title; the scheduler writes "yyyy-mm-dd · Holiday" on a holiday's page. */
  pageTitle: string | null;
  /** The holiday name from the page title, if the page carries one. */
  holiday: string | null;
  cardCount: number;
  rows: number;
  cols: number;
  hint: string | null;
  sourceBinderId: string | null;
  sourcePageId: string | null;
  /** The renderer reads binders with is_public hardcoded, so a private one cannot be drawn. */
  binderIsPublic: boolean;
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
    themes: [],
    pageTitle: null,
    holiday: null,
    cardCount: Number(r.card_count),
    rows: Number(r.rows),
    cols: Number(r.cols),
    hint: (r.hint as string | null) ?? null,
    sourceBinderId: (r.source_binder_id as string | null) ?? null,
    sourcePageId: (r.source_page_id as string | null) ?? null,
    binderIsPublic: !!r.binder_is_public,
    plays: Number(r.plays),
    correct: Number(r.correct),
    published: !!r.published,
  }));
}

/**
 * The whole schedule, answers included, for the Studio calendar. One call: a year is 365 rows of a
 * few columns, and the page title is what carries the holiday a day was built for.
 */
export async function listPuzzleCalendar(): Promise<AdminPuzzle[]> {
  const supabase = requireSupabase();
  const { data, error } = await supabase.rpc('admin_puzzle_calendar');
  if (error) throw new Error(error.message);
  return (data ?? []).map((r: Record<string, unknown>) => {
    const themes = Array.isArray(r.themes) ? (r.themes as unknown[]).map(String) : [];
    const pageTitle = (r.page_title as string | null) ?? null;
    return {
      id: String(r.id),
      publishOn: String(r.publish_on),
      themeCount: themes.length,
      themes,
      pageTitle,
      holiday: holidayOfTitle(pageTitle),
      cardCount: Number(r.card_count),
      rows: Number(r.rows),
      cols: Number(r.cols),
      hint: (r.hint as string | null) ?? null,
      sourceBinderId: (r.source_binder_id as string | null) ?? null,
      sourcePageId: (r.source_page_id as string | null) ?? null,
      binderIsPublic: !!r.binder_is_public,
      plays: Number(r.plays),
      correct: Number(r.correct),
      published: !!r.published,
    };
  });
}

/** "2026-12-25 · Christmas" -> "Christmas"; a plain title or none -> null. */
export function holidayOfTitle(title: string | null): string | null {
  if (!title) return null;
  const m = /^\d{4}-\d{2}-\d{2} · (.+)$/.exec(title.trim());
  return m ? m[1].trim() || null : null;
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
  /**
   * The resolved card pictures, in card order, so the player's page needs no image manifest. Only
   * sent when every one of them resolved: the server refuses a partial array, and a partial one
   * would draw some pockets and leave others blank with nothing to explain why.
   */
  imageUrls?: string[] | null;
}): Promise<string> {
  const supabase = requireSupabase();
  const { data, error } = await supabase.rpc('admin_publish_puzzle', {
    p_publish_on: input.publishOn,
    p_page_id: input.pageId,
    p_themes: input.themes,
    p_hint: input.hint ?? null,
    p_image_urls: input.imageUrls?.length ? input.imageUrls : null,
  });
  if (error) throw new Error(error.message);
  return String(data);
}

/**
 * Set or clear one hint, without republishing the puzzle.
 *
 * Publishing rewrites the card list, the picture addresses, the grid and the source page, which is
 * far too much machinery to move one string — and is why every scheduled puzzle still had no hint.
 * Returns the hint as stored: trimmed, or null when it was blank.
 */
export async function setPuzzleHint(puzzleId: string, hint: string | null): Promise<string | null> {
  const supabase = requireSupabase();
  const { data, error } = await supabase.rpc('admin_set_puzzle_hint', {
    p_puzzle_id: puzzleId,
    p_hint: hint,
  });
  if (error) throw new Error(error.message);
  return (data as string | null) ?? null;
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

/**
 * The cards on one page, in reading order, so the panel can SHOW what is about to be published.
 *
 * A plain table read, not an RPC: these are the caller's own binder slots and the existing policies
 * already scope them to the owner. Picking a page by "p2 · 3x3 · 9" and hoping is what made the
 * first version of this panel unusable.
 */
export async function pageCardIds(pageId: string): Promise<string[]> {
  const supabase = requireSupabase();
  const { data, error } = await supabase
    .from('binder_slots')
    .select('card_id, row_index, col_index')
    .eq('page_id', pageId)
    .eq('slot_type', 'card')
    .order('row_index')
    .order('col_index');
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => r.card_id).filter((id): id is string => !!id);
}

export async function setVocabulary(words: string[], suggest = true): Promise<number> {
  const supabase = requireSupabase();
  const { data, error } = await supabase.rpc('admin_set_vocabulary', { p_words: words, p_suggest: suggest });
  if (error) throw new Error(error.message);
  return Number(data ?? 0);
}


