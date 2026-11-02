/**
 * Where a typed query hits inside one binder. Used by My Binders' shelf filter (owner, 2026-11-02):
 * a shelf of forty binders is found by the page someone remembers ("the Pikachu page") at least as
 * often as by the binder's own name, and half of all pages already carry a title. Order of
 * precedence is title, then description, then the first page whose title or description matches,
 * so the tile can say WHY it is on screen when the binder's name alone would not explain it.
 *
 * Pure, runs on the client over binders already in memory: no request, no cost. The public
 * Discover search does the same thing server-side in search_binders (page-title branch,
 * 20261102120000_search_page_titles.sql).
 */
import type { DemoBinder } from './binderTypes.ts';

export type BinderMatch =
  | { kind: 'title' }
  | { kind: 'description' }
  /** `pageIndex` is zero-based; links and the page strip show pageIndex + 1. */
  | { kind: 'page'; pageIndex: number; pageTitle: string };

const norm = (s: string | null | undefined) => (s ?? '').toLowerCase();

/** Null when the binder does not match `query` (already trimmed; empty matches everything by title). */
export function matchBinder(binder: Pick<DemoBinder, 'title' | 'description' | 'pages'>, query: string): BinderMatch | null {
  const q = query.trim().toLowerCase();
  if (!q) return { kind: 'title' };
  if (norm(binder.title).includes(q)) return { kind: 'title' };
  if (norm(binder.description).includes(q)) return { kind: 'description' };
  for (let i = 0; i < binder.pages.length; i += 1) {
    const page = binder.pages[i];
    if (norm(page.title).includes(q) || norm(page.description).includes(q)) {
      return { kind: 'page', pageIndex: i, pageTitle: page.title?.trim() || `Page ${i + 1}` };
    }
  }
  return null;
}
