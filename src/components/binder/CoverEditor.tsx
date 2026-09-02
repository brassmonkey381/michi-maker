/**
 * DECORATING A COVER, IN PLACE.
 *
 * Two pieces that used to be one 380px studio in a modal: the interactive layer that sits over a
 * cover surface wherever it is drawn, and the toolbar that acts on whatever is selected there. Split
 * so the cover you decorate is the cover in the binder, at the binder's size, next to its pages,
 * rather than a copy of it in a dialog.
 *
 * PLACEMENT IS BY FRACTION. A sticker knows it is at 0.4 across and a third of the width wide, so
 * the layer can be any size the surface is: bookW in the spread, 58px in the filmstrip, whatever a
 * share preview wants later.
 *
 * SELECT, THEN ACT, rather than handles on the corners. Handles are fiddly at a sticker's real
 * size, worse on a touch screen, and their hit areas fight the drag underneath them. Tapping
 * selects, dragging moves, and the toolbar has the four things anyone actually wants: bigger,
 * smaller, turn, remove.
 *
 * THE LAYER DOES NOT OWN THE DRAG. It reports where the finger is and the caller holds that as
 * state, because the picture is drawn by the surface UNDER this layer: a drag kept in here moved
 * only the invisible hit box while the artwork sat still until release. The caller hands the
 * surface the in-flight position and hands this layer the committed one, so the maths never
 * compounds on itself, and the write still happens once, on release.
 */

import type { CoverSurfaceId } from '@/data/binderModels';
import { type BinderCover, type CoverSticker } from '@/data/binderTypes';

/**
 * WHAT THE FILMSTRIP CALLS THEM. Pages are numbered, and a cover is not a page, so it gets the
 * abbreviation a printer would use rather than a number that would shift every real page along.
 */
export const COVER_ABBR: Record<CoverSurfaceId, string> = {
  front: 'FC',
  frontInside: 'IFC',
  backInside: 'IBC',
  back: 'BC',
};


/** A cover with one surface's stickers replaced, and NOTHING else touched (showCover included). */
export function withSurface(cover: BinderCover, surface: CoverSurfaceId, next: CoverSticker[]): BinderCover {
  return { ...cover, surfaces: { ...(cover.surfaces ?? {}), [surface]: next } };
}

/*
 * The toolbar that used to live here — Upload / Bigger / Smaller / Turn / Straighten / Forward /
 * Back / Remove — is CoverPanel now: a real properties panel with a layers tray beside it, in the
 * Art dock, and the hit layer is CoverDecorationLayer — a real canvas with handles. This file keeps
 * the surface writer and the abbreviations.
 */


