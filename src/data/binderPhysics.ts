/**
 * Physical side-load binder rules — what a real pocket page can actually hold.
 *
 * We model SIDE-LOAD pages (the norm for collector binders): pockets open sideways, and each
 * page has specific pocket PAIRS that open along the same inside edge. A printed art piece
 * spanning two pockets is physically inserted by folding it down the middle and sliding one
 * half into each pocket of such a pair — so 2-wide pieces only work AT those pairs:
 *
 *  - 3-column pages: ONE pair — the two pockets FURTHEST from the binder spine
 *    (outer + middle). Which columns those are depends on the page's side of the spine.
 *  - 4-column pages: TWO pairs — (col 1, col 2) and (col 3, col 4), symmetric, same both sides.
 *  - Vertical spans can't be inserted at all (pockets don't open up/down), and nothing wider
 *    than a folded pair fits — so art pieces are at most 1 row × 2 columns.
 *
 * Page side follows the double-sided pairing in BinderPages: page 1 (index 0) is the cover
 * face on the RIGHT of the spine, then indices 1·2 face each other (1 = left, 2 = right), etc.
 *
 * Real page grids: 3×3, 3×4 and 4×4 exist; 4 rows × 3 columns does not.
 */

export type PageSide = 'left' | 'right';

/** Real side-load page grids (rows × cols). 4×3 pages don't exist physically. */
export const REAL_PAGE_SIZES: { label: string; rows: number; cols: number }[] = [
  { label: '3×3', rows: 3, cols: 3 },
  { label: '3×4', rows: 3, cols: 4 },
  { label: '4×4', rows: 4, cols: 4 },
];

/** Which side of the spine a page sits on (see the pairing convention above). */
export function pageSide(pageIndex: number): PageSide {
  return pageIndex % 2 === 1 ? 'left' : 'right';
}

/**
 * Starting column of every pocket pair that shares an inside-edge opening — the only places
 * a folded 2-wide piece can be inserted. Columns are 0-indexed, pairs are (c, c+1).
 * On a RIGHT page the spine is at the left, so "furthest from the spine" = the rightmost two.
 */
export function insideEdgePairStarts(cols: number, side: PageSide): number[] {
  if (cols === 3) return side === 'right' ? [1] : [0];
  if (cols === 4) return [0, 2];
  return [];
}

/**
 * Can a single printed art piece occupy this footprint? `col` is the absolute page column of
 * the piece's left edge. Returns the physical reason when it can't.
 */
export function artPieceAllowed(
  col: number,
  rowSpan: number,
  colSpan: number,
  pageCols: number,
  side: PageSide,
): { ok: boolean; reason: string | null } {
  if (rowSpan > 1) {
    return {
      ok: false,
      reason: 'Side-load pockets only open sideways — an art piece can’t span rows. Use sliced pieces instead.',
    };
  }
  if (colSpan > 2) {
    return {
      ok: false,
      reason: 'An art piece can be at most 2 pockets wide — one fold, one pocket pair.',
    };
  }
  if (colSpan === 2 && !insideEdgePairStarts(pageCols, side).includes(col)) {
    const pairs = insideEdgePairStarts(pageCols, side)
      .map((s) => `${s + 1}–${s + 2}`)
      .join(' or ');
    return {
      ok: false,
      reason: `A folded 2-wide piece only fits a pocket pair that opens along the same inside edge — columns ${pairs} on this page.`,
    };
  }
  return { ok: true, reason: null };
}

/**
 * Split one art panel into physically insertable pieces: per row, greedy left→right, emitting
 * a folded 1×2 piece wherever the footprint sits on an inside-edge pair, 1×1 everywhere else.
 * Each piece's crop is the proportional window of the panel's crop, so the assembled picture
 * is unchanged. Extra panel props (imageUrl / fit / transform) carry through untouched.
 *
 * `baseCol` is the page column of the whole placement's left edge; panel r/c are relative to
 * the placement base (the store's placeArtPanels convention).
 */
export function legalizeArtPanels<
  T extends { r: number; c: number; rs: number; cs: number; crop: { x: number; y: number; w: number; h: number } },
>(baseCol: number, panels: T[], pageCols: number, side: PageSide): T[] {
  const pairStarts = insideEdgePairStarts(pageCols, side);
  const out: T[] = [];
  for (const p of panels) {
    if (artPieceAllowed(baseCol + p.c, p.rs, p.cs, pageCols, side).ok) {
      out.push(p);
      continue;
    }
    for (let i = 0; i < p.rs; i += 1) {
      let j = 0;
      while (j < p.cs) {
        const pairHere = j + 1 < p.cs && pairStarts.includes(baseCol + p.c + j);
        const cs = pairHere ? 2 : 1;
        out.push({
          ...p,
          r: p.r + i,
          c: p.c + j,
          rs: 1,
          cs,
          crop: {
            x: p.crop.x + (j / p.cs) * p.crop.w,
            y: p.crop.y + (i / p.rs) * p.crop.h,
            w: (cs / p.cs) * p.crop.w,
            h: p.crop.h / p.rs,
          },
        });
        j += cs;
      }
    }
  }
  return out;
}
