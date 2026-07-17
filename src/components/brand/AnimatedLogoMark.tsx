/**
 * The michi-maker mark, animated. Starts as the empty 3×3 pocket grid, then fills in
 * non-overlapping 2-pocket blue strips (the signature michi "span") one at a time on a
 * stagger, holds, and fades back to empty — repeating with a new pattern each cycle.
 *
 * Three timing variants convey app state:
 *   - `idle`     slow and calm (default; brand motion on the marketing page / header)
 *   - `thinking` quick, restless fills (short-lived work — pair with a busy flag)
 *   - `loading`  steady, rhythmic (ongoing loads)
 *
 * Plain Views + reanimated opacity (no SVG, no layout animations) so it renders the same
 * on web and native and stays crisp at any size. Honours prefers-reduced-motion (web):
 * then it just shows one filled pattern, static. The static mark lives in LogoMark.tsx;
 * keep the geometry in sync (and with scripts/brand-assets.mjs, which builds the favicon).
 */
import { useEffect, useState } from 'react';
import { Platform, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated';

import { Palette } from '@/constants/theme';

type Dir = 'h' | 'v';
interface Bar {
  r: number;
  c: number;
  dir: Dir;
}
type Pattern = Bar[];

const MAX_BARS = 4;

// Non-overlapping 2-pocket strips on the 3×3 grid. Each leaves a pocket or two empty —
// the michi negative space — and the last one deliberately leaves the centre open.
const PATTERNS: Pattern[] = [
  [{ r: 0, c: 0, dir: 'h' }, { r: 0, c: 2, dir: 'v' }, { r: 1, c: 0, dir: 'h' }, { r: 2, c: 1, dir: 'h' }],
  [{ r: 0, c: 0, dir: 'v' }, { r: 0, c: 1, dir: 'v' }, { r: 0, c: 2, dir: 'v' }],
  [{ r: 0, c: 0, dir: 'h' }, { r: 1, c: 1, dir: 'h' }, { r: 2, c: 0, dir: 'h' }],
  [{ r: 0, c: 0, dir: 'h' }, { r: 1, c: 0, dir: 'v' }, { r: 0, c: 2, dir: 'v' }, { r: 2, c: 1, dir: 'h' }],
];

interface Timing {
  stagger: number;
  fadeIn: number;
  hold: number;
  fadeOut: number;
  gap: number;
}
const TIMINGS: Record<'idle' | 'thinking' | 'loading', Timing> = {
  idle: { stagger: 190, fadeIn: 340, hold: 950, fadeOut: 520, gap: 750 },
  thinking: { stagger: 85, fadeIn: 150, hold: 150, fadeOut: 170, gap: 90 },
  loading: { stagger: 120, fadeIn: 200, hold: 320, fadeOut: 240, gap: 160 },
};

function reducedMotion(): boolean {
  return (
    Platform.OS === 'web' &&
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

export function AnimatedLogoMark({
  size = 24,
  variant = 'idle',
}: {
  size?: number;
  variant?: 'idle' | 'thinking' | 'loading';
}) {
  const gap = Math.max(1, Math.round(size / 12));
  const cell = (size - gap * 2) / 3;
  const radius = Math.max(1, cell * 0.24);
  const unit = cell + gap;

  // A fixed pool of MAX_BARS opacity drivers (stable hook count) — each cycle assigns the
  // current pattern's strips to the first N slots.
  const o0 = useSharedValue(0);
  const o1 = useSharedValue(0);
  const o2 = useSharedValue(0);
  const o3 = useSharedValue(0);
  const barStyles = [
    useAnimatedStyle(() => ({ opacity: o0.value })),
    useAnimatedStyle(() => ({ opacity: o1.value })),
    useAnimatedStyle(() => ({ opacity: o2.value })),
    useAnimatedStyle(() => ({ opacity: o3.value })),
  ];

  const [pattern, setPattern] = useState<Pattern>(PATTERNS[0]);

  useEffect(() => {
    const opacities = [o0, o1, o2, o3];
    if (reducedMotion()) {
      PATTERNS[0].forEach((_, i) => {
        opacities[i].value = 1;
      });
      return;
    }
    const t = TIMINGS[variant];
    const easing = Easing.out(Easing.quad);
    let cancelled = false;
    const timers: ReturnType<typeof setTimeout>[] = [];

    const run = (k: number) => {
      if (cancelled) return;
      const pat = PATTERNS[k % PATTERNS.length];
      setPattern(pat);
      for (let i = pat.length; i < MAX_BARS; i++) opacities[i].value = 0;
      pat.forEach((_, i) => {
        opacities[i].value = withDelay(i * t.stagger, withTiming(1, { duration: t.fadeIn, easing }));
      });
      const revealDone = (pat.length - 1) * t.stagger + t.fadeIn;
      timers.push(
        setTimeout(() => {
          if (cancelled) return;
          for (let i = 0; i < pat.length; i++) {
            opacities[i].value = withTiming(0, { duration: t.fadeOut, easing });
          }
        }, revealDone + t.hold),
      );
      timers.push(setTimeout(() => run(k + 1), revealDone + t.hold + t.fadeOut + t.gap));
    };

    // Kick off asynchronously so the first setPattern isn't a synchronous effect setState.
    const kickoff = setTimeout(() => run(0), 0);
    timers.push(kickoff);
    return () => {
      cancelled = true;
      timers.forEach(clearTimeout);
    };
  }, [variant, o0, o1, o2, o3]);

  return (
    <View style={{ width: size, height: size }} accessibilityLabel="michi-maker">
      {/* Empty 3×3 pocket grid. */}
      <View style={{ gap }}>
        {[0, 1, 2].map((r) => (
          <View key={r} style={{ flexDirection: 'row', gap }}>
            {[0, 1, 2].map((c) => (
              <View
                key={c}
                style={{
                  width: cell,
                  height: cell,
                  borderRadius: radius,
                  backgroundColor: 'rgba(128,128,128,0.35)',
                }}
              />
            ))}
          </View>
        ))}
      </View>
      {/* Blue strips that fill in and fade out. */}
      {[0, 1, 2, 3].map((i) => {
        const bar = pattern[i];
        if (!bar) return null;
        return (
          <Animated.View
            key={i}
            pointerEvents="none"
            style={[
              {
                position: 'absolute',
                left: bar.c * unit,
                top: bar.r * unit,
                width: bar.dir === 'h' ? cell * 2 + gap : cell,
                height: bar.dir === 'v' ? cell * 2 + gap : cell,
                borderRadius: radius,
                backgroundColor: Palette.accent,
              },
              barStyles[i],
            ]}
          />
        );
      })}
    </View>
  );
}
