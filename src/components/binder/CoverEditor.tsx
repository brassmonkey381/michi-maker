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
import { Pressable, StyleSheet, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { runOnJS } from 'react-native-reanimated';

import { Palette } from '@/constants/theme';
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

/**
 * The hit targets over a surface's stickers. Transparent, since the pictures themselves are drawn
 * by the surface underneath; this only decides what a finger on them means.
 */
export function CoverStickerLayer({
  width,
  height,
  stickers,
  drag,
  selected,
  onSelect,
  onDrag,
  onMove,
}: {
  width: number;
  height: number;
  /** COMMITTED positions. The drag is measured from these. */
  stickers: CoverSticker[];
  /** The sticker mid-drag and where it has got to, held by the caller. */
  drag: { id: string; x: number; y: number } | null;
  selected: string | null;
  onSelect: (id: string | null) => void;
  /** Every move of the finger, as the sticker's would-be centre in fractions. */
  onDrag: (id: string, x: number, y: number) => void;
  /** Once, on release, with the sticker's new centre as fractions. */
  onMove: (id: string, x: number, y: number) => void;
}) {
  // Runs inside the gesture callbacks, which the worklets plugin lifts onto the UI thread on
  // native; a plain closure there is a call across threads and throws on the first frame.
  const clamp = (v: number) => {
    'worklet';
    return Math.min(1, Math.max(0, v));
  };

  return (
    <>
      {/* A tap on bare cover clears the selection, so the toolbar goes away when you are done. */}
      <Pressable style={StyleSheet.absoluteFill} onPress={() => onSelect(null)} />
      {stickers.map((sticker) => {
        const live = drag && drag.id === sticker.id ? drag : sticker;
        const w = Math.max(8, sticker.w * width);
        const on = sticker.id === selected;
        const pan = Gesture.Pan()
          .onStart(() => runOnJS(onSelect)(sticker.id))
          .onUpdate((e) => {
            // Clamped to the cover: a sticker dragged off the edge is lost, and undoing that by
            // hand is worse than simply not letting it happen.
            runOnJS(onDrag)(
              sticker.id,
              clamp(sticker.x + e.translationX / width),
              clamp(sticker.y + e.translationY / height),
            );
          })
          .onEnd((e) => {
            runOnJS(onMove)(
              sticker.id,
              clamp(sticker.x + e.translationX / width),
              clamp(sticker.y + e.translationY / height),
            );
          });
        const tap = Gesture.Tap().onEnd(() => runOnJS(onSelect)(sticker.id));
        return (
          <GestureDetector key={sticker.id} gesture={Gesture.Exclusive(pan, tap)}>
            <View
              style={{
                position: 'absolute',
                left: live.x * width - w / 2,
                top: live.y * height - w / 2,
                width: w,
                height: w,
                transform: sticker.rot ? [{ rotate: `${sticker.rot}deg` }] : undefined,
                borderWidth: on ? 2 : 0,
                borderColor: Palette.accent,
                borderRadius: 4,
              }}
            />
          </GestureDetector>
        );
      })}
    </>
  );
}

/*
 * The toolbar that used to live here — Upload / Bigger / Smaller / Turn / Straighten / Forward /
 * Back / Remove — is CoverPanel now: a real properties panel with a layers tray beside it, in the
 * Art dock. This file keeps the surface writer, the abbreviations and, for now, the hit layer.
 */


