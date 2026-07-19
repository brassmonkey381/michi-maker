/**
 * The shared paged-carousel interaction (extracted from BinderCarousel, now also the slice tray):
 * a snap-paging horizontal ScrollView with wrap-around prev/next arrows, mouse-wheel paging on
 * web, and a pressable dots indicator underneath. The parent measures its width, splits its
 * content into page nodes, and passes both down — this component owns only the paging chrome.
 */
import { useEffect, useRef, useState, type ReactNode } from 'react';
import {
  NativeScrollEvent,
  NativeSyntheticEvent,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { FontSize, Palette, Radius, Spacing, Weight } from '@/constants/theme';

/** Double-tap window (ms) for the arrows: a second tap within this jumps to start/end. */
const DOUBLE_TAP_MS = 200;

export function PagedCarousel({
  width,
  pages,
  prevLabel = 'Previous page',
  nextLabel = 'Next page',
}: {
  /** Measured container width — each page snaps to exactly this. 0 renders nothing (pre-layout). */
  width: number;
  pages: ReactNode[];
  prevLabel?: string;
  nextLabel?: string;
}) {
  const [page, setPage] = useState(0);
  const scrollRef = useRef<ScrollView>(null);
  const rootRef = useRef<View>(null);
  const pageCount = pages.length;

  // Losing pages (a removal, a resize repack) can strand the index — clamp it.
  const safePage = Math.min(page, Math.max(0, pageCount - 1));

  const goTo = (p: number) => {
    if (pageCount === 0) return;
    const next = ((p % pageCount) + pageCount) % pageCount; // wrap both directions
    scrollRef.current?.scrollTo({ x: next * width, animated: true });
    setPage(next);
  };

  const onMomentumEnd = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    if (width > 0) setPage(Math.round(e.nativeEvent.contentOffset.x / width));
  };

  // Double-tap an arrow (<200ms) to jump to the first / last page; a single tap steps one page.
  const lastPrev = useRef(0);
  const lastNext = useRef(0);
  const onPrev = () => {
    const now = Date.now();
    if (now - lastPrev.current < DOUBLE_TAP_MS) goTo(0);
    else goTo(safePage - 1);
    lastPrev.current = now;
  };
  const onNext = () => {
    const now = Date.now();
    if (now - lastNext.current < DOUBLE_TAP_MS) goTo(pageCount - 1);
    else goTo(safePage + 1);
    lastNext.current = now;
  };

  // Web: page the carousel with the mouse wheel (vertical or horizontal). We consume the wheel
  // (preventDefault) only while there's a page to move to in that direction — at either end the
  // wheel falls through to the page, so you never get trapped. One page per wheel gesture/notch.
  useEffect(() => {
    if (Platform.OS !== 'web' || pageCount <= 1 || width === 0) return;
    const el = rootRef.current as unknown as HTMLElement | null;
    if (!el) return;
    let cooldown = -Infinity;
    const onWheel = (e: WheelEvent) => {
      const delta = Math.abs(e.deltaX) >= Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
      if (Math.abs(delta) < 2) return;
      const next = safePage + (delta > 0 ? 1 : -1);
      if (next < 0 || next >= pageCount) return; // at an edge → let the page scroll
      e.preventDefault();
      if (e.timeStamp - cooldown < 300) return; // one page per gesture, not per event
      cooldown = e.timeStamp;
      scrollRef.current?.scrollTo({ x: next * width, animated: true });
      setPage(next);
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [safePage, pageCount, width]);

  return (
    <View ref={rootRef}>
      <ScrollView
        ref={scrollRef}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={onMomentumEnd}
        scrollEventThrottle={16}>
        {width > 0 &&
          pages.map((content, i) => (
            <View key={i} style={{ width }}>
              {content}
            </View>
          ))}
      </ScrollView>

      {pageCount > 1 ? (
        <>
          <Arrow dir="prev" label={`${prevLabel} (double-tap for start)`} onPress={onPrev} />
          <Arrow dir="next" label={`${nextLabel} (double-tap for end)`} onPress={onNext} />
          <View style={styles.dots}>
            {pages.map((_, i) => (
              <Pressable
                key={i}
                onPress={() => goTo(i)}
                hitSlop={6}
                accessibilityRole="button"
                accessibilityLabel={`Page ${i + 1} of ${pageCount}`}>
                <View style={[styles.dot, i === safePage && styles.dotActive]} />
              </Pressable>
            ))}
          </View>
        </>
      ) : null}
    </View>
  );
}

function Arrow({ dir, label, onPress }: { dir: 'prev' | 'next'; label: string; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      hitSlop={8}
      accessibilityLabel={label}
      style={[styles.arrow, dir === 'prev' ? styles.arrowLeft : styles.arrowRight]}>
      <Text style={styles.arrowText}>{dir === 'prev' ? '‹' : '›'}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  arrow: {
    position: 'absolute',
    top: '50%',
    marginTop: -18,
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Palette.scrim40,
  },
  arrowLeft: { left: 4 },
  arrowRight: { right: 4 },
  arrowText: { color: Palette.white, fontSize: FontSize.nav, lineHeight: 30, fontWeight: Weight.semibold },
  dots: { flexDirection: 'row', justifyContent: 'center', gap: Spacing.one, marginTop: Spacing.two },
  dot: { width: 6, height: 6, borderRadius: Radius.xs, backgroundColor: Palette.hairlineStrong },
  dotActive: { backgroundColor: Palette.accent },
});
