/**
 * CONFETTI, for the daily puzzle's right answers (owner, 2026-10-22). A burst of small coloured
 * pieces thrown up from a point, falling and fading over about a second. Decoration only: it sits
 * over the page, eats no press, and renders nothing at all when the device asks for reduced motion.
 *
 * Built on the core `Animated` API, like CheatsheetButton's pulse, so it costs no new dependency and
 * runs the same on web and native. One progress value drives every piece; the pieces differ by
 * their throw (angle, distance, spin, size, colour, a little delay), which the parent generates in
 * its event handler with `makeConfetti` and hands over. New pieces, new burst; the same array again
 * does nothing, so the parent re-renders freely.
 */
import { useEffect, useMemo, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, StyleSheet, View } from 'react-native';

import { Palette } from '@/constants/theme';

export interface ConfettiPiece {
  /** Horizontal travel, px, signed. */
  dx: number;
  /** How high it is thrown before falling, px. */
  up: number;
  /** Where it lands, px below the origin. */
  down: number;
  /** Total spin, degrees. */
  spin: number;
  /** Start offset as a fraction of the run, 0 to 0.25. */
  delay: number;
  w: number;
  h: number;
  color: string;
  /** Round pieces and squares, so a burst does not read as one shape. */
  round: boolean;
}

const DURATION_MS = 1300;

/** Throw `count` pieces. Call from an event handler, not during render. */
export function makeConfetti(count: number): ConfettiPiece[] {
  const colors = [Palette.accent, Palette.success, '#F6C945', '#F08A5D', '#6AA9FF', '#C77DFF'];
  const pieces: ConfettiPiece[] = [];
  for (let i = 0; i < count; i += 1) {
    const angle = (-Math.PI / 2) + (Math.random() - 0.5) * Math.PI * 0.9;
    const speed = 110 + Math.random() * 190;
    const size = 6 + Math.random() * 7;
    pieces.push({
      dx: Math.cos(angle) * speed * 1.4,
      up: Math.max(40, -Math.sin(angle) * speed),
      down: 160 + Math.random() * 220,
      spin: (Math.random() - 0.5) * 1080,
      delay: Math.random() * 0.25,
      w: size,
      h: Math.random() < 0.5 ? size : size * 0.45,
      color: colors[i % colors.length],
      round: Math.random() < 0.3,
    });
  }
  return pieces;
}

export function Confetti({ pieces }: { pieces: ConfettiPiece[] | null }) {
  const [reduceMotion, setReduceMotion] = useState(false);
  const progress = useMemo(() => new Animated.Value(0), []);

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
    if (!pieces || reduceMotion) return;
    // A new burst replaces one still in the air. The pieces stay mounted after the run, fully
    // transparent (their opacity ends at 0 and starts at 0), so no state has to be set to clear them.
    progress.setValue(0);
    const anim = Animated.timing(progress, {
      toValue: 1,
      duration: DURATION_MS,
      easing: Easing.linear,
      useNativeDriver: true,
    });
    anim.start();
    return () => anim.stop();
  }, [pieces, progress, reduceMotion]);

  if (!pieces || reduceMotion) return null;
  return (
    <View pointerEvents="none" style={styles.layer} testID="confetti">
      <View style={styles.origin}>
        {pieces.map((p, i) => {
          const start = p.delay;
          const peak = start + (1 - start) * 0.32;
          return (
            <Animated.View
              key={i}
              style={[
                styles.piece,
                {
                  width: p.w,
                  height: p.h,
                  borderRadius: p.round ? p.w / 2 : 1,
                  backgroundColor: p.color,
                  opacity: progress.interpolate({ inputRange: [0, start, 0.75, 1], outputRange: [0, 1, 1, 0] }),
                  transform: [
                    { translateX: progress.interpolate({ inputRange: [0, start, 1], outputRange: [0, 0, p.dx] }) },
                    {
                      translateY: progress.interpolate({
                        inputRange: [0, start, peak, 1],
                        outputRange: [0, 0, -p.up, p.down],
                      }),
                    },
                    { rotate: progress.interpolate({ inputRange: [0, start, 1], outputRange: ['0deg', '0deg', `${p.spin}deg`] }) },
                    { scale: progress.interpolate({ inputRange: [0, start, peak, 1], outputRange: [0.3, 0.5, 1, 0.8] }) },
                  ],
                },
              ]}
            />
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  layer: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, overflow: 'hidden', zIndex: 50 },
  // The throw starts a little above the middle of the screen, where the guess box tends to sit.
  origin: { position: 'absolute', left: '50%', top: '58%', width: 0, height: 0 },
  piece: { position: 'absolute', left: 0, top: 0 },
});
