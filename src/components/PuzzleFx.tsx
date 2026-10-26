/**
 * THE DAILY PUZZLE'S REACTIONS (owner, 2026-10-25: "more prominent and fun"). Four small effects
 * on the core `Animated` API, like Confetti, so they run the same on web and native and cost no
 * dependency. Each takes a `signal`: a counter the page bumps in its event handler. A change in
 * the counter plays the effect once; the same value again does nothing, so the page re-renders
 * freely. Every effect is decoration: it moves nothing the reader has to find afterwards, eats no
 * press, and is skipped when the device asks for reduced motion.
 *
 *  - Shake:  the guess box on a wrong word, side to side.
 *  - Pop:    a found chip or verdict line landing with a little overshoot.
 *  - Wave:   the cards hop one after the other on a right word, higher on the solve.
 *  - Stamp:  a word slapped over the cards (YES, NOPE, SOLVED) that lands and fades.
 */
import { useEffect, useMemo, type ReactNode } from 'react';
import { Animated, Easing, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Palette, Weight } from '@/constants/theme';
import { useReduceMotion } from '@/hooks/use-reduce-motion';

type Wrap = { signal: number; children: ReactNode; style?: StyleProp<ViewStyle> };

/** Side to side, four times, settling in 420ms. */
export function Shake({ signal, children, style }: Wrap) {
  const x = useMemo(() => new Animated.Value(0), []);
  const reduce = useReduceMotion();
  useEffect(() => {
    if (!signal || reduce) return;
    x.setValue(0);
    const step = (to: number, ms: number) =>
      Animated.timing(x, { toValue: to, duration: ms, easing: Easing.linear, useNativeDriver: true });
    const anim = Animated.sequence([step(-12, 50), step(10, 60), step(-8, 60), step(6, 60), step(-3, 60), step(0, 60)]);
    anim.start();
    return () => anim.stop();
  }, [signal, reduce, x]);
  return <Animated.View style={[style, { transform: [{ translateX: x }] }]}>{children}</Animated.View>;
}

/** Lands with an overshoot. Plays on mount too when `onMount` is set (a chip that just appeared). */
export function Pop({ signal, children, style, onMount = false }: Wrap & { onMount?: boolean }) {
  const s = useMemo(() => new Animated.Value(onMount ? 0.4 : 1), []); // eslint-disable-line react-hooks/exhaustive-deps
  const reduce = useReduceMotion();
  useEffect(() => {
    if (reduce) {
      s.setValue(1);
      return;
    }
    if (!signal && !onMount) return;
    s.setValue(0.4);
    const anim = Animated.spring(s, { toValue: 1, friction: 4, tension: 160, useNativeDriver: true });
    anim.start();
    return () => anim.stop();
  }, [signal, onMount, reduce, s]);
  return <Animated.View style={[style, { transform: [{ scale: s }] }]}>{children}</Animated.View>;
}

/** A hop, `index` × 55ms after the first card; `lift` px high (bigger on the solve). */
export function Wave({ signal, index, lift, children, style }: Wrap & { index: number; lift: number }) {
  const y = useMemo(() => new Animated.Value(0), []);
  const reduce = useReduceMotion();
  useEffect(() => {
    if (!signal || reduce) return;
    y.setValue(0);
    const anim = Animated.sequence([
      Animated.delay(index * 55),
      Animated.timing(y, { toValue: -lift, duration: 170, easing: Easing.out(Easing.quad), useNativeDriver: true }),
      Animated.spring(y, { toValue: 0, friction: 4, tension: 120, useNativeDriver: true }),
    ]);
    anim.start();
    return () => anim.stop();
  }, [signal, index, lift, reduce, y]);
  return <Animated.View style={[style, { transform: [{ translateY: y }] }]}>{children}</Animated.View>;
}

export type StampTone = 'yes' | 'no' | 'win';

const STAMP_MS: Record<StampTone, number> = { yes: 900, no: 800, win: 1600 };

/**
 * A word over the cards: scales in hard, tilts a little, holds, fades. Positioned by the parent
 * (absolute over the grid). Renders nothing until the first signal and nothing under reduced motion.
 */
export function Stamp({ signal, text, tone }: { signal: number; text: string; tone: StampTone }) {
  const p = useMemo(() => new Animated.Value(0), []);
  const reduce = useReduceMotion();
  useEffect(() => {
    if (!signal || reduce) return;
    p.setValue(0);
    const anim = Animated.timing(p, { toValue: 1, duration: STAMP_MS[tone], easing: Easing.linear, useNativeDriver: true });
    anim.start();
    return () => anim.stop();
  }, [signal, tone, reduce, p]);
  if (!signal || reduce) return null;
  const tilt = tone === 'no' ? '6deg' : '-8deg';
  return (
    <View pointerEvents="none" style={styles.stampLane}>
    <Animated.View
      style={[
        styles.stamp,
        tone === 'win' && styles.stampWin,
        {
          opacity: p.interpolate({ inputRange: [0, 0.08, 0.7, 1], outputRange: [0, 1, 1, 0] }),
          transform: [
            { scale: p.interpolate({ inputRange: [0, 0.1, 0.18, 0.7, 1], outputRange: [2.2, 0.92, 1, 1, 1.15] }) },
            { rotate: p.interpolate({ inputRange: [0, 0.1, 1], outputRange: ['0deg', tilt, tilt] }) },
          ],
        },
      ]}
      testID={`daily-stamp-${tone}`}
    >
      <ThemedText style={[styles.stampText, tone === 'win' && styles.stampTextWin, { color: tone === 'no' ? Palette.danger : tone === 'yes' ? Palette.success : Palette.accentText }]}>
        {text}
      </ThemedText>
    </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  /** Across the grid, so the stamp centres on web and native alike. */
  stampLane: { position: 'absolute', left: 0, right: 0, top: '38%', alignItems: 'center', zIndex: 40 },
  stamp: {
    paddingVertical: 8,
    paddingHorizontal: 22,
    borderRadius: 14,
    borderWidth: 4,
    borderColor: 'rgba(255,255,255,0.9)',
    backgroundColor: 'rgba(255,255,255,0.92)',
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 10,
  },
  stampWin: { backgroundColor: Palette.accent, borderColor: 'rgba(255,255,255,0.9)', paddingVertical: 12, paddingHorizontal: 30 },
  stampText: { fontSize: 40, lineHeight: 48, fontWeight: Weight.bold, letterSpacing: 2 },
  stampTextWin: { fontSize: 52, lineHeight: 60 },
});
