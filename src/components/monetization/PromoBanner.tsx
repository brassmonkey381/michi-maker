/**
 * The limited-time promotion's running banner (michi's copy of tcgscan-app's PromoBanner).
 *
 * A solid accent bar with the offer scrolling horizontally across it. Two details carry it:
 *
 *   · the text is rendered TWICE, back to back, and the animation translates by exactly one
 *     MEASURED copy's width before looping. That's what makes the scroll seamless rather than
 *     snapping — at the instant copy A leaves, copy B is precisely where A began. It waits for
 *     the measurement instead of guessing, because a guessed width shows as a visible jump.
 *   · each segment carries enough copies to span the whole band, derived from the measured width.
 *     Three copies span a phone and nothing like a desktop, where translating by one segment
 *     would walk a gap into view before the seam copy arrived.
 *
 * REDUCED MOTION is honoured: an indefinitely scrolling marquee is motion the user can't stop,
 * sitting next to pricing they need to read. Under reduce-motion the same bar renders static — the
 * offer is in the text, not the movement, so nothing is lost.
 *
 * michi is web-only, so unlike tcgscan-app's copy this needs no App Store purchase-UI gating.
 */
import { useEffect, useMemo, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, StyleSheet, Text, View } from 'react-native';

import { FontSize, Palette, Radius, Spacing, Weight } from '@/constants/theme';
import { PROMO_LABEL } from '@/data/promo';

/**
 * How long one copy of the text takes to travel its own width.
 *
 * 140s — a tenth of the original pace (owner call 2026-07-29). At 14s the offer read as a ticker
 * you had to catch; this is a slow drift you notice without being pulled away from the prices it
 * sits above. The band is decoration around numbers the user is trying to compare, so barely
 * moving is the right amount of moving.
 */
const SCROLL_MS = 140000;
/** Height of the band. The type is sized to fill it, so these move together. */
const BAND_H = 48;
/**
 * A deliberately LOW estimate of one label's rendered width, used to decide how many copies fill a
 * segment. Underestimating costs a few extra off-screen copies; overestimating leaves a visible
 * gap in the loop on a wide screen, so the error is pushed to the harmless side on purpose.
 */
const MIN_LABEL_W = 220;

export function PromoBanner() {
  const [segment, setSegment] = useState(0);
  /** Measured band width — decides how many label copies a segment needs. */
  const [width, setWidth] = useState(0);
  const [reduceMotion, setReduceMotion] = useState(false);
  // useMemo rather than useRef().current: an Animated.Value is a stable non-render value, and
  // reading a ref during render is the pattern the React compiler rules forbid.
  const tx = useMemo(() => new Animated.Value(0), []);

  useEffect(() => {
    let active = true;
    AccessibilityInfo.isReduceMotionEnabled()
      .then((on) => active && setReduceMotion(on))
      .catch(() => {});
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', (on) =>
      active ? setReduceMotion(on) : undefined,
    );
    return () => {
      active = false;
      sub?.remove?.();
    };
  }, []);

  useEffect(() => {
    if (!segment || reduceMotion) return;
    tx.setValue(0);
    const loop = Animated.loop(
      Animated.timing(tx, {
        toValue: -segment,
        duration: SCROLL_MS,
        easing: Easing.linear,
        useNativeDriver: true,
      }),
    );
    loop.start();
    return () => loop.stop();
  }, [segment, reduceMotion, tx]);

  const copies = Math.max(3, Math.ceil(width / MIN_LABEL_W) + 1);

  // One accessible announcement, not one per visual copy — the duplicate exists purely for the
  // seam and would otherwise be read out twice.
  return (
    <View
      style={styles.clip}
      onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
      accessibilityRole="text"
      accessibilityLabel={PROMO_LABEL}>
      {width > 0 ? (
        <Animated.View
          style={[styles.track, reduceMotion ? null : { transform: [{ translateX: tx }] }]}
          importantForAccessibility="no-hide-descendants">
          <View onLayout={(e) => setSegment(e.nativeEvent.layout.width)} style={styles.segment}>
            <Segment copies={copies} />
          </View>
          {reduceMotion ? null : (
            <View style={styles.segment}>
              <Segment copies={copies} />
            </View>
          )}
        </Animated.View>
      ) : null}
    </View>
  );
}

/** One segment of the marquee: enough copies of the offer to span the whole band. */
function Segment({ copies }: { copies: number }) {
  return (
    <>
      {Array.from({ length: copies }, (_, i) => (
        <Text key={i} style={styles.text} numberOfLines={1}>
          {PROMO_LABEL} <Text style={styles.spark}>✦</Text>{' '}
        </Text>
      ))}
    </>
  );
}

const styles = StyleSheet.create({
  clip: {
    height: BAND_H,
    overflow: 'hidden',
    marginVertical: Spacing.three,
    borderRadius: Radius.sm,
    backgroundColor: Palette.accent,
    justifyContent: 'center',
  },
  track: { flexDirection: 'row' },
  segment: { flexDirection: 'row' },
  // Sized to FILL the band rather than sit inside it, so the type reads as the banner instead of
  // as a caption floating in a coloured bar.
  text: {
    fontSize: 26,
    lineHeight: BAND_H,
    color: Palette.accentText,
    fontWeight: Weight.bold,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    paddingHorizontal: Spacing.two,
  },
  spark: { color: Palette.accentText, opacity: 0.7, fontSize: FontSize.sm },
});
