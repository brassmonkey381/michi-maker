/**
 * A live binder that turns its own pages on a timer — used on the marketing landing so the hero
 * and the gallery show real, moving binder content instead of a screenshot.
 *
 * THE PAGE ACTUALLY TURNS, on a hinge at the rings. This used to crossfade whole frames: the
 * entire spread faded out and the next faded in, which read as picking the binder up, turning a
 * page off camera, and sliding it back. Nothing rotated, so nothing looked like paper.
 *
 * WHAT A REAL TURN IS, and what is modelled here. One leaf is hinged at the spine. Its FRONT is
 * the right-hand page of the spread you are on; its BACK is the left-hand page of the spread you
 * are going to, because they are two sides of one sheet. As the leaf swings from 0° to -180° it
 * shows its front until it passes edge-on at 90°, then its back for the rest of the arc. Under it,
 * the base is already the OLD LEFT page beside the NEW RIGHT page, so the leaf reveals the new
 * right page as it lifts and covers the old left page as it lands. At either end the layers agree
 * exactly with the settled spread, so the commit is invisible.
 *
 * That single arrangement plays both ways: forward runs the hinge 0° → -180°, backward runs the
 * same leaf -180° → 0°. There is no separate reverse animation to keep in sync.
 *
 * DEPTH COMES FROM THREE CHEAP THINGS: a perspective on the transform, so the leaf foreshortens
 * instead of merely squashing; a shadow that darkens the face as it turns away from the light and
 * fades as it settles; and an easing that starts slow, falls through the middle, and settles — a
 * page has weight, and constant-speed rotation is the tell that it does not.
 *
 * SINGLE-PAGE MODE (narrow screens) has nowhere to sweep a full 180°: there is no facing page to
 * sweep over, so a half-turn would sail outside the component and over the copy beside it. It
 * instead lifts the outgoing page to 90°, foreshortening into the hinge while the next page is
 * revealed beneath. Same hinge, same shading, bounded by the page it is drawn in.
 *
 * Honours prefers-reduced-motion (web): frames change with no animation at all. Purely
 * presentational — pointer events pass through to a parent Pressable.
 */
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import { runOnJS, useSharedValue, withTiming } from 'react-native-reanimated';

import { BinderGrid } from '@/components/binder/BinderGrid';
import { SingleTurnLeaf, TURN_EASING, TURN_MS, TurnLeaf } from '@/components/binder/pageTurn';
import { Palette, Spacing } from '@/constants/theme';
import type { DemoBinder, DemoPage } from '@/data/binderTypes';

function reducedMotion(): boolean {
  return (
    Platform.OS === 'web' &&
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

const RINGS = [0, 1, 2, 3];
const SPINE_W = 22;

/** One frame: a single page, or a facing pair. */
type Frame = DemoPage[];

/** The page that sits on the left of a spread frame, or null for the lone first page. */
const leftOf = (f: Frame): DemoPage | null => (f.length === 2 ? f[0] : null);
/** The page on the right of a spread frame — the lone first page lives here, as in a real binder. */
const rightOf = (f: Frame): DemoPage => f[f.length - 1];

export function AutoFlipBinder({
  binder,
  pageWidth,
  spread = false,
  autoFlip = true,
  interval = 3600,
  maxFrames = 4,
}: {
  binder: DemoBinder;
  /** Width of a single page in px. */
  pageWidth: number;
  /** Render facing-page spreads (advancing two pages at a time) instead of single pages. */
  spread?: boolean;
  /** When false, show only the first frame — no timer, no dots (a static binder). */
  autoFlip?: boolean;
  /** Dwell on a spread before the next turn starts. */
  interval?: number;
  maxFrames?: number;
}) {
  const frames = useMemo<Frame[]>(() => {
    const pages = binder.pages ?? [];
    let built: Frame[];
    if (spread) {
      // Real binder pagination (matches pageSide() physics): page 1 sits ALONE on the
      // RIGHT of the rings — nothing faces it — then facing pairs 2-3, 4-5, …
      built = pages.length ? [[pages[0]]] : [];
      for (let i = 1; i + 1 < pages.length && built.length < maxFrames; i += 2) {
        built.push([pages[i], pages[i + 1]]);
      }
    } else {
      built = pages.slice(0, maxFrames).map((p) => [p]);
    }
    return autoFlip ? built : built.slice(0, 1);
  }, [binder.pages, spread, maxFrames, autoFlip]);

  /** The settled frame. During a turn this stays put; the leaf carries the change. */
  const [idx, setIdx] = useState(0);
  /** The turn in flight, or null when settled. */
  const [turn, setTurn] = useState<{ from: number; to: number; forward: boolean } | null>(null);
  const idxRef = useRef(0);
  const turningRef = useRef(false);
  /** Which way the auto-flip is walking. It reverses at each end rather than snapping home. */
  const dirRef = useRef(1);
  const t = useSharedValue(0);

  const clampedIdx = frames.length > 0 ? Math.min(idx, frames.length - 1) : 0;
  useEffect(() => {
    idxRef.current = clampedIdx;
  }, [clampedIdx]);

  const settle = useCallback((to: number) => {
    turningRef.current = false;
    idxRef.current = to;
    setIdx(to);
    setTurn(null);
  }, []);

  // AUTO-FLIP WALKS AND TURNS BACK. Wrapping from the last spread to the first was a jump the
  // hinge cannot express — it would have to riffle every page back at once — so at each end the
  // walk reverses and the same leaf plays in the other direction.
  useEffect(() => {
    if (!autoFlip || frames.length <= 1) return;
    const id = setInterval(() => {
      if (turningRef.current) return; // a turn is still in the air
      const from = idxRef.current;
      let next = from + dirRef.current;
      if (next >= frames.length || next < 0) {
        dirRef.current = -dirRef.current;
        next = from + dirRef.current;
      }
      if (next === from || next < 0 || next >= frames.length) return;
      if (reducedMotion()) {
        settle(next);
        return;
      }
      turningRef.current = true;
      setTurn({ from, to: next, forward: next > from });
    }, interval);
    return () => clearInterval(id);
  }, [autoFlip, frames.length, interval, settle]);

  // Drive the hinge whenever a turn is mounted. `t` always runs 0 → 1; which way the leaf swings
  // is decided by the angle mapping below, so there is one animation for both directions.
  //
  // BEFORE THE PAINT, not after. `t` is left at 1 by the turn that just finished, and a plain
  // effect runs after the browser has painted, so the first frame of every turn was drawn at the
  // END of the arc: the sheet already flipped over, showing the wrong face. A layout effect resets
  // it in the same frame the leaf appears in. Same fix, same reason, as the viewer's own hinge.
  useLayoutEffect(() => {
    if (!turn) return;
    const to = turn.to;
    t.value = 0;
    t.value = withTiming(1, { duration: TURN_MS, easing: TURN_EASING }, (finished) => {
      if (finished) runOnJS(settle)(to);
    });
  }, [turn, t, settle]);

  const width = spread ? pageWidth * 2 + SPINE_W + Spacing.two * 2 : pageWidth;
  const displayIdx = turn ? turn.to : clampedIdx;

  if (frames.length === 0) return <View style={{ width }} />;

  /**
   * EVERY PAGE A TURN CAN NEED IS ALREADY BUILT, AND STAYS BUILT.
   *
   * Mounting the sheet when a turn began put fresh page grids, and so fresh image elements, into
   * the exact frame the animation started in. That is the flash the app's own binder had, found by
   * removing the overlay and finding it gone; this binder builds its sheet the same way and so
   * flashed for the same reason.
   *
   * Everything is therefore addressed from the frame the reader is RESTING on, and while a turn is
   * running, from the frame it STARTED on. Those are the same frame across the moment a turn
   * begins, so no address changes, so nothing is rebuilt while anyone is watching. Both sheets are
   * kept, forward and backward, because the walk reverses at each end and the leaf it turns back
   * with has to be there already.
   */
  const rest = turn ? turn.from : clampedIdx;
  const at = (i: number): Frame | null => (i >= 0 && i < frames.length ? frames[i] : null);
  const restFrame = frames[rest];
  const aheadFrame = at(rest + 1);
  const behindFrame = at(rest - 1);
  const fwd = Boolean(turn?.forward);
  const bwd = Boolean(turn && !turn.forward);
  // The stage's two halves, each with the page it rests on and the page a turn would swap in.
  // The resting page stays IN FLOW so the box keeps its height while the alternate is shown.
  const half = (settled: DemoPage | null, alternate: DemoPage | null, showAlternate: boolean) => (
    <View style={{ width: pageWidth }}>
      <View style={showAlternate ? styles.kept : undefined}>
        {settled ? <BinderGrid page={settled} width={pageWidth} /> : null}
      </View>
      {alternate ? (
        <View style={[StyleSheet.absoluteFill, showAlternate ? undefined : styles.kept]}>
          <BinderGrid page={alternate} width={pageWidth} />
        </View>
      ) : null}
    </View>
  );

  return (
    <View style={{ width }}>
      <View>
        {spread ? (
          // Turning forward reveals the NEXT frame's right page; turning back reveals the previous
          // frame's left page. Both are kept, so neither arrives when the sheet lifts off it.
          <SpreadStage
            pageWidth={pageWidth}
            left={half(leftOf(restFrame), behindFrame ? leftOf(behindFrame) : null, bwd)}
            right={half(rightOf(restFrame), aheadFrame ? rightOf(aheadFrame) : null, fwd)}
          />
        ) : (
          half(
            rightOf(restFrame),
            turn ? rightOf(frames[turn.to]) : null,
            Boolean(turn),
          )
        )}

        {spread ? (
          <>
            <View style={[StyleSheet.absoluteFill, fwd ? undefined : styles.kept]} pointerEvents="none">
              <TurnLeaf
                t={t}
                forward
                width={pageWidth}
                // The right page starts after the left page, a gap, the spine and another gap.
                hingeLeft={pageWidth + Spacing.two + SPINE_W + Spacing.two}
                // ...all of which the sheet crosses on its way to lying flat on the left page.
                spine={SPINE_W + Spacing.two * 2}
                front={<BinderGrid page={rightOf(restFrame)} width={pageWidth} />}
                back={
                  aheadFrame && leftOf(aheadFrame) ? (
                    <BinderGrid page={leftOf(aheadFrame) as DemoPage} width={pageWidth} />
                  ) : null
                }
              />
            </View>
            <View style={[StyleSheet.absoluteFill, bwd ? undefined : styles.kept]} pointerEvents="none">
              <TurnLeaf
                t={t}
                forward={false}
                width={pageWidth}
                hingeLeft={pageWidth + Spacing.two + SPINE_W + Spacing.two}
                spine={SPINE_W + Spacing.two * 2}
                front={
                  behindFrame ? <BinderGrid page={rightOf(behindFrame)} width={pageWidth} /> : null
                }
                back={leftOf(restFrame) ? <BinderGrid page={leftOf(restFrame) as DemoPage} width={pageWidth} /> : null}
              />
            </View>
          </>
        ) : (
          <View style={[StyleSheet.absoluteFill, turn ? undefined : styles.kept]} pointerEvents="none">
            <SingleTurnLeaf
              t={t}
              width={pageWidth}
              page={<BinderGrid page={rightOf(restFrame)} width={pageWidth} />}
            />
          </View>
        )}
      </View>

      {frames.length > 1 ? (
        <View style={styles.dots} pointerEvents="none">
          {frames.map((_, i) => (
            <View key={i} style={[styles.dot, i === displayIdx && styles.dotActive]} />
          ))}
        </View>
      ) : null}
    </View>
  );
}

/** The settled spread: a page, the rings, a page. Defines the stage height. */
function SpreadStage({
  left,
  right,
}: {
  pageWidth: number;
  /** Already-built halves: each keeps its resting page and the one a turn would swap in. */
  left: ReactNode;
  right: ReactNode;
}) {
  return (
    <View style={styles.spreadRow} pointerEvents="none">
      {left}
      <View style={styles.spine}>
        {RINGS.map((r) => (
          <View key={r} style={styles.ring} />
        ))}
      </View>
      {right}
    </View>
  );
}

const styles = StyleSheet.create({
  spreadRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  // KEPT, NOT SHOWN. Opacity rather than an unmount, because the whole point is that these pages
  // stay laid out and their images stay decoded until the turn that needs them.
  kept: { opacity: 0 },
  spine: {
    width: SPINE_W,
    alignSelf: 'stretch',
    alignItems: 'center',
    justifyContent: 'space-around',
    paddingVertical: Spacing.four,
  },
  ring: { width: 10, height: 10, borderRadius: 5, borderWidth: 2, borderColor: Palette.hairlineStrong },
  // Stretched to the stage height but CENTRED like the static pages beside it (spreadRow centres
  // its children): without this the turning page rides at the top of the stage and jumps back
  // into line the moment it lands.
  dots: { flexDirection: 'row', justifyContent: 'center', gap: Spacing.one, marginTop: Spacing.three },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: Palette.hairlineStrong },
  dotActive: { width: 16, backgroundColor: Palette.accent },
});
