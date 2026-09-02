/**
 * THE CANVAS — the transparent layer over a cover surface that decides what a finger means.
 *
 * The pictures are drawn by the surface underneath; this only holds hit boxes and handles. It
 * works in the SURFACE FRAME in pixels through coverGeometry, and hands the caller a live patch
 * on every frame and a committed patch on release — the same two-callback shape the old sticker
 * layer had, so the surface can draw the live state while the layer keeps measuring from the
 * committed one and a drag never compounds on itself.
 *
 * What a selected, unlocked decoration gets: eight resize handles — a corner drag is FREE, pull
 * down for taller and right for wider, unless the decoration's aspect is locked; Shift flips that
 * for one drag, Alt scales about the centre — a rotate grab above the top edge that turns with the
 * box (Shift locks to 15°), pinch-to-scale and two-finger rotate on the body, snapping to the
 * surface's edges, seam, centre lines, the grid when it is on, and every other layer's edges and
 * centre — with the guide drawn while it bites. Arrow keys nudge by 1% (Shift: 5%), Delete
 * removes, Escape deselects. A locked decoration selects and nothing else.
 *
 * Transform handles and guides are drawn with the box's own rotation applied, so they sit on
 * the picture's corners rather than on its bounding rectangle's.
 */
import { useEffect, useState } from 'react';
import { Platform, Pressable, StyleSheet, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { runOnJS } from 'react-native-reanimated';

import { Palette } from '@/constants/theme';
import type { CoverDecoration } from '@/data/binderTypes';
import { MIN_W } from '@/data/coverDecorations';
import {
  ROTATE_HANDLE_OFFSET,
  SEAM_INSET,
  boxToDecoration,
  decorationBox,
  handlePoints,
  pointerAngle,
  resizeBox,
  rotateBox,
  snapBox,
  surfaceLines,
  type Box,
  type Handle,
} from '@/data/coverGeometry';

const HANDLE = 10;
const HANDLE_HIT = 22;
const GRID_DIVISIONS = 8;

/** What the surface draws while a gesture is in flight. */
export interface LiveDrag {
  id: string;
  patch: Partial<CoverDecoration>;
  guideX: number | null;
  guideY: number | null;
}

/**
 * Modifier keys, as React state from a window listener — web only, where there is a keyboard.
 * State rather than a shared value: the gesture reads it when building its patch, and a re-render
 * on Shift is cheap.
 */
function useModifiers(): { shift: boolean; alt: boolean } {
  const [mods, setMods] = useState({ shift: false, alt: false });
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;
    const on = (e: KeyboardEvent) => setMods({ shift: e.shiftKey, alt: e.altKey });
    window.addEventListener('keydown', on);
    window.addEventListener('keyup', on);
    return () => {
      window.removeEventListener('keydown', on);
      window.removeEventListener('keyup', on);
    };
  }, []);
  return mods;
}

export function CoverDecorationLayer({
  width,
  height,
  items,
  drag,
  selected,
  onSelect,
  onDrag,
  onCommit,
  onRemove,
  snap,
  grid,
}: {
  width: number;
  height: number;
  /** COMMITTED decorations. Every gesture measures from these. */
  items: CoverDecoration[];
  /** The decoration mid-gesture and its live patch, held by the caller. */
  drag: LiveDrag | null;
  selected: string | null;
  onSelect: (id: string | null) => void;
  /** Every frame of a gesture. */
  onDrag: (live: LiveDrag | null) => void;
  /** Once, on release. */
  onCommit: (id: string, patch: Partial<CoverDecoration>) => void;
  onRemove: (id: string) => void;
  snap: boolean;
  grid: boolean;
}) {
  const mods = useModifiers();
  const W = width;
  const H = height;
  const seam = Math.max(6, W * SEAM_INSET);

  // Arrow keys nudge the selection; Delete removes it; Escape lets it go. Never while typing.
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined' || !selected) return;
    const d = items.find((it) => it.id === selected);
    if (!d) return;
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
      const step = e.shiftKey ? 0.05 : 0.01;
      if (e.key === 'Escape') {
        onSelect(null);
        return;
      }
      if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        onRemove(d.id);
        return;
      }
      if (d.locked) return;
      const dx = e.key === 'ArrowLeft' ? -step : e.key === 'ArrowRight' ? step : 0;
      const dy = e.key === 'ArrowUp' ? -step : e.key === 'ArrowDown' ? step : 0;
      if (!dx && !dy) return;
      e.preventDefault();
      onCommit(d.id, {
        x: Math.min(1, Math.max(0, d.x + dx)),
        y: Math.min(1, Math.max(0, d.y + dy)),
      });
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selected, items, onSelect, onCommit, onRemove]);

  const lines = (except: string) =>
    surfaceLines(W, H, {
      seam,
      grid: grid ? GRID_DIVISIONS : null,
      others: items.filter((it) => it.id !== except && !it.hidden).map((it) => decorationBox(it, W, H)),
    });

  /** The live box for a decoration: the committed one with the in-flight patch applied. */
  const liveBox = (d: CoverDecoration): Box =>
    decorationBox(drag && drag.id === d.id ? ({ ...d, ...drag.patch } as CoverDecoration) : d, W, H);

  const publish = (d: CoverDecoration, box: Box, guideX: number | null = null, guideY: number | null = null) =>
    onDrag({ id: d.id, patch: boxToDecoration(box, W, H), guideX, guideY });

  return (
    <>
      {/* A tap on bare cover clears the selection. */}
      <Pressable style={StyleSheet.absoluteFill} onPress={() => onSelect(null)} testID="cover-canvas" />

      {grid ? <GridOverlay W={W} H={H} /> : null}

      {/* Bodies, in stacking order so the front-most wins a tap. */}
      {items.map((d) => {
        if (d.hidden) return null;
        const box = liveBox(d);
        const on = d.id === selected;
        const locked = !!d.locked;
        const base = decorationBox(d, W, H);

        const move = Gesture.Pan()
          .enabled(!locked)
          .onStart(() => runOnJS(onSelect)(d.id))
          .onUpdate((e) => {
            let next: Box = { ...base, cx: base.cx + e.translationX, cy: base.cy + e.translationY };
            let gx: number | null = null;
            let gy: number | null = null;
            if (snap) {
              const s = snapBox(next, lines(d.id));
              next = s.box;
              gx = s.guideX;
              gy = s.guideY;
            }
            // Keep the centre on the surface: a piece dragged off the edge is lost.
            next.cx = Math.min(W, Math.max(0, next.cx));
            next.cy = Math.min(H, Math.max(0, next.cy));
            runOnJS(publish)(d, next, gx, gy);
          })
          .onEnd((e) => {
            let next: Box = { ...base, cx: base.cx + e.translationX, cy: base.cy + e.translationY };
            if (snap) next = snapBox(next, lines(d.id)).box;
            next.cx = Math.min(W, Math.max(0, next.cx));
            next.cy = Math.min(H, Math.max(0, next.cy));
            runOnJS(onDrag)(null);
            runOnJS(onCommit)(d.id, boxToDecoration(next, W, H));
          })
          .onFinalize(() => runOnJS(onDrag)(null));

        const pinch = Gesture.Pinch()
          .enabled(!locked)
          .onStart(() => runOnJS(onSelect)(d.id))
          .onUpdate((e) => {
            const s = Math.max(MIN_W * W, base.w * e.scale) / base.w;
            runOnJS(publish)(d, { ...base, w: base.w * s, h: base.h * s });
          })
          .onEnd((e) => {
            const s = Math.max(MIN_W * W, base.w * e.scale) / base.w;
            runOnJS(onDrag)(null);
            runOnJS(onCommit)(d.id, boxToDecoration({ ...base, w: base.w * s, h: base.h * s }, W, H));
          });

        const twist = Gesture.Rotation()
          .enabled(!locked)
          .onUpdate((e) => {
            runOnJS(publish)(d, { ...base, rot: base.rot + (e.rotation * 180) / Math.PI });
          })
          .onEnd((e) => {
            runOnJS(onDrag)(null);
            runOnJS(onCommit)(d.id, boxToDecoration({ ...base, rot: base.rot + (e.rotation * 180) / Math.PI }, W, H));
          });

        const tap = Gesture.Tap().onEnd((_e, success) => {
          if (success) runOnJS(onSelect)(d.id);
        });
        // THE TAP WAITS FOR THE PAN ONLY. A click must select, and the pan fails fast on a click
        // (no movement past its threshold). The two-finger gestures are SIMULTANEOUS with that pair
        // rather than ahead of it: on the web a pinch or a rotation with one pointer does not fail
        // until release, and anything queued behind them — the tap, and before that the pan —
        // never got its turn. Two fingers can pinch and twist while the pan rides along, which is
        // how it feels in Canva too.
        const gesture = Gesture.Simultaneous(Gesture.Exclusive(move, tap), pinch, twist);

        return (
          <GestureDetector key={d.id} gesture={gesture}>
            <View
              testID={`cover-hit-${d.id}`}
              style={{
                position: 'absolute',
                left: box.cx - box.w / 2,
                top: box.cy - box.h / 2,
                width: box.w,
                height: box.h,
                transform: box.rot ? [{ rotate: `${box.rot}deg` }] : undefined,
                borderWidth: on ? 1.5 : 0,
                borderColor: locked ? Palette.muted : Palette.accent,
                borderStyle: locked ? 'dashed' : 'solid',
              }}
            />
          </GestureDetector>
        );
      })}

      {/* Handles for the selection, above every body so they win. */}
      {(() => {
        const d = items.find((it) => it.id === selected);
        if (!d || d.hidden || d.locked) return null;
        const base = decorationBox(d, W, H);
        const box = liveBox(d);
        const pts = handlePoints(box);
        const handles: Handle[] = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];
        return (
          <>
            {handles.map((h) => {
              const isCorner = h.length === 2;
              const pan = Gesture.Pan()
                .onUpdate((e) => {
                  let next = resizeBox(base, h, e.translationX, e.translationY, {
                    keepAspect: isCorner ? !!d.lockAspect !== mods.shift : false,
                    fromCentre: mods.alt,
                    minPx: MIN_W * W,
                  });
                  let gx: number | null = null;
                  let gy: number | null = null;
                  if (snap && !mods.alt) {
                    const s = snapBox(next, lines(d.id));
                    // Only the moving edge may snap: re-anchor by re-running the resize with the
                    // snapped delta is overkill here, so the box is nudged as a whole and the
                    // guides are shown. Edge-accurate snapping is a follow-up.
                    next = s.box;
                    gx = s.guideX;
                    gy = s.guideY;
                  }
                  runOnJS(publish)(d, next, gx, gy);
                })
                .onEnd((e) => {
                  const next = resizeBox(base, h, e.translationX, e.translationY, {
                    keepAspect: isCorner ? !!d.lockAspect !== mods.shift : false,
                    fromCentre: mods.alt,
                    minPx: MIN_W * W,
                  });
                  runOnJS(onDrag)(null);
                  runOnJS(onCommit)(d.id, boxToDecoration(next, W, H));
                })
                .onFinalize(() => runOnJS(onDrag)(null));
              const p = pts[h];
              return (
                <GestureDetector key={h} gesture={pan}>
                  <View
                    testID={`cover-handle-${h}`}
                    style={[
                      styles.handleHit,
                      { left: p.x - HANDLE_HIT / 2, top: p.y - HANDLE_HIT / 2 },
                      Platform.OS === 'web' ? ({ cursor: cursorName(h, box.rot) } as object) : null,
                    ]}>
                    <View style={[styles.handle, { transform: [{ rotate: `${box.rot}deg` }] }]} />
                  </View>
                </GestureDetector>
              );
            })}
            {/* The rotate grab: above the top edge in the box's own frame, so it turns with it. */}
            <RotateGrab
              base={base}
              box={box}
              W={W}
              H={H}
              constrain={mods.shift}
              onLive={(b) => publish(d, b)}
              onDone={(b) => {
                onDrag(null);
                onCommit(d.id, boxToDecoration(b, W, H));
              }}
            />
            <View
              pointerEvents="none"
              style={{
                position: 'absolute',
                left: pts.n.x,
                top: pts.n.y,
                width: 1,
                height: ROTATE_HANDLE_OFFSET,
                backgroundColor: Palette.accent,
                transform: [{ translateX: -0.5 }, { translateY: -ROTATE_HANDLE_OFFSET }, { rotate: `${box.rot}deg` }],
                transformOrigin: 'bottom',
              }}
            />
          </>
        );
      })()}

      {/* Guides while a snap bites. */}
      {drag?.guideX != null ? (
        <View pointerEvents="none" style={{ position: 'absolute', left: drag.guideX, top: 0, bottom: 0, width: 1, backgroundColor: Palette.accent, opacity: 0.85 }} />
      ) : null}
      {drag?.guideY != null ? (
        <View pointerEvents="none" style={{ position: 'absolute', top: drag.guideY, left: 0, right: 0, height: 1, backgroundColor: Palette.accent, opacity: 0.85 }} />
      ) : null}
    </>
  );
}

function RotateGrab({
  base,
  box,
  W,
  H,
  constrain,
  onLive,
  onDone,
}: {
  base: Box;
  box: Box;
  W: number;
  H: number;
  constrain: boolean;
  onLive: (b: Box) => void;
  onDone: (b: Box) => void;
}) {
  const pts = handlePoints(box);
  // The pointer's angle when the grab began, seeded from the handle's own position: the grab
  // starts ON the handle, so its angle from the centre is the handle's.
  const angle0 = pointerAngle(base, handlePoints(base).rotate);
  const pan = Gesture.Pan()
    .onUpdate((e) => {
      const start = handlePoints(base).rotate;
      const pointer = { x: start.x + e.translationX, y: start.y + e.translationY };
      onLive(rotateBox(base, pointer, { angle0, rot0: base.rot }, { constrain }));
    })
    .onEnd((e) => {
      const start = handlePoints(base).rotate;
      const pointer = { x: start.x + e.translationX, y: start.y + e.translationY };
      onDone(rotateBox(base, pointer, { angle0, rot0: base.rot }, { constrain }));
    })
    .runOnJS(true);
  void W;
  void H;
  return (
    <GestureDetector gesture={pan}>
      <View
        testID="cover-handle-rotate"
        style={[
          styles.handleHit,
          { left: pts.rotate.x - HANDLE_HIT / 2, top: pts.rotate.y - HANDLE_HIT / 2 },
          Platform.OS === 'web' ? ({ cursor: 'grab' } as object) : null,
        ]}>
        <View style={styles.rotateDot} />
      </View>
    </GestureDetector>
  );
}

function GridOverlay({ W, H }: { W: number; H: number }) {
  const xs = Array.from({ length: GRID_DIVISIONS - 1 }, (_, i) => (W * (i + 1)) / GRID_DIVISIONS);
  const ys = Array.from({ length: GRID_DIVISIONS - 1 }, (_, i) => (H * (i + 1)) / GRID_DIVISIONS);
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      {xs.map((x) => (
        <View key={`x${x}`} style={{ position: 'absolute', left: x, top: 0, bottom: 0, width: StyleSheet.hairlineWidth, backgroundColor: Palette.accent, opacity: 0.25 }} />
      ))}
      {ys.map((y) => (
        <View key={`y${y}`} style={{ position: 'absolute', top: y, left: 0, right: 0, height: StyleSheet.hairlineWidth, backgroundColor: Palette.accent, opacity: 0.25 }} />
      ))}
    </View>
  );
}

function cursorName(h: Handle, rot: number): string {
  const base: Record<Handle, number> = { n: 0, ne: 45, e: 90, se: 135, s: 180, sw: 225, w: 270, nw: 315 };
  const a = (((base[h] + rot) % 360) + 360) % 360;
  const oct = Math.round(a / 45) % 8;
  return oct === 0 || oct === 4 ? 'ns-resize' : oct === 2 || oct === 6 ? 'ew-resize' : oct === 1 || oct === 5 ? 'nesw-resize' : 'nwse-resize';
}

const styles = StyleSheet.create({
  handleHit: { position: 'absolute', width: HANDLE_HIT, height: HANDLE_HIT, alignItems: 'center', justifyContent: 'center', zIndex: 5 },
  handle: { width: HANDLE, height: HANDLE, borderRadius: 2, backgroundColor: '#ffffff', borderWidth: 1.5, borderColor: Palette.accent },
  rotateDot: { width: HANDLE + 2, height: HANDLE + 2, borderRadius: HANDLE, backgroundColor: '#ffffff', borderWidth: 1.5, borderColor: Palette.accent },
});
