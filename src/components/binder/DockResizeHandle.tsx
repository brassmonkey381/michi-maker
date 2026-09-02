/**
 * THE EDGE OF A DOCK, DRAGGABLE.
 *
 * A dock's width used to be the layout's business alone: the page took what its height entitled it
 * to and the panel divided the rest, up to a 720px ceiling. On a 1920px desktop that ceiling is
 * where the card browser sits permanently — about 37% of the window for a three-wide card grid —
 * while the binder beside it is width-limited and leaves a third of the screen empty below itself.
 * Nobody can tell the layout that they would rather have two columns of cards and a bigger binder.
 * This is how they tell it.
 *
 * Two halves, deliberately:
 *   - The EDGE tracks the finger live, on the UI thread, by writing a shared value the dock adds to
 *     its own width. No React state, no re-render, no layout pass.
 *   - The PAGE re-lays out on release only. One drag frame would otherwise re-render the whole
 *     editor — BinderPages, spreadLayout, the docked card browser's list — and write a preference
 *     to AsyncStorage and Supabase. At sixty frames a second that is hundreds of round trips, and
 *     the page would still lag the finger, because its measured width moves in 2px steps.
 *
 * The split is only honest because the docks are absolutely positioned OVER the scroller, with the
 * scroller's padding keeping the page clear of them. During a drag the dock covers a little more or
 * a little less of that gutter; `maxWidth` already has the page's floor subtracted, so the live
 * edge can never actually reach the binder.
 *
 * SHAPE NOTE: the gesture holds no shared values of its OWN and lists every prop it captures,
 * `offset` included — the same shape SliceTray's SliceChip uses to write its drag ghost. A local
 * shared value mutated inside the memo is the thing the React Compiler refuses.
 */
import { useMemo, type ReactNode } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { runOnJS, useAnimatedStyle, useSharedValue } from 'react-native-reanimated';

import { Palette } from '@/constants/theme';

/** The visible line is 3px; the TARGET is 16px of transparent view around it. */
const HIT = 16;

/**
 * A HOOK, NOT A COMPONENT, because the live offset has to be owned by whoever renders the width.
 *
 * The obvious shape — a <DockResizeHandle offset={sv} /> whose parent owns the shared value — is
 * the one the React Compiler refuses: writing `offset.value` from inside a component that received
 * `offset` as a prop is "modifying component props", and it cannot tell that shape apart from a
 * genuine prop mutation. Owning the value where it is written costs nothing and is honest about
 * where the state lives, so the dock calls this and spreads what comes back.
 */
export function useDockResize({
  edge,
  width,
  minWidth,
  maxWidth,
  enabled,
  onCommit,
  onReset,
}: {
  /** Which border of the dock faces the page. 'left' for a dock pinned to the right edge. */
  edge: 'left' | 'right';
  /** The dock's committed width right now. */
  width: number;
  /** Clamps in px, computed by the caller from constants — never from the page's measured width. */
  minWidth: number;
  maxWidth: number;
  /** False for a caller that does not offer resizing; the hook still runs, and returns no handle. */
  enabled: boolean;
  onCommit: (nextWidth: number) => void;
  /** Double-tap: hand the width back to the layout. */
  onReset?: () => void;
}): { widthStyle: { width: number }; handle: ReactNode } {
  const offset = useSharedValue(0);

  const pan = useMemo(
    () =>
      Gesture.Pan()
        // Horizontal only. A vertical drag that starts here belongs to the panel's own scroller,
        // and a handle that swallowed it would make the card list feel stuck at its edge.
        .activeOffsetX([-4, 4])
        .failOffsetY([-12, 12])
        .onStart(() => {
          offset.value = 0;
        })
        .onUpdate((e) => {
          // Dragging LEFT widens a right-hand dock and narrows a left-hand one. Measured from the
          // committed width rather than a remembered start, so there is nothing to remember.
          const raw = width + (edge === 'left' ? -e.translationX : e.translationX);
          offset.value = Math.min(Math.max(raw, minWidth), maxWidth) - width;
        })
        .onEnd(() => {
          runOnJS(onCommit)(width + offset.value);
        })
        .onFinalize(() => {
          // Left at its dragged value the edge would jump the moment the committed width arrives
          // and adds to it. Zeroed here, so the two changes land in the same frame.
          offset.value = 0;
        }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [edge, width, minWidth, maxWidth, onCommit],
  );

  // Two taps hands the width back to the layout — 0 is already its "never dragged" sentinel.
  const reset = useMemo(
    () =>
      Gesture.Tap()
        .numberOfTaps(2)
        .onEnd((_e, ok) => {
          if (ok && onReset) runOnJS(onReset)();
        }),
    [onReset],
  );

  const gesture = useMemo(() => (onReset ? Gesture.Exclusive(pan, reset) : pan), [pan, reset, onReset]);

  // The dock's width, live. This is the whole reason the offset never touches React state.
  const widthStyle = useAnimatedStyle(() => ({ width: width + offset.value }));

  return {
    widthStyle: widthStyle as unknown as { width: number },
    handle: enabled ? (
      <GestureDetector gesture={gesture}>
        <View
          testID={`dock-resize-${edge}`}
          accessibilityRole="adjustable"
          accessibilityLabel="Drag to resize this panel"
          style={[styles.hit, edge === 'left' ? { left: -HIT / 2 } : { right: -HIT / 2 }]}>
          <View style={styles.line} />
        </View>
      </GestureDetector>
    ) : null,
  };
}

const styles = StyleSheet.create({
  hit: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: HIT,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1,
    // 'col-resize' is not in react-native's CursorValue union, which is 'auto' | 'pointer' — hence
    // the cast. On web it is the whole affordance: nothing else says this edge can be dragged.
    ...(Platform.OS === 'web' ? ({ cursor: 'col-resize' } as object) : null),
  },
  line: { width: 3, height: 44, borderRadius: 2, backgroundColor: Palette.hairlineStrong },
});
