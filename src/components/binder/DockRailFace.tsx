/**
 * WHAT A COLLAPSED DOCK LOOKS LIKE, for both of them.
 *
 * A collapsed dock used to be a 34px strip with a small grey chevron at the top and its name set
 * one letter per line underneath. It was easy to miss and easier to misread: people did not know
 * the panels were there, so they never found the card browser or the art tray at all, and the
 * strip did not look like something you could press (owner decision 2026-09-09, from watching
 * people open a new binder and leave).
 *
 * So the rail says all three things a reader needs, in the order they need them:
 *   - a chevron in a filled disc, which is the only shape on this edge that reads as a button;
 *   - the name in bold, centred down the middle of the strip, one letter per line because the
 *     rail is too narrow for a word laid flat and rotated text is harder to read than this;
 *   - a grip of three dots under it, the same mark the expanded dock's resize handle wears, so
 *     the two read as the same object in its two states.
 *
 * The disc breathes, once every few seconds, until the reader presses it. That is deliberately
 * the only animation: a rail that pulses forever becomes furniture, and one that never moves is
 * what we had. `prefers-reduced-motion` gets the still version, as does every rail after the
 * first time someone opens a dock in this session.
 */
import { useEffect, useMemo, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, StyleSheet, Text, View } from 'react-native';

import { FontSize, Palette, Weight } from '@/constants/theme';

/**
 * Set once anyone expands a dock, for the life of the page: after that the reader knows the rails
 * are pressable and the nudge is just noise. Module scope on purpose — it is a fact about the
 * person, not about either dock, so opening the cards dock also settles the art rail.
 */
let dockOpenedOnce = false;
export function markDockOpened(): void {
  dockOpenedOnce = true;
}

export function DockRailFace({ label, chevron }: { label: string; chevron: string }) {
  const [reduceMotion, setReduceMotion] = useState(false);
  // useMemo, not a ref read during render: an Animated.Value is stable and the compiler rules
  // forbid the ref pattern (same reason CheatsheetButton does it this way).
  const pulse = useMemo(() => new Animated.Value(0), []);
  const still = reduceMotion || dockOpenedOnce;
  useEffect(() => {
    let active = true;
    AccessibilityInfo.isReduceMotionEnabled()
      .then((on) => active && setReduceMotion(on))
      .catch(() => {});
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', (on) => (active ? setReduceMotion(on) : undefined));
    return () => {
      active = false;
      sub?.remove?.();
    };
  }, []);
  useEffect(() => {
    if (still) return;
    // A long flat wait between short beats, so it draws the eye without ever being busy.
    const beat = Animated.sequence([
      Animated.timing(pulse, { toValue: 1, duration: 620, easing: Easing.out(Easing.quad), useNativeDriver: true }),
      Animated.timing(pulse, { toValue: 0, duration: 620, easing: Easing.in(Easing.quad), useNativeDriver: true }),
      Animated.delay(2600),
    ]);
    const loop = Animated.loop(beat);
    loop.start();
    return () => loop.stop();
  }, [pulse, still]);

  return (
    <View style={styles.wrap} pointerEvents="none">
      <Animated.View
        style={[
          styles.disc,
          still ? null : { transform: [{ scale: pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.16] }) }] },
        ]}>
        {/* DOUBLE, and large. One thin chevron is a decoration; two heavy ones are an instruction. */}
        <Text style={styles.chevron}>{chevron === '◂' ? '‹‹' : '››'}</Text>
      </Animated.View>
      <Text style={styles.label}>{label.toUpperCase().split('').join('\n')}</Text>
      {/* The grip the resize handle wears, in the rail's own size: this edge is a thing you take
          hold of. Two columns of dots rather than one, because a single column at this width read
          as a row of full stops under the word. */}
      <View style={styles.grip}>
        {Array.from({ length: 5 }, (_, i) => (
          <View key={i} style={styles.gripRow}>
            <View style={styles.dot} />
            <View style={styles.dot} />
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 14, paddingVertical: 16 },
  disc: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: Palette.accent,
    alignItems: 'center',
    justifyContent: 'center',
    // Lifted off the rail, so it reads as a button sitting on the edge rather than a painted mark.
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
  chevron: {
    fontSize: FontSize.control,
    fontWeight: Weight.bold,
    color: Palette.accentText,
    lineHeight: 20,
    letterSpacing: -1,
  },
  label: {
    fontSize: FontSize.label,
    fontWeight: Weight.bold,
    color: Palette.ink,
    textAlign: 'center',
    lineHeight: 15,
    letterSpacing: 0.6,
  },
  grip: { gap: 4, alignItems: 'center' },
  gripRow: { flexDirection: 'row', gap: 4 },
  dot: { width: 3, height: 3, borderRadius: 1.5, backgroundColor: Palette.muted2 },
});
