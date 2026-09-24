/**
 * The parts of puzzle authoring that are arithmetic on data, kept free of every import.
 *
 * PURE ON PURPOSE. The node test suite (`npm test`) loads data modules directly, with no bundler
 * and no `@/` alias, so anything it must cover cannot sit beside a Supabase import. The same split
 * is why src/data/pageStyle.ts says it has no React Native imports. src/data/puzzleAdmin.ts holds
 * the calls and re-exports these, so a caller still has one place to import from.
 */

export interface PuzzleSourcePage {
  binderId: string;
  binderTitle: string;
  isPublic: boolean;
  hiddenFromFeeds: boolean;
  pageId: string;
  position: number;
  pageTitle: string | null;
  rows: number;
  cols: number;
  cardCount: number;
}

/** A binder whose pages can be published, with the pages under it. */
export interface PuzzleSourceBinder {
  id: string;
  title: string;
  isPublic: boolean;
  hiddenFromFeeds: boolean;
  pages: PuzzleSourcePage[];
}

/**
 * The pages available to publish from, grouped by binder.
 *
 * Grouped here rather than in the component, because the server returns one row per PAGE (a join is
 * the natural shape for it) and the panel wants one entry per BINDER with its pages inside. Doing
 * it in a pure function keeps that reshaping testable and out of a render.
 */
export function groupSources(rows: PuzzleSourcePage[]): PuzzleSourceBinder[] {
  const out: PuzzleSourceBinder[] = [];
  for (const row of rows) {
    let binder = out.find((b) => b.id === row.binderId);
    if (!binder) {
      binder = {
        id: row.binderId,
        title: row.binderTitle,
        isPublic: row.isPublic,
        hiddenFromFeeds: row.hiddenFromFeeds,
        pages: [],
      };
      out.push(binder);
    }
    binder.pages.push(row);
  }
  return out;
}

/**
 * Split what an author typed into theme words: commas, or spaces when there are no commas.
 *
 * SPACES ARE ONLY A SEPARATOR WHEN THERE IS NO COMMA, because a theme can be two words ("white
 * kyurem") and splitting that pair into two themes would publish a puzzle with the wrong answer and
 * the wrong count, which is the sort of thing nobody checks until a player gets it right and is
 * told they are wrong.
 */
export function parseThemes(input: string): string[] {
  const text = input.trim();
  if (!text) return [];
  const parts = text.includes(',') ? text.split(',') : text.split(/\s+/);
  const cleaned = parts.map((p) => p.trim().toLowerCase()).filter(Boolean);
  return [...new Set(cleaned)];
}

/** Today in UTC as YYYY-MM-DD, which is the day boundary the puzzle uses. */
export function utcToday(now: Date): string {
  return now.toISOString().slice(0, 10);
}
