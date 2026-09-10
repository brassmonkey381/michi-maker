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
import { StyleSheet, View } from 'react-native';

import { Palette, Radii } from '@/constants/theme';

export interface PocketRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export function PocketRing({ rect }: { rect: PocketRect | null }) {
  // An unmeasured grid gives null, and a ring at a guessed position is worse than no ring: it
  // would point confidently at the wrong pocket. The banner is the step that carries the meaning.
  if (!rect) return null;
  return (
    <View
      pointerEvents="none"
      testID="walkthrough-pocket-ring"
      style={[styles.ring, { left: rect.x, top: rect.y, width: rect.width, height: rect.height }]}
    />
  );
}

const styles = StyleSheet.create({
  ring: {
    position: 'absolute',
    borderWidth: 2,
    borderColor: Palette.accent,
    borderRadius: Radii.slot,
    zIndex: 65,
  },
});
