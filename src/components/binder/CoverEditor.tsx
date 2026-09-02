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
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { runOnJS } from 'react-native-reanimated';

import { ArtUploadButton } from '@/components/binder/ArtUploadButton';
import { ThemedText } from '@/components/themed-text';
import { FontSize, Palette, Radius, Spacing, Weight } from '@/constants/theme';
import { COVER_SURFACE_LABELS, type CoverSurfaceId } from '@/data/binderModels';
import { uuidv4, type BinderCover, type CoverSticker } from '@/data/binderTypes';

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

/** How wide a new sticker lands, as a fraction of the cover: big enough to grab, small enough to move. */
const NEW_STICKER_W = 0.34;
const MIN_W = 0.06;
const MAX_W = 1.6;

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

/**
 * The toolbar for the surface in focus: add art, and act on the selected sticker. Lives in the
 * binder's own chrome, in edit mode, next to the page it belongs to.
 */
export function CoverTools({
  cover,
  surface,
  selected,
  onSelect,
  onChange,
}: {
  cover: BinderCover;
  surface: CoverSurfaceId;
  selected: string | null;
  onSelect: (id: string | null) => void;
  onChange: (cover: BinderCover) => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const stickers = cover.surfaces?.[surface] ?? [];
  const chosen = stickers.find((s) => s.id === selected) ?? null;
  const write = (next: CoverSticker[]) => onChange(withSurface(cover, surface, next));
  const patch = (id: string, change: Partial<CoverSticker>) =>
    write(stickers.map((s) => (s.id === id ? ({ ...s, ...change } as CoverSticker) : s)));

  // A sticker already at the top or bottom of the stack stays put, and the store is not asked
  // to save a cover that did not change.
  const restack = (by: 1 | -1) => {
    if (!chosen) return;
    const next = shift(stickers, chosen.id, by);
    if (next !== stickers) write(next);
  };

  const addArt = (url: string) => {
    const sticker: CoverSticker = { id: uuidv4(), imageUrl: url, x: 0.5, y: 0.5, w: NEW_STICKER_W };
    write([...stickers, sticker]);
    onSelect(sticker.id);
    setError(null);
  };

  return (
    <View style={styles.tools}>
      <View style={styles.toolsHead}>
        <ThemedText type="smallBold">
          {COVER_ABBR[surface]} · {COVER_SURFACE_LABELS[surface]}
        </ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          {chosen
            ? 'Drag it to move it.'
            : stickers.length
              ? 'Tap something on the cover to move or resize it.'
              : 'Nothing here yet. Add art to start.'}
        </ThemedText>
      </View>
      <View style={styles.toolRow}>
        <ArtUploadButton onUploaded={addArt} onError={setError} />
        {chosen ? (
          <>
            <Tool label="Bigger" onPress={() => patch(chosen.id, { w: Math.min(MAX_W, chosen.w * 1.15) })} />
            <Tool label="Smaller" onPress={() => patch(chosen.id, { w: Math.max(MIN_W, chosen.w / 1.15) })} />
            <Tool label="Turn left" onPress={() => patch(chosen.id, { rot: ((chosen.rot ?? 0) - 15) % 360 })} />
            <Tool label="Turn right" onPress={() => patch(chosen.id, { rot: ((chosen.rot ?? 0) + 15) % 360 })} />
            <Tool label="Straighten" onPress={() => patch(chosen.id, { rot: 0 })} />
            {/* Layers form one picture, so the order they are stacked in is part of the picture. */}
            <Tool label="Forward" onPress={() => restack(1)} />
            <Tool label="Back" onPress={() => restack(-1)} />
            <Tool
              label="Remove"
              tone="danger"
              onPress={() => {
                write(stickers.filter((s) => s.id !== chosen.id));
                onSelect(null);
              }}
            />
          </>
        ) : null}
      </View>
      {error ? (
        <ThemedText type="small" themeColor="textSecondary">
          {error}
        </ThemedText>
      ) : null}
    </View>
  );
}

/** Move one sticker a step up or down the stack. Later in the array draws on top. */
function shift(stickers: CoverSticker[], id: string, by: 1 | -1): CoverSticker[] {
  const i = stickers.findIndex((s) => s.id === id);
  const j = i + by;
  if (i < 0 || j < 0 || j >= stickers.length) return stickers;
  const next = [...stickers];
  [next[i], next[j]] = [next[j], next[i]];
  return next;
}

function Tool({ label, onPress, tone }: { label: string; onPress: () => void; tone?: 'danger' }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.tool, pressed && styles.toolPressed]}>
      <ThemedText type="small" style={tone === 'danger' ? styles.dangerText : undefined}>
        {label}
      </ThemedText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  tools: { gap: 6, marginTop: Spacing.two, alignItems: 'center' },
  toolsHead: { alignItems: 'center', gap: 2 },
  toolRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, justifyContent: 'center' },
  tool: {
    borderWidth: 1,
    borderColor: Palette.hairlineStrong,
    borderRadius: Radius.control,
    paddingVertical: 5,
    paddingHorizontal: 10,
  },
  toolPressed: { opacity: 0.6 },
  dangerText: { color: Palette.danger, fontSize: FontSize.sm, fontWeight: Weight.semibold },
});
