/**
 * WHERE A NEW BINDER OPENS (MIC-044, owner 2026-11-16: "we should just let them start editing right
 * away, preferably from wherever there's an open pocket"). The wizard no longer shows page one
 * first; it opens the editor on the first page that has an empty pocket, aimed at that pocket.
 * Pages are read in order, pockets left to right and top to bottom; a pocket under a card that
 * spans several is not empty. No empty pocket anywhere: page one, nothing aimed.
 */
interface PocketPage {
  rows: number;
  cols: number;
  slots: { row: number; col: number; rowSpan: number; colSpan: number }[];
}

export interface OpenPocket {
  /** Zero-based page index. */
  page: number;
  row: number;
  col: number;
}

export function firstOpenPocket(pages: PocketPage[]): OpenPocket | null {
  for (let p = 0; p < pages.length; p += 1) {
    const { rows, cols, slots } = pages[p];
    const taken = new Set<string>();
    for (const s of slots) {
      for (let r = s.row; r < s.row + Math.max(1, s.rowSpan); r += 1) {
        for (let c = s.col; c < s.col + Math.max(1, s.colSpan); c += 1) taken.add(`${r},${c}`);
      }
    }
    for (let r = 0; r < rows; r += 1) {
      for (let c = 0; c < cols; c += 1) if (!taken.has(`${r},${c}`)) return { page: p, row: r, col: c };
    }
  }
  return null;
}

/** The editor link for a binder the wizard just made: page and pocket when one is open. */
export function wizardEditorHref(binderId: string, pages: PocketPage[]): string {
  const open = firstOpenPocket(pages);
  const base = `/binder/${binderId}?edit=1&tip=1`;
  return open ? `${base}&page=${open.page + 1}&pocket=${open.row}.${open.col}` : base;
}

/** `?pocket=<row>.<col>` back to a cell, or null for anything else. */
export function parsePocketParam(raw: string | null | undefined): { row: number; col: number } | null {
  const m = raw ? /^(\d+)\.(\d+)$/.exec(raw) : null;
  return m ? { row: Number(m[1]), col: Number(m[2]) } : null;
}
