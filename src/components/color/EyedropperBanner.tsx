/**
 * "Tap any card to take its colours" — the only thing on screen that says the next tap is not
 * going to do what it normally does.
 *
 * Self-contained on purpose: it subscribes to the eyedropper itself and renders NOTHING when the
 * dropper is away, so it can be mounted once somewhere that is always on screen without its host
 * knowing anything about colour search. That matters because the dropper outlives the sheet that
 * armed it — the whole point is to close the picker, look at the binder, and tap a pocket — and a
 * banner that lived inside the picker would vanish at exactly the moment it is needed most.
 *
 * It always offers Cancel. A mode that changes what a tap does and cannot be left is a trap.
 */
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSyncExternalStore } from 'react';

import { FontSize, Palette, Radius, Spacing, Weight } from '@/constants/theme';
import { cancelEyedropper, eyedropperArmed, subscribeEyedropper } from '@/lib/eyedropper';

export function EyedropperBanner() {
  /**
   * THE FLAG COMES OUT OF THE STORE, not out of a bare `eyedropperArmed()` call in the body.
   *
   * michi compiles with the React Compiler, which memoises a call it believes is pure — and a
   * function reading module state looks exactly like one. Read that way the flag was frozen at
   * `false` for the life of the component: no banner, no cursor, and no way to tell from the
   * outside, because the tap handlers (which read the module live, at tap time) kept working.
   */
  const armed = useSyncExternalStore(subscribeEyedropper, eyedropperArmed, eyedropperArmed);
  if (!armed) return null;
  return (
    <View style={styles.row} pointerEvents="box-none">
      <Text style={styles.label} numberOfLines={1}>
        ⌇ Tap any card to take its colours
      </Text>
      <Pressable onPress={cancelEyedropper} hitSlop={10} accessibilityRole="button" accessibilityLabel="Cancel the eyedropper">
        <Text style={styles.cancel}>Cancel</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    borderRadius: Radius.pill,
    backgroundColor: Palette.ink,
  },
  label: { flex: 1, color: Palette.surface, fontSize: FontSize.sm, fontWeight: Weight.semibold },
  cancel: { color: Palette.surface, fontSize: FontSize.sm, fontWeight: Weight.bold, textDecorationLine: 'underline' },
});
