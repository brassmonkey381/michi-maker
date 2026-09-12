/**
 * THE HOVER TIP FOR A SYMBOL BUTTON.
 *
 * WHY IT HAD TO BE BUILT. The editor's header tools already carried their words: every IconBtn
 * spread `title={label}` onto its Pressable, which is the plain HTML tooltip and would have been
 * exactly right. React Native Web does not forward it. `title` is not in its forwarded-props
 * allowlist (0.21.2, `modules/forwardedProps`), so the attribute never reached the DOM and the
 * tooltip never existed — the words were in the source, in the accessibility tree, and nowhere a
 * sighted mouse user could find them (owner, 2026-09-12).
 *
 * SO IT IS OURS, and being ours it works on a tool group no browser tooltip could serve well
 * anyway: it appears instantly rather than after the browser's second-or-so delay, which is the
 * difference between a tip that answers a scan across six glyphs and one that punishes it.
 *
 * A TIP, NOT A CARD. AboutHoverCard is the other hover surface in this screen and it is prose: a
 * kicker, a rule, a paragraph, at a reading measure. This is one line naming one control, so it is
 * small, dark and quiet, and it borrows nothing from that card but the idea of getting out of the
 * way. `pointerEvents="none"` throughout, so it can never eat the click heading for the button
 * underneath it.
 *
 * TWO BOXES, NOT ONE, and this is the part that is easy to get wrong. An absolutely positioned box
 * shrink-wraps its content only up to the width of its containing block, and the containing block
 * here is a 30px icon button. A single-box tip therefore came out 30-odd pixels wide with its text
 * wrapped into a column and clipped by `numberOfLines` — measured in the browser, not guessed. So
 * the absolute box is a WIDE, TRANSPARENT SLOT centred on the button, and the visible bubble is an
 * ordinary flex child inside it, which sizes to its text and centres.
 *
 * STAYS ON SCREEN. Centred under its button, then measured and SHIFTED far enough to be wholly
 * inside the window — the rightmost tool in a right-aligned header is the normal case here, not
 * the edge case. Same approach as AboutHoverCard, and decided once per reveal so the shift cannot
 * feed back into itself.
 *
 * Web only in practice: `onHoverIn` never fires on a touch device. That is correct rather than a
 * gap. There is no hover to have, and the buttons carry `accessibilityLabel` for the screen reader.
 */
import { useRef, useState, type ReactNode } from 'react';
import { StyleSheet, Text, View, useWindowDimensions, type ViewStyle } from 'react-native';

import { useHoverReveal } from '@/components/binder/AboutPopup';
import { FontSize, Palette, Radius, Shadows, Weight } from '@/constants/theme';

/**
 * Where the tip hangs. `below` is the default and right for anything in a header; `above` is for a
 * control near the bottom of the window, where below would be off the screen before the clamp
 * could do anything about it.
 */
export type TipSide = 'below' | 'above';

export function ToolTip({ text, side = 'below' }: { text: string; side?: TipSide }) {
  const { width: winW, height: winH } = useWindowDimensions();
  const [shift, setShift] = useState<{ x: number; y: number } | null>(null);
  const ref = useRef<View>(null);
  const onLayout = () => {
    if (shift) return;
    ref.current?.measureInWindow((x, y, w, h) => {
      const margin = 6;
      let dx = 0;
      let dy = 0;
      if (x + w > winW - margin) dx = winW - margin - (x + w);
      if (x + dx < margin) dx = margin - x;
      if (y + h > winH - margin) dy = winH - margin - (y + h);
      if (y + dy < margin) dy = margin - y;
      setShift((cur) => cur ?? { x: Math.round(dx), y: Math.round(dy) });
    });
  };
  return (
    <View pointerEvents="none" style={[styles.slot, side === 'above' ? styles.above : styles.below]}>
      <View
        ref={ref}
        onLayout={onLayout}
        style={[
          styles.bubble,
          // Shown at once; the shift, when there is one, lands a frame later. A tip that waited to
          // be sure would be a tip that stayed invisible whenever measuring failed.
          shift ? { transform: [{ translateX: shift.x }, { translateY: shift.y }] } : null,
        ]}>
        <Text style={styles.text} numberOfLines={2}>
          {text}
        </Text>
      </View>
    </View>
  );
}

/**
 * ANY CONTROL, TIPPED. Wrap a button in this and it gains a hover tip without its owner having to
 * find room for another hook at the top of a 3,000-line component.
 *
 * The hover is read from the WRAPPER's pointer events rather than the child's `onHoverIn`, so this
 * works on a control that is disabled (a Pressable stops reporting hover then, and "why can I not
 * press this" is exactly when the words are wanted) and on one that is not a Pressable at all.
 *
 * It borrows `useHoverReveal`, so a tip is instant both ways and closes with every other hover
 * surface while a page is turning (see hoverGate).
 */
export function Tipped({
  text,
  side,
  style,
  children,
}: {
  text: string;
  side?: TipSide;
  /** The wrapper must not change the control's own size: use this only for alignment. */
  style?: ViewStyle;
  children: ReactNode;
}) {
  const hover = useHoverReveal(true);
  return (
    <View
      style={[styles.anchor, style]}
      onPointerEnter={hover.onHoverIn}
      onPointerLeave={hover.onHoverOut}>
      {children}
      {hover.shown ? <ToolTip text={text} side={side} /> : null}
    </View>
  );
}

/** The transparent slot's width. Twice the widest bubble, so a centred bubble has room either side. */
const SLOT_W = 420;

const styles = StyleSheet.create({
  /** What the tip centres on. No padding and no flex of its own: it must not resize the control. */
  anchor: { position: 'relative', alignItems: 'center' },
  slot: {
    position: 'absolute',
    // Above its siblings in the row, and above whatever the header sits over. The tip hangs OUTSIDE
    // the tool group's box, so without this a later button in the row paints over it.
    zIndex: 80,
    // Centred on the control: half the slot to the left of the control's own centre. `left: '50%'`
    // is relative to the anchor, the negative margin is half of SLOT_W, and the two together are
    // what a plain `alignItems` could not do, because the anchor is narrower than the bubble.
    width: SLOT_W,
    left: '50%',
    marginLeft: -SLOT_W / 2,
    alignItems: 'center',
  },
  below: { top: '100%', marginTop: 6 },
  above: { bottom: '100%', marginBottom: 6 },
  bubble: {
    maxWidth: 210,
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: Radius.control,
    backgroundColor: Palette.toast,
    ...Shadows.page,
  },
  // Small and set tight: this is a label, not a sentence, and it is read at a glance or not at all.
  text: { fontSize: FontSize.sm, fontWeight: Weight.medium, color: Palette.onDark, lineHeight: 15 },
});
