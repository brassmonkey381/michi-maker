/**
 * THE PAGE TURN, shared by every surface that turns a binder page — the landing binder and the
 * real viewer both draw this, so a page cannot turn one way on the marketing page and another way
 * in the app.
 *
 * WHY THE FACES SWAP BY ANGLE AND NOT BY `backfaceVisibility`. The obvious way to make one sheet
 * carry two pages is to hang a front and a back off the same rotating box and let
 * `backface-visibility: hidden` reveal whichever is pointing at you. In a browser that only works
 * when the PARENT has `transform-style: preserve-3d`, because otherwise the child's own rotation is
 * flattened into 2D and there is no back for the browser to hide. React Native has no
 * `transformStyle` prop to set that with, so the flag silently does nothing and BOTH faces paint —
 * which is exactly the "same picture on the front and the back, then it snaps to the new page"
 * that was reported.
 *
 * So visibility is driven from the animation instead: the front is shown while the sheet faces the
 * reader, the back once it has passed edge-on at 90°. A hard switch, not a crossfade — paper does
 * not dissolve, and at exactly 90° the sheet is a line, so there is nothing on screen to see the
 * switch happen in. That also makes it portable: no 3D context, no per-platform flag.
 *
 * WHAT A LEAF IS. One sheet hinged at the rings. Its FRONT is the right-hand page of the spread you
 * are leaving; its BACK is the left-hand page of the spread you are arriving at, because those are
 * two sides of one piece of card. Underneath it the caller draws the old left page beside the NEW
 * right page, so the leaf reveals the new right page as it lifts and covers the old left page as it
 * lands, and both ends of the arc agree exactly with a settled spread.
 *
 * Forward runs the hinge 0° → -180°; backward runs the same leaf -180° → 0°. One animation, both
 * directions.
 *
 * WHERE IT PIVOTS. Facing pages do not touch: there is a spine between them. So a sheet that
 * rotates about a fixed line can be flush with ONE of them, never both, and it ends its arc a
 * spine's width from where the page it just became is actually drawn. The pivot is therefore the
 * MIDDLE of the spine, with the sheet riding out to meet each page as it comes round — which is
 * also what a real page on a real ring does.
 */
import type { ReactNode } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import Animated, { Easing, interpolate, useAnimatedStyle, type SharedValue } from 'react-native-reanimated';

/** How long one leaf takes. Long enough to read as paper, short enough not to hold the page up. */
export const TURN_MS = 620;

/**
 * Someone who has asked their system for less motion gets none of this: the page simply changes.
 * Web-only because the preference only exists there; native falls through to the animation.
 */
export function turnReduced(): boolean {
  return (
    Platform.OS === 'web' &&
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}
/**
 * Slow to start, quick through the middle, settling at the end — a page falling, rather than a
 * value being animated. A symmetric ease reads mechanical at this duration.
 */
export const TURN_EASING = Easing.bezier(0.42, 0, 0.28, 1);
/** How dark a face gets at its most turned-away. Subtle: this is paper, not a closing door. */
const SHADE = 0.4;

/** The angle of the sheet at progress `t`, for a forward or backward turn. */
function angleAt(t: number, forward: boolean): number {
  'worklet';
  return forward ? interpolate(t, [0, 1], [0, -180]) : interpolate(t, [0, 1], [-180, 0]);
}

/**
 * A sheet hinged on its LEFT edge, carrying a different page on each side.
 *
 * `front` and `back` are rendered content, so a caller can hand it a real binder page, a marketing
 * grid, or anything else that is page-shaped.
 */
export function TurnLeaf({
  t,
  forward,
  width,
  hingeLeft,
  spine = 0,
  front,
  back,
}: {
  t: SharedValue<number>;
  forward: boolean;
  width: number;
  /** Distance from the stage's left edge to the RIGHT page's inner edge. */
  hingeLeft: number;
  /**
   * The width of the rings: the space between the two facing pages. The sheet pivots around the
   * MIDDLE of it, so it can lie flat on either page. Zero for a stage whose pages meet.
   */
  spine?: number;
  front: ReactNode;
  back: ReactNode;
}) {
  const leaf = useAnimatedStyle(() => {
    const a = angleAt(t.value, forward);
    return {
      transform: [
        // Perspective FIRST, or the rotation is an orthographic squash with no depth in it.
        { perspective: 1400 },
        // THE SHEET RIDES THE RINGS. A hinge is a line, but the rings are a cylinder, and a page
        // hooked over them has its inner edge on the circumference: hard against the right page at
        // 0 and hard against the left page at 180, having travelled the spine's whole width in
        // between. Listed before the rotation, so it moves the turned sheet in the stage's own
        // space rather than in the sheet's.
        { translateX: (spine / 2) * Math.cos((a * Math.PI) / 180) },
        { rotateY: `${a}deg` },
      ],
    };
  });
  // The hard swap at edge-on. `display` rather than opacity so the hidden face cannot catch a
  // stray pixel of anti-aliasing at the exact moment of the change.
  const frontFace = useAnimatedStyle(() => ({
    display: Math.abs(angleAt(t.value, forward)) < 90 ? 'flex' : 'none',
  }));
  const backFace = useAnimatedStyle(() => ({
    display: Math.abs(angleAt(t.value, forward)) >= 90 ? 'flex' : 'none',
  }));
  // Each face darkens as it turns away from the reader and clears as it lies flat.
  const frontShade = useAnimatedStyle(() => ({
    opacity: interpolate(Math.abs(angleAt(t.value, forward)), [0, 90], [0, SHADE], 'clamp'),
  }));
  const backShade = useAnimatedStyle(() => ({
    opacity: interpolate(Math.abs(angleAt(t.value, forward)), [90, 180], [SHADE, 0], 'clamp'),
  }));

  return (
    <Animated.View
      pointerEvents="none"
      style={[styles.leaf, { left: hingeLeft - spine / 2, width, transformOrigin: 'left center' }, leaf]}>
      <Animated.View style={frontFace}>
        {front}
        <Animated.View style={[StyleSheet.absoluteFill, styles.shade, frontShade]} pointerEvents="none" />
      </Animated.View>
      {/* Pre-flipped, so the page reads the right way round once the sheet has turned over. */}
      <Animated.View style={[styles.backFace, backFace]}>
        {back}
        <Animated.View style={[StyleSheet.absoluteFill, styles.shade, backShade]} pointerEvents="none" />
      </Animated.View>
    </Animated.View>
  );
}

/**
 * The one-page turn, for surfaces with no facing page to sweep over: the outgoing page lifts on the
 * same hinge to 90°, foreshortening into the rings while the next page is revealed beneath it.
 *
 * Deliberately a quarter turn. With nothing beside it, a half turn would swing the sheet outside
 * its own component and across whatever sits next to it.
 */
export function SingleTurnLeaf({
  t,
  width,
  page,
  hingeLeft = 0,
}: {
  t: SharedValue<number>;
  width: number;
  page: ReactNode;
  hingeLeft?: number;
}) {
  const leaf = useAnimatedStyle(() => ({
    transform: [{ perspective: 1200 }, { rotateY: `${interpolate(t.value, [0, 1], [0, -90])}deg` }],
    // Fades over the last sliver of the arc so an edge-on sheet does not pop out of existence.
    opacity: interpolate(t.value, [0, 0.82, 1], [1, 1, 0]),
  }));
  const shade = useAnimatedStyle(() => ({
    opacity: interpolate(t.value, [0, 1], [0, SHADE], 'clamp'),
  }));

  return (
    <Animated.View
      pointerEvents="none"
      style={[styles.leaf, { left: hingeLeft, width, transformOrigin: 'left center' }, leaf]}>
      <View>
        {page}
        <Animated.View style={[StyleSheet.absoluteFill, styles.shade, shade]} pointerEvents="none" />
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  // Stretched to the stage height but CENTRED like the static pages beside it: without this the
  // turning page rides high and jumps into line the moment it lands.
  leaf: { position: 'absolute', top: 0, bottom: 0, justifyContent: 'center', zIndex: 40 },
  backFace: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    transform: [{ rotateY: '180deg' }],
  },
  shade: { backgroundColor: '#000' },
});
