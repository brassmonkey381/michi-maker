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
import { Modal, Pressable, StyleSheet, Text, View, useWindowDimensions, type ViewStyle } from 'react-native';

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
/**
 * WHAT THE CARD SAYS WHEN NOTHING HAS BEEN WRITTEN. A hover that opened onto an empty card would
 * read as broken; a hover that says "nothing here yet" reads as an invitation. Shared, so the
 * binder's title and a page's title make the same offer in the same words.
 */
export const BINDER_DESCRIPTION_PLACEHOLDER = 'No description yet. In edit mode, tap the title to write one.';
export const PAGE_DESCRIPTION_PLACEHOLDER = 'Nothing written about this page yet. In edit mode, tap its title to add a note.';

export function AboutHoverCard({
  kicker,
  text,
  bullets,
  note,
  style,
}: {
  kicker: string;
  text: string;
  /** Things you could actually do, listed under the sentence. */
  bullets?: string[];
  /** The trap worth naming, set apart from the rest. */
  note?: string;
  /** Where it sits relative to whatever revealed it, in the DEFAULT direction: below and to the right. */
  style?: ViewStyle;
}) {
  /**
   * OPENS TOWARD THE MIDDLE OF THE SCREEN. The caller places the card below and to the right of
   * what revealed it, which is right for something in the top-left quadrant and wrong for the
   * other three: a card opened from the bottom of the window went up off the top of it, and one
   * opened near the right edge ran off the side. So the card measures where it first landed —
   * that first layout is the anchor's own position — and flips: above the anchor when the anchor
   * is in the lower half of the window, leftward when it is in the right half. Decided once per
   * reveal, from that first measurement, so the flip cannot feed back into itself; invisible for
   * the single frame before it is decided, so it never appears in the wrong place first.
   */
  const { width: winW, height: winH } = useWindowDimensions();
  const [place, setPlace] = useState<{ above: boolean; toLeft: boolean } | null>(null);
  const ref = useRef<View>(null);
  const onLayout = () => {
    if (place) return;
    ref.current?.measureInWindow((x, y, w) => {
      setPlace((cur) => cur ?? { above: y > winH / 2, toLeft: x + w / 2 > winW / 2 });
    });
  };
  // A plain View carries the ref and the placement (ThemedView forwards no ref); the themed box
  // inside carries the look.
  return (
    <View
      ref={ref}
      onLayout={onLayout}
      pointerEvents="none"
      style={[
        styles.hoverSlot,
        style,
        place?.above ? { top: undefined, bottom: '100%' } : null,
        place?.toLeft ? { left: undefined, right: 0 } : null,
        { opacity: place ? 1 : 0 },
      ]}>
    <ThemedView type="backgroundElement" pointerEvents="none" style={styles.hover}>
      <AboutBody kicker={kicker} text={text} />
      {bullets?.length ? (
        <View style={styles.bullets}>
          {bullets.map((b) => (
            <View key={b} style={styles.bulletRow}>
              <ThemedText style={styles.bulletDot}>&#183;</ThemedText>
              <ThemedText style={styles.bulletText}>{b}</ThemedText>
            </View>
          ))}
        </View>
      ) : null}
      {note ? <ThemedText style={styles.hoverNote}>Not: {note}</ThemedText> : null}
    </ThemedView>
    </View>
  );
}

/**
 * INSTANT, BOTH WAYS. This is a desktop-first app and hover is a primary interaction here, not a
 * garnish: a reveal that makes you hold still for a beat first reads as lag, and the beat is spent
 * on every single look to save a few frames of paint on the ones you did not mean. It leaves the
 * moment the pointer does, for the same reason — a tooltip that lingers is in the way.
 *
 * `delayMs` stays on the signature for a caller that genuinely wants a wait; nothing does today.
 */
export function useHoverReveal(enabled: boolean, delayMs = 0) {
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
    // No timer at all at zero: a setTimeout(0) still costs a task and paints a frame late.
    if (delayMs <= 0) {
      setShown(true);
      return;
    }
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
  // The slot the card floats in: where it is. The card itself: what it looks like.
  hoverSlot: {
    position: 'absolute',
    width: 320,
    maxWidth: '100%',
    // Above whatever follows it in the tree — a header's card would otherwise paint under the
    // binder below it, which is exactly where it needs to be seen.
    zIndex: 40,
  },
  hover: {
    borderRadius: Radius.panel,
    borderWidth: 1,
    borderColor: Palette.hairlineStrong,
    paddingHorizontal: Spacing.three,
    paddingTop: Spacing.two,
    paddingBottom: Spacing.three,
    ...Shadows.page,
  },
  closeBtn: { position: 'absolute', top: Spacing.three, right: Spacing.four, zIndex: 1 },
  bullets: { marginTop: Spacing.two, gap: 3 },
  bulletRow: { flexDirection: 'row', gap: 6 },
  bulletDot: { fontSize: FontSize.label, lineHeight: 19, color: Palette.muted },
  bulletText: { flex: 1, fontSize: FontSize.label, lineHeight: 19, color: Palette.ink2 },
  hoverNote: {
    marginTop: Spacing.two,
    fontSize: FontSize.label,
    lineHeight: 19,
    color: Palette.muted,
  },
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
