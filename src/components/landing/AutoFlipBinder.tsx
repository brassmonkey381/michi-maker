/**
 * A live binder that flips through its own pages on a timer — a gentle crossfade between
 * pages (single) or facing-page spreads. Used on the marketing landing so the hero and the
 * gallery show real, moving binder content instead of one static page.
 *
 * Pages of a binder share one size (enforced app-side), so the frames stack: the first is
 * in normal flow and defines the height; the rest overlay it absolutely and crossfade via
 * opacity. Honours prefers-reduced-motion (web) — then it just shows the first frame.
 * Purely presentational: pointer events pass through to a parent Pressable.
 */
import { useEffect, useMemo, useState } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

import { BinderGrid } from '@/components/binder/BinderGrid';
import { Palette, Spacing } from '@/constants/theme';
import type { DemoBinder, DemoPage } from '@/data/binderTypes';

function reducedMotion(): boolean {
  return (
    Platform.OS === 'web' &&
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

/** One crossfade layer. `base` sits in flow (defines the stage height); others overlay it. */
function Layer({ active, base, children }: { active: boolean; base: boolean; children: React.ReactNode }) {
  const opacity = useSharedValue(active ? 1 : 0);
  useEffect(() => {
    opacity.value = withTiming(active ? 1 : 0, { duration: 650 });
  }, [active, opacity]);
  const style = useAnimatedStyle(() => ({ opacity: opacity.value }));
  return (
    <Animated.View pointerEvents="none" style={[base ? undefined : StyleSheet.absoluteFill, style]}>
      {children}
    </Animated.View>
  );
}

const RINGS = [0, 1, 2, 3];
const SPINE_W = 22;

export function AutoFlipBinder({
  binder,
  pageWidth,
  spread = false,
  interval = 3600,
  maxFrames = 4,
}: {
  binder: DemoBinder;
  /** Width of a single page in px. */
  pageWidth: number;
  /** Render facing-page spreads (advancing two pages at a time) instead of single pages. */
  spread?: boolean;
  interval?: number;
  maxFrames?: number;
}) {
  const frames = useMemo<DemoPage[][]>(() => {
    const pages = binder.pages ?? [];
    if (spread) {
      const out: DemoPage[][] = [];
      for (let i = 0; i + 1 < pages.length && out.length < maxFrames; i += 2) {
        out.push([pages[i], pages[i + 1]]);
      }
      if (out.length === 0 && pages.length) out.push([pages[0]]);
      return out;
    }
    return pages.slice(0, maxFrames).map((p) => [p]);
  }, [binder.pages, spread, maxFrames]);

  const [idx, setIdx] = useState(0);
  useEffect(() => {
    if (frames.length <= 1 || reducedMotion()) return;
    const id = setInterval(() => setIdx((i) => (i + 1) % frames.length), interval);
    return () => clearInterval(id);
  }, [frames.length, interval]);
  // Clamp during render (not via a setState in the effect) so a changed frame count can't
  // leave `idx` pointing past the end.
  const active = frames.length > 0 ? idx % frames.length : 0;

  const width = spread ? pageWidth * 2 + SPINE_W + Spacing.two * 2 : pageWidth;

  return (
    <View style={{ width }}>
      <View>
        {frames.map((frame, i) => (
          <Layer key={i} active={i === active} base={i === 0}>
            {frame.length === 2 ? (
              <View style={styles.spreadRow}>
                <BinderGrid page={frame[0]} width={pageWidth} />
                <View style={styles.spine}>
                  {RINGS.map((r) => (
                    <View key={r} style={styles.ring} />
                  ))}
                </View>
                <BinderGrid page={frame[1]} width={pageWidth} />
              </View>
            ) : (
              <BinderGrid page={frame[0]} width={pageWidth} />
            )}
          </Layer>
        ))}
      </View>
      {frames.length > 1 ? (
        <View style={styles.dots} pointerEvents="none">
          {frames.map((_, i) => (
            <View key={i} style={[styles.dot, i === active && styles.dotActive]} />
          ))}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  spreadRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  spine: {
    width: SPINE_W,
    alignSelf: 'stretch',
    alignItems: 'center',
    justifyContent: 'space-around',
    paddingVertical: Spacing.four,
  },
  ring: { width: 10, height: 10, borderRadius: 5, borderWidth: 2, borderColor: Palette.hairlineStrong },
  dots: { flexDirection: 'row', justifyContent: 'center', gap: Spacing.one, marginTop: Spacing.three },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: Palette.hairlineStrong },
  dotActive: { width: 16, backgroundColor: Palette.accent },
});
