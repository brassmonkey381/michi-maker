/**
 * WHAT THIS BINDER IS, or what this page is — the description, on its own, when you ask for it.
 *
 * A description used to sit under the binder title as a permanent line of centred grey text. That
 * is a poor deal on a screen whose whole job is showing a binder: it costs every visit vertical
 * space to answer a question most visits are not asking, and it reads as caption furniture rather
 * than as something a person wrote. So it moved behind the title, which was already the obvious
 * thing to tap and already opened the same words in edit mode.
 *
 * A CARD, NOT A FORM. There is nothing to do here, so there is nothing that looks like doing:
 * no fields, no Done, no heading that repeats the word "details". A kicker naming what you tapped,
 * a hairline, and the text set in the binder face at a reading measure. The ✕ is the only control,
 * because a popup with no visible way out is a trap on touch however obvious the backdrop is.
 *
 * NARROWER THAN THE DIALOGS IT SITS AMONG (520 against the tools card's 760). Those hold fields in
 * columns and want the width; a paragraph does not — past about 70 characters a line stops being
 * easy to come back from, and this is the one dialog in the editor that is purely prose.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View, type ViewStyle } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Fonts, FontSize, Palette, Radius, Shadows, Spacing, Weight } from '@/constants/theme';
import { sheet } from '@/constants/ui';

/**
 * HOVER SHOWS THE SAME THING THE TAP DOES, at no cost and with no commitment — a pointer is a
 * question, and answering it should not take over the screen. So this is deliberately NOT the
 * modal: no backdrop, no dimming, no focus to get back, and `pointerEvents="none"` so it can
 * never eat the click that was on its way to the title underneath it.
 *
 * Positioned by its parent, which is the only thing that knows where its title sits. Give the
 * parent `alignItems: 'center'` and this centres itself under it (Yoga positions an absolute child
 * with no left/right by the parent's alignment).
 *
 * Web only in practice: `onHoverIn` never fires on a touch device, which is correct rather than a
 * gap — there is no hover to have, and the tap already opens the full card.
 */
export function AboutHoverCard({
  kicker,
  text,
  style,
}: {
  kicker: string;
  text: string;
  /** Where it sits relative to the title. The caller owns the offset; this owns the look. */
  style?: ViewStyle;
}) {
  return (
    <ThemedView type="backgroundElement" pointerEvents="none" style={[styles.hover, style]}>
      <AboutBody kicker={kicker} text={text} />
    </ThemedView>
  );
}

/**
 * A pointer passing OVER a title on its way somewhere else is not asking a question, so the card
 * waits before answering. It leaves the moment the pointer does: a tooltip that lingers is in the
 * way, and the delay that made it feel considered on the way in feels broken on the way out.
 */
export function useHoverReveal(enabled: boolean, delayMs = 400) {
  const [shown, setShown] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const clear = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  }, []);
  // A card whose reason to exist goes away mid-hover — edit mode, the tap-opened dialog, a
  // description deleted — must not stay on screen, and nothing else will fire a hover-out for it.
  // Reset DURING RENDER rather than in an effect: that is React's own answer for derived state,
  // and an effect here is a cascading render (which the lint rightly refuses). Without it the card
  // comes back on its own the moment the reason returns — close the tap-opened card and the hover
  // one reappears under a pointer that has long since moved.
  if (!enabled && shown) setShown(false);
  useEffect(() => clear, [clear]);
  const onHoverIn = useCallback(() => {
    if (!enabled) return;
    clear();
    timer.current = setTimeout(() => setShown(true), delayMs);
  }, [enabled, clear, delayMs]);
  const onHoverOut = useCallback(() => {
    clear();
    setShown(false);
  }, [clear]);
  return { shown: shown && enabled, onHoverIn, onHoverOut };
}

/** The kicker, the rule and the words — identical in the tap-opened card and the hover one. */
function AboutBody({ kicker, text }: { kicker: string; text: string }) {
  return (
    <>
      <ThemedText style={styles.kicker} numberOfLines={1}>
        {kicker}
      </ThemedText>
      <View style={styles.rule} />
      <ThemedText style={styles.body}>{text}</ThemedText>
    </>
  );
}

export function AboutPopup({
  /** What was tapped, named: the binder's title, or "Page 3". */
  kicker,
  /** The description itself. The caller decides there is one; this draws it. */
  text,
  onClose,
}: {
  kicker: string;
  text: string;
  onClose: () => void;
}) {
  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <View style={sheet.dialogBackdrop}>
        {/* Behind the card rather than around it, so the text stays selectable on web. */}
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Close" />
        <ThemedView type="backgroundElement" style={styles.card}>
          {/* The ✕ rides above the kicker's row rather than in the body, so the tap-opened card
              and the hover one share the same three elements in the same places. */}
          <Pressable
            onPress={onClose}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel="Close"
            style={styles.closeBtn}>
            <Text style={styles.close}>✕</Text>
          </Pressable>
          <AboutBody kicker={kicker} text={text} />
        </ThemedView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  card: {
    width: '100%',
    maxWidth: 520,
    alignSelf: 'center',
    borderRadius: Radius.panel,
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.three,
    paddingBottom: Spacing.four,
  },
  // Narrower than the tap-opened card and lifted off the page: it is floating over the binder
  // rather than sitting in front of it, and nothing behind it has been dimmed to say so.
  hover: {
    position: 'absolute',
    width: 320,
    maxWidth: '100%',
    borderRadius: Radius.panel,
    borderWidth: 1,
    borderColor: Palette.hairlineStrong,
    paddingHorizontal: Spacing.three,
    paddingTop: Spacing.two,
    paddingBottom: Spacing.three,
    // Above whatever follows it in the tree — a header's card would otherwise paint under the
    // binder below it, which is exactly where it needs to be seen.
    zIndex: 40,
    ...Shadows.page,
  },
  closeBtn: { position: 'absolute', top: Spacing.three, right: Spacing.four, zIndex: 1 },
  // Small and letter-spaced: it labels the text below rather than competing with it.
  kicker: {
    flexShrink: 1,
    // Room for the ✕ that floats over this row in the tap-opened card.
    paddingRight: Spacing.four,
    fontSize: FontSize.sm,
    lineHeight: 16,
    letterSpacing: 1.1,
    textTransform: 'uppercase',
    color: Palette.muted,
    fontWeight: Weight.semibold,
  },
  close: { fontSize: FontSize.md, lineHeight: 20, color: Palette.muted },
  rule: { height: 1, backgroundColor: Palette.hairlineStrong, marginTop: Spacing.two, marginBottom: Spacing.three },
  // The binder face, at a size and leading meant for a paragraph rather than a caption.
  body: { fontFamily: Fonts?.brand, fontSize: FontSize.md, lineHeight: 26 },
});
