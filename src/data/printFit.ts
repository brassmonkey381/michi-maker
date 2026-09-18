/**
 * WHAT A PRINTED ART PIECE IS CUT INTO, and the warning when that is not the shape on the page.
 *
 * The editor lets a piece of art take any rectangle of pockets (owner, 2026-09-17): merge what
 * you like, place it where you like. A real side-load page cannot hold every shape, though (see
 * binderPhysics): a physical insert is a single pocket, or a folded 1×2 at a pocket pair that
 * opens along one inside edge. So the fill-sheet export cuts each piece into what can be slid
 * in, and before printing the owner is told which pieces that touches, where they are, and what
 * they become. Nothing on the page changes; the picture is still continuous across the cuts.
 *
 * Pure, so `node --test` reaches it and the PDF builder and the print sheet share one walk.
 */
import { artPieceAllowed, insideEdgePairStarts, pageSide } from './binderPhysics.ts';
import type { DemoBinder, DemoSlot } from './binderTypes.ts';

/** One physical piece of a slot: its top-left cell within the slot, and its width in pockets. */
export interface CutPiece {
  i: number;
  j: number;
  /** 2 = a folded piece printed at assembled width, at a pocket pair. */
  w: 1 | 2;
}

/**
 * The pieces one artwork slot prints as. A single, or a fold sitting on a pocket pair, is one
 * piece. Anything else is walked row by row, left to right: a fold wherever the footprint covers
 * a pair, a single everywhere else. `pairStarts` is insideEdgePairStarts for the slot's page.
 */
export function cutPieces(slot: Pick<DemoSlot, 'col' | 'rowSpan' | 'colSpan'>, pairStarts: number[]): CutPiece[] {
  if (slot.rowSpan === 1 && slot.colSpan === 1) return [{ i: 0, j: 0, w: 1 }];
  if (slot.rowSpan === 1 && slot.colSpan === 2 && pairStarts.includes(slot.col)) return [{ i: 0, j: 0, w: 2 }];
  const pieces: CutPiece[] = [];
  for (let i = 0; i < slot.rowSpan; i += 1) {
    let j = 0;
    while (j < slot.colSpan) {
      const pairHere = j + 1 < slot.colSpan && pairStarts.includes(slot.col + j);
      pieces.push({ i, j, w: pairHere ? 2 : 1 });
      j += pairHere ? 2 : 1;
    }
  }
  return pieces;
}

export interface PrintCutWarning {
  /** 1-based, as the page strip numbers them. */
  page: number;
  row: number;
  col: number;
  /** The shape on the page, rows × columns. */
  shape: string;
  folds: number;
  singles: number;
}

/** Every art piece the fill sheet has to cut into more than one insert, in page order. */
export function printCutWarnings(binder: Pick<DemoBinder, 'pages'>): PrintCutWarning[] {
  const out: PrintCutWarning[] = [];
  binder.pages.forEach((page, pageIndex) => {
    const side = pageSide(pageIndex);
    const pairStarts = insideEdgePairStarts(page.cols, side);
    const art = page.slots
      .filter((s) => s.type === 'artwork' && s.imageUrl)
      .sort((a, b) => a.row - b.row || a.col - b.col);
    for (const slot of art) {
      if (artPieceAllowed(slot.col, slot.rowSpan, slot.colSpan, page.cols, side).ok) continue;
      const pieces = cutPieces(slot, pairStarts);
      out.push({
        page: pageIndex + 1,
        row: slot.row + 1,
        col: slot.col + 1,
        shape: `${slot.rowSpan}×${slot.colSpan}`,
        folds: pieces.filter((p) => p.w === 2).length,
        singles: pieces.filter((p) => p.w === 1).length,
      });
    }
  });
  return out;
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

/** One line per piece, under a heading that says they are cut to fit: where it is, what it becomes. */
export function printCutWarningText(w: PrintCutWarning): string {
  const parts = [
    w.folds ? plural(w.folds, 'folded pair') : '',
    w.singles ? plural(w.singles, 'single') : '',
  ].filter(Boolean);
  return `${w.shape} on page ${w.page}, row ${w.row}, column ${w.col}: ${parts.join(' and ')}`;
}
