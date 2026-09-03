/**
 * The link out to the search cheatsheet (`/search-guide`), as it appears in the Browse header.
 *
 * WHY IT IS A BUTTON AND NOT A LINK. This was `smallBold` secondary text sitting beside a display-
 * sized "Browse all cards" — the quietest thing in the header, next to the loudest. The search
 * grammar it documents is the difference between typing a Pokémon's name and actually working the
 * catalog, and nobody finds it by reading grey text they have already scrolled past.
 *
 * THE HALO RUNS THREE TIMES, THEN STOPS. A pill that pulses forever beside a list you are trying to
 * read is a distraction with no off switch, and this is a signpost, not an alert. Three slow
 * expansions catch the arrival — which is when a first-time visitor is deciding what this page can
 * do — and then it settles into an ordinary, still, clearly-clickable button.
 *
 * It is a sibling behind the pill rather than a shadow or a border animation because those are
 * layout/paint properties: only opacity and transform run on the native driver, and a ring that
 * expands past its own pill cannot be the pill's own border.
 */
import { useEffect, useMemo, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, Pressable, StyleSheet, Text, View } from 'react-native';

import { FontSize, Palette, Radius, Spacing, Weight } from '@/constants/theme';

/** One halo: expand-and-fade, then a rest long enough that it reads as a heartbeat, not a blink. */
const PULSE_MS = 1500;
const REST_MS = 2200;
const PULSES = 3;

export function CheatsheetButton({ onPress }: { onPress: () => void }) {
  const [hovered, setHovered] = useState(false);
  const [reduceMotion, setReduceMotion] = useState(false);
  // useMemo rather than useRef().current: an Animated.Value is a stable non-render value, and
  // reading a ref during render is the pattern the React compiler rules forbid.
  const pulse = useMemo(() => new Animated.Value(0), []);

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
    if (reduceMotion) return;
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1,
          duration: PULSE_MS,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(pulse, { toValue: 0, duration: 0, useNativeDriver: true }),
        Animated.delay(REST_MS),
      ]),
      { iterations: PULSES },
    );
    anim.start();
    return () => {
      anim.stop();
      pulse.setValue(0);
    };
  }, [pulse, reduceMotion]);

  return (
    <View style={styles.wrap}>
      {/* Decoration only: it sits under the pill and must never eat the press. */}
      <Animated.View
        pointerEvents="none"
        style={[
          styles.halo,
          {
            opacity: pulse.interpolate({ inputRange: [0, 0.25, 1], outputRange: [0, 0.5, 0] }),
            transform: [
              { scale: pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.18] }) },
            ],
          },
        ]}
      />
      <Pressable
        onPress={onPress}
        onHoverIn={() => setHovered(true)}
        onHoverOut={() => setHovered(false)}
        accessibilityRole="button"
        accessibilityLabel="Open the search cheatsheet"
        style={({ pressed }) => [styles.pill, hovered && styles.pillHover, pressed && styles.pressed]}>
        <Text style={[styles.label, hovered && styles.labelHover]}>Cheatsheet ↗</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'relative' },
  // Outside the pill on every side, so the ring reads as light coming off it rather than as the
  // button itself changing size.
  halo: {
    position: 'absolute',
    top: -4,
    right: -4,
    bottom: -4,
    left: -4,
    borderRadius: Radius.pill,
    backgroundColor: Palette.accent,
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.four,
    borderRadius: Radius.pill,
    borderWidth: 1,
    borderColor: Palette.accent,
    backgroundColor: Palette.selectionSoft,
  },
  // Instant on hover, no transition: this app's hover reveals do not fade in.
  pillHover: { backgroundColor: Palette.accent },
  pressed: { opacity: 0.7 },
  label: { fontSize: FontSize.control, fontWeight: Weight.bold, color: Palette.link },
  labelHover: { color: Palette.accentText },
});
