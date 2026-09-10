/**
 * THE WALKTHROUGH'S CALLOUT: a card that says where to look, and an arrow that points there.
 *
 * This was a single line along the top of the card browser, and it was the easiest thing on the
 * screen to skip: exactly the failure it existed to fix (owner, 2026-09-10). It is a proper card
 * now — a numbered step, a heading, a sentence, and a large arrow on the edge facing the control
 * being described. The arrow is the part that does the work. Someone who has stalled needs to be
 * shown where to press, not told what pressing does.
 *
 * IT STILL COVERS NOTHING. Placed in the flow above the control it points at, never over it, so
 * the thing the reader is being sent to is never behind the thing telling them to go there. In the
 * card browser that means it sits in `CardPicker`'s body, directly above the search box, and
 * reaches the narrow bottom-sheet layout from the same insertion.
 *
 * The ✕ is a real target with a label, because one press ending this for good is the promise that
 * makes an in-your-face callout acceptable at all.
 */
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { WALKTHROUGH_TOTAL, type WalkthroughCopy } from '@/data/firstPocketWalkthrough';
import { FontSize, Palette, Radius, Shadows, Spacing, Weight } from '@/constants/theme';

export function WalkthroughBanner({
  copy,
  onDismiss,
  onShown,
}: {
  copy: WalkthroughCopy;
  onDismiss: () => void;
  /** Called once, when this has laid out with a real height. */
  onShown?: () => void;
}) {
  const pointsDown = copy.arrow === 'down';
  return (
    <View
      style={styles.wrap}
      testID="walkthrough-banner"
      accessibilityRole="alert"
      onLayout={(e) => {
        if (e.nativeEvent.layout.height > 0) onShown?.();
      }}>
      {/* Above the card when it points up, so card and arrow read as one object either way. */}
      {pointsDown ? null : <Text style={[styles.arrow, styles.arrowUp]}>▲</Text>}
      <View style={styles.card}>
        <View style={styles.head}>
          <View style={styles.step}>
            <Text style={styles.stepText}>
              {copy.index} of {WALKTHROUGH_TOTAL}
            </Text>
          </View>
          <Text style={styles.title}>{copy.title}</Text>
          <Pressable
            onPress={onDismiss}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel="Skip this walkthrough"
            testID="walkthrough-dismiss"
            style={({ pressed }) => [styles.close, pressed && styles.pressed]}>
            <Text style={styles.closeGlyph}>✕</Text>
          </Pressable>
        </View>
        <Text style={styles.body}>{copy.body}</Text>
      </View>
      {pointsDown ? <Text style={[styles.arrow, styles.arrowDown]}>▼</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', marginBottom: Spacing.two },
  card: {
    alignSelf: 'stretch',
    gap: Spacing.two,
    padding: Spacing.three,
    borderRadius: Radius.panel,
    borderWidth: 2,
    borderColor: Palette.accent,
    backgroundColor: Palette.accentSoft,
    ...Shadows.page,
  },
  head: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  step: {
    paddingHorizontal: Spacing.two,
    paddingVertical: 2,
    borderRadius: Radius.pill,
    backgroundColor: Palette.accent,
  },
  stepText: { fontSize: FontSize.sm, fontWeight: Weight.bold, color: Palette.accentText, letterSpacing: 0.4 },
  title: { flex: 1, minWidth: 0, fontSize: FontSize.control, fontWeight: Weight.bold, color: Palette.ink },
  close: { paddingHorizontal: 2 },
  closeGlyph: { fontSize: FontSize.md, color: Palette.ink2, lineHeight: 18 },
  body: { fontSize: FontSize.body, lineHeight: 20, color: Palette.ink2 },
  /** Large on purpose: at a glance the arrow is the whole message. */
  arrow: { fontSize: 26, color: Palette.accent, lineHeight: 26 },
  arrowDown: { marginTop: -2 },
  arrowUp: { marginBottom: -2 },
  pressed: { opacity: 0.6 },
});
