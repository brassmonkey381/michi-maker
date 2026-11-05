/**
 * A RING ROUND THE POCKET TO START WITH, and nothing else.
 *
 * The wordless half of the first-pocket walkthrough: it says WHICH pocket without saying anything,
 * which is the right amount for an action people already perform correctly (see
 * src/data/firstPocketWalkthrough.ts for why the words live in the card browser instead).
 *
 * A SIBLING, never the pocket's own border. Drawing it on the slot would mean teaching BinderGrid
 * about a walkthrough, and every pocket in every binder would carry a prop it uses once. Absolute
 * and `pointerEvents="none"`, so the pocket underneath still takes the tap that ends this.
 *
 * zIndex 65: above the grid's own stacking, below the docks at 70. It must never sit over the card
 * browser, which is where the reader is going next.
 *
 * NOTHING ANIMATES. The collapsed dock rail already owns the one moving thing on this screen, and
 * two nudges arguing is worse than either alone for the person who has stalled.
 */
import { StyleSheet, View, useWindowDimensions } from 'react-native';

import { Palette, Radii } from '@/constants/theme';

/** The previous rect when the new one matches it (within a pixel), so a repeated measurement is a no-op for React. */
export function sameRect(prev: PocketRect | null, next: PocketRect | null): PocketRect | null {
  if (!prev || !next) return next;
  const near = (a: number, b: number) => Math.abs(a - b) < 1;
  return near(prev.x, next.x) && near(prev.y, next.y) && near(prev.width, next.width) && near(prev.height, next.height) ? prev : next;
}

export interface PocketRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export function PocketRing({ rect, dim = false }: { rect: PocketRect | null; dim?: boolean }) {
  const { width: winW, height: winH } = useWindowDimensions();
  // An unmeasured grid gives null, and a ring at a guessed position is worse than no ring: it
  // would point confidently at the wrong pocket. The banner is the step that carries the meaning.
  if (!rect) return null;
  // THE REST RECEDES (owner, 2026-11-05: "blacking out / bluring the other parts of the screen to
  // focus attention on the target"). Four panes around the ring, so the target keeps its own
  // colours and everything else sits behind a light veil. Below the docks (70) and the callout
  // (66), and pointerEvents none throughout: nothing here takes a tap.
  const pad = 6;
  const top = Math.max(0, rect.y - pad);
  const left = Math.max(0, rect.x - pad);
  const right = Math.min(winW, rect.x + rect.width + pad);
  const bottom = Math.min(winH, rect.y + rect.height + pad);
  return (
    <>
      {dim ? (
        <View pointerEvents="none" style={StyleSheet.absoluteFill} testID="walkthrough-dim">
          <View style={[styles.veil, { left: 0, top: 0, width: winW, height: top }]} />
          <View style={[styles.veil, { left: 0, top: bottom, width: winW, height: Math.max(0, winH - bottom) }]} />
          <View style={[styles.veil, { left: 0, top, width: left, height: Math.max(0, bottom - top) }]} />
          <View style={[styles.veil, { left: right, top, width: Math.max(0, winW - right), height: Math.max(0, bottom - top) }]} />
        </View>
      ) : null}
      <View
        pointerEvents="none"
        testID="walkthrough-pocket-ring"
        style={[styles.ring, { left: rect.x, top: rect.y, width: rect.width, height: rect.height }]}
      />
    </>
  );
}

const styles = StyleSheet.create({
  veil: { position: 'absolute', backgroundColor: 'rgba(20, 18, 24, 0.32)', zIndex: 64 },
  ring: {
    position: 'absolute',
    borderWidth: 2,
    borderColor: Palette.accent,
    borderRadius: Radii.slot,
    zIndex: 65,
  },
});
