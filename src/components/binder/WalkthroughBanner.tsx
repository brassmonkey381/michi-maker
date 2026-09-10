/**
 * ONE LINE, INSIDE THE PANEL IT IS ABOUT.
 *
 * The first-pocket walkthrough's only words (see src/data/firstPocketWalkthrough.ts). It is drawn
 * in the card browser's own head rather than over the binder, because the browser is where the
 * measured stall happens: people tap a pocket, the browser opens, and they do not find the ＋ on a
 * card tile. Instructions that float over the page are read as chrome and dismissed.
 *
 * NOT A DIALOG, NOT A SHEET, NOT A MODAL. Living inside `CardPicker`'s body means it can never be
 * covered by the panel it belongs to, it reaches the narrow bottom-sheet layout from the same
 * insertion, and it cannot collide with the iOS one-modal-per-view-controller rule.
 *
 * `onLayout` fires once so the hook can prove it actually painted; a future refactor that moved
 * this into a branch would otherwise fail silently.
 */
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { FontSize, Palette, Radius, Spacing, Weight } from '@/constants/theme';

export function WalkthroughBanner({
  text,
  onDismiss,
  onShown,
}: {
  text: string;
  onDismiss: () => void;
  /** Called once, when this has laid out with a real height. */
  onShown?: () => void;
}) {
  return (
    <View
      style={styles.wrap}
      testID="walkthrough-banner"
      accessibilityRole="alert"
      onLayout={(e) => {
        if (e.nativeEvent.layout.height > 0) onShown?.();
      }}>
      <Text style={styles.text}>{text}</Text>
      <Pressable
        onPress={onDismiss}
        hitSlop={10}
        accessibilityRole="button"
        accessibilityLabel="Hide this tip"
        testID="walkthrough-dismiss"
        style={({ pressed }) => [styles.close, pressed && styles.pressed]}>
        <Text style={styles.closeGlyph}>✕</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.two,
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.three,
    marginBottom: Spacing.three,
    borderRadius: Radius.control,
    borderWidth: 1,
    borderColor: Palette.accent,
    backgroundColor: Palette.accentSoft,
  },
  text: { flex: 1, minWidth: 0, fontSize: FontSize.base, lineHeight: 18, color: Palette.ink, fontWeight: Weight.semibold },
  close: { paddingHorizontal: 2 },
  closeGlyph: { fontSize: FontSize.label, color: Palette.ink2, lineHeight: 16 },
  pressed: { opacity: 0.6 },
});
