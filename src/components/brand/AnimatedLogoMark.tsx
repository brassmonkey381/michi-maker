/**
 * The michi-maker mark, animated. Starts as the empty 3×3 pocket grid, then fills itself in
 * the way a real side-load binder page fills: 2-wide folded art pieces and single cards drop
 * into pockets one at a time on a stagger, hold, then fade back to empty — a new (legal)
 * arrangement each cycle, drawn shuffled from a deck of 30.
 *
 * Binder-page physics (see src/data/binderPhysics.ts), honoured here:
 *   - A 2-wide art piece is ALWAYS horizontal (1 row × 2 cols): side-load pockets open
 *     sideways, so nothing can span rows.
 *   - On a 3-col page there is exactly ONE inside-edge pocket pair a folded 2-wide piece fits:
 *     columns 1–2 (a right-of-spine page) OR 0–1 (a left page). So within one arrangement
 *     every 2-wide piece starts at the SAME column. Singles (1×1) go anywhere.
 * The PATTERNS below span both spine sides and singles-only pages, always leaving negative
 * space (a couple fill the whole page).
 *
 * Three timing variants convey app state:
 *   - `idle`     slow and calm (default; brand motion on the marketing page / header)
 *   - `thinking` quick, restless fills (short-lived work — pair with a busy flag)
 *   - `loading`  steady, rhythmic (ongoing loads)
 *
 * Plain Views + reanimated opacity (no SVG, no layout animations) so it renders the same on
 * web and native and stays crisp at any size. Honours prefers-reduced-motion (web): then it
 * shows one filled arrangement, static. The static mark lives in LogoMark.tsx; keep the
 * geometry in sync (and with scripts/brand-assets.mjs, which builds the favicon).
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

/** A placed piece on the 3×3: top-left at (r, c), `w` pockets wide (2 = a folded art pair). */
interface Piece {
  r: number;
  c: number;
  w: 1 | 2;
}
type Pattern = Piece[];

const P = (r: number, c: number, w: 1 | 2): Piece => ({ r, c, w });
const MAX_PIECES = 6;

// 30 legal side-load arrangements. Every 2-wide piece in a pattern shares its start column
// (cols 1–2 for a right page, cols 0–1 for a left page); singles sit anywhere. Reveal order
// is the array order (roughly top-to-bottom).
const PATTERNS: Pattern[] = [
  // Right-of-spine pages — folded pairs at columns 1–2.
  [P(0, 1, 2), P(1, 1, 2), P(2, 1, 2)],
  [P(0, 1, 2), P(1, 0, 1), P(2, 1, 2)],
  [P(0, 1, 2), P(1, 1, 2), P(2, 0, 1)],
  [P(0, 0, 1), P(1, 1, 2), P(2, 2, 1)],
  [P(0, 1, 2), P(1, 0, 1), P(1, 2, 1)],
  [P(0, 0, 1), P(0, 1, 2), P(1, 1, 2), P(2, 1, 2), P(2, 0, 1)],
  [P(0, 1, 2), P(1, 1, 2)],
  [P(0, 1, 2), P(1, 1, 2), P(2, 2, 1)],
  [P(0, 1, 2), P(1, 0, 1), P(1, 2, 1), P(2, 1, 2)],
  [P(0, 1, 2), P(1, 0, 1), P(1, 1, 2), P(2, 1, 2)],
  [P(0, 0, 1), P(0, 1, 2), P(1, 0, 1), P(1, 1, 2), P(2, 0, 1), P(2, 1, 2)],
  [P(0, 0, 1), P(1, 1, 2), P(2, 0, 1)],
  // Left-of-spine pages — folded pairs at columns 0–1.
  [P(0, 0, 2), P(1, 0, 2), P(2, 0, 2)],
  [P(0, 0, 2), P(1, 2, 1), P(2, 0, 2)],
  [P(0, 2, 1), P(1, 0, 2), P(2, 0, 2)],
  [P(0, 0, 2), P(1, 2, 1), P(2, 2, 1)],
  [P(0, 0, 2), P(0, 2, 1), P(1, 0, 2), P(2, 2, 1)],
  [P(0, 0, 2), P(0, 2, 1), P(1, 0, 2), P(2, 0, 2), P(2, 2, 1)],
  [P(0, 0, 2), P(1, 0, 2)],
  [P(0, 0, 2), P(0, 2, 1), P(2, 0, 2), P(2, 2, 1)],
  [P(0, 0, 2), P(1, 0, 2), P(1, 2, 1), P(2, 0, 2)],
  [P(0, 0, 2), P(0, 2, 1), P(1, 2, 1), P(2, 0, 2), P(2, 2, 1)],
  [P(0, 0, 2), P(0, 2, 1), P(1, 0, 2), P(1, 2, 1), P(2, 0, 2), P(2, 2, 1)],
  [P(0, 2, 1), P(1, 0, 2), P(2, 2, 1)],
  // Singles only — no folded pieces, so no side constraint.
  [P(0, 0, 1), P(1, 1, 1), P(2, 2, 1)],
  [P(0, 2, 1), P(1, 1, 1), P(2, 0, 1)],
  [P(0, 1, 1), P(1, 0, 1), P(1, 2, 1), P(2, 1, 1)],
  [P(0, 0, 1), P(0, 2, 1), P(2, 0, 1), P(2, 2, 1)],
  [P(0, 1, 1), P(1, 0, 1), P(1, 1, 1), P(1, 2, 1), P(2, 1, 1)],
  [P(0, 0, 1), P(0, 1, 1), P(0, 2, 1), P(2, 0, 1), P(2, 1, 1), P(2, 2, 1)],
];

interface Timing {
  stagger: number;
  fadeIn: number;
  hold: number;
  fadeOut: number;
  gap: number;
}
const TIMINGS: Record<'idle' | 'thinking' | 'loading', Timing> = {
  idle: { stagger: 175, fadeIn: 330, hold: 900, fadeOut: 500, gap: 720 },
  thinking: { stagger: 80, fadeIn: 150, hold: 150, fadeOut: 170, gap: 90 },
  loading: { stagger: 110, fadeIn: 190, hold: 300, fadeOut: 230, gap: 150 },
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

  // A fixed pool of MAX_PIECES opacity drivers (stable hook count) — each cycle assigns the
  // current arrangement's pieces to the first N slots.
  const o0 = useSharedValue(0);
  const o1 = useSharedValue(0);
  const o2 = useSharedValue(0);
  const o3 = useSharedValue(0);
  const o4 = useSharedValue(0);
  const o5 = useSharedValue(0);
  const pieceStyles = [
    useAnimatedStyle(() => ({ opacity: o0.value })),
    useAnimatedStyle(() => ({ opacity: o1.value })),
    useAnimatedStyle(() => ({ opacity: o2.value })),
    useAnimatedStyle(() => ({ opacity: o3.value })),
    useAnimatedStyle(() => ({ opacity: o4.value })),
    useAnimatedStyle(() => ({ opacity: o5.value })),
  ];

  const [pattern, setPattern] = useState<Pattern>(PATTERNS[0]);

  useEffect(() => {
    const opacities = [o0, o1, o2, o3, o4, o5];
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

    // Shuffled deck: draw each pattern once before any repeats, and never repeat across the
    // shuffle seam.
    let deck: number[] = [];
    let last = -1;
    const draw = (): Pattern => {
      if (deck.length === 0) {
        deck = PATTERNS.map((_, i) => i);
        for (let i = deck.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [deck[i], deck[j]] = [deck[j], deck[i]];
        }
        if (deck.length > 1 && deck[deck.length - 1] === last) {
          [deck[deck.length - 1], deck[0]] = [deck[0], deck[deck.length - 1]];
        }
      }
      last = deck.pop() as number;
      return PATTERNS[last];
    };

    const run = () => {
      if (cancelled) return;
      const pat = draw();
      setPattern(pat);
      for (let i = pat.length; i < MAX_PIECES; i++) opacities[i].value = 0;
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
      timers.push(setTimeout(run, revealDone + t.hold + t.fadeOut + t.gap));
    };

    // Kick off asynchronously so the first setPattern isn't a synchronous effect setState.
    timers.push(setTimeout(run, 0));
    return () => {
      cancelled = true;
      timers.forEach(clearTimeout);
    };
  }, [variant, o0, o1, o2, o3, o4, o5]);

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
      {/* Cards + folded art pieces that drop in and fade out. */}
      {[0, 1, 2, 3, 4, 5].map((i) => {
        const piece = pattern[i];
        if (!piece) return null;
        return (
          <Animated.View
            key={i}
            pointerEvents="none"
            style={[
              {
                position: 'absolute',
                left: piece.c * unit,
                top: piece.r * unit,
                width: piece.w === 2 ? cell * 2 + gap : cell,
                height: cell,
                borderRadius: radius,
                backgroundColor: Palette.accent,
              },
              pieceStyles[i],
            ]}
          />
        );
      })}
    </View>
  );
}
