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
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useEffect, useSyncExternalStore } from 'react';

import { FontSize, Palette, Radius, Spacing, Weight } from '@/constants/theme';
import { cancelEyedropper, eyedropperArmed, eyedropperVersion, subscribeEyedropper } from '@/lib/eyedropper';

/**
 * The pointer while the dropper is armed: a dropper glyph, hotspot at its tip, falling back to a
 * crosshair anywhere the image cannot load. Drawn white-under-black so it stays visible over a
 * dark binder cloth and a white sheet alike.
 */
const CURSOR_SVG = encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24">' +
    '<g fill="none" stroke="#fff" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round">' +
    '<path d="M3 21l1-4 9-9 3 3-9 9z"/><path d="M14 6l4-4 4 4-4 4z"/></g>' +
    '<g fill="none" stroke="#111" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">' +
    '<path d="M3 21l1-4 9-9 3 3-9 9z"/><path d="M14 6l4-4 4 4-4 4z"/></g></svg>',
);
const CURSOR_RULE = `*{cursor:url("data:image/svg+xml,${CURSOR_SVG}") 3 21,crosshair!important}`;
const STYLE_ID = 'michi-eyedropper-cursor';

/**
 * WHY A STYLESHEET AND NOT `body.style.cursor`: react-native-web puts `cursor: pointer` on every
 * Pressable, so a body-level cursor loses on exactly the things worth hovering — the cards. One
 * `*{...!important}` rule, added while armed and removed when it is put away.
 */
function useArmedCursor(armed: boolean): void {
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof document === 'undefined' || !armed) return;
    let style = document.getElementById(STYLE_ID) as HTMLStyleElement | null;
    if (!style) {
      style = document.createElement('style');
      style.id = STYLE_ID;
      style.textContent = CURSOR_RULE;
      document.head.appendChild(style);
    }
    return () => style?.remove();
  }, [armed]);
}

export function EyedropperBanner() {
  useSyncExternalStore(subscribeEyedropper, eyedropperVersion, eyedropperVersion);
  const armed = eyedropperArmed();
  useArmedCursor(armed);
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
