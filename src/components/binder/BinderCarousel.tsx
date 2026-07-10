/**
 * A horizontal, 2-up carousel of binder thumbnails. Collapses a long list (examples) into a
 * single row so the home page stays short and the sections below it are reachable. Native swipe
 * (paging) plus prev/next arrows that wrap around, so you can page left/right endlessly.
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

import { BinderThumb } from '@/components/binder/BinderThumb';
import { FontSize, Palette, Radius, Spacing, Weight } from '@/constants/theme';
import type { DemoBinder } from '@/data/binderTypes';

export function BinderCarousel({
  binders,
  onOpen,
  accessory,
}: {
  binders: DemoBinder[];
  onOpen: (id: string) => void;
  /** Optional trailing control per tile (e.g. the ⋯ actions button for your own binders). */
  accessory?: (binder: DemoBinder) => ReactNode;
}) {
  const [width, setWidth] = useState(0);
  const [page, setPage] = useState(0);
  const scrollRef = useRef<ScrollView>(null);
  const containerRef = useRef<View>(null);
  const gap = Spacing.three;
  const tileWidth = width > 0 ? (width - gap) / 2 : 0;

  // Pages of two — each page is exactly the container width so paging snaps cleanly.
  const pages: DemoBinder[][] = [];
  for (let i = 0; i < binders.length; i += 2) pages.push(binders.slice(i, i + 2));
  const pageCount = pages.length;

  const goTo = (p: number) => {
    if (pageCount === 0) return;
    const next = ((p % pageCount) + pageCount) % pageCount; // wrap both directions
    scrollRef.current?.scrollTo({ x: next * width, animated: true });
    setPage(next);
  };

  const onMomentumEnd = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    if (width > 0) setPage(Math.round(e.nativeEvent.contentOffset.x / width));
  };

  // Web: page the carousel with the mouse wheel (vertical or horizontal). We consume the wheel
  // (preventDefault) only while there's a page to move to in that direction — at either end the
  // wheel falls through to the page, so you never get trapped. One page per wheel gesture/notch.
  useEffect(() => {
    if (Platform.OS !== 'web' || pageCount <= 1 || width === 0) return;
    const el = containerRef.current as unknown as HTMLElement | null;
    if (!el) return;
    let cooldown = -Infinity;
    const onWheel = (e: WheelEvent) => {
      const delta = Math.abs(e.deltaX) >= Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
      if (Math.abs(delta) < 2) return;
      const next = page + (delta > 0 ? 1 : -1);
      if (next < 0 || next >= pageCount) return; // at an edge → let the page scroll
      e.preventDefault();
      if (e.timeStamp - cooldown < 300) return; // one page per gesture, not per event
      cooldown = e.timeStamp;
      scrollRef.current?.scrollTo({ x: next * width, animated: true });
      setPage(next);
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [page, pageCount, width]);

  return (
    <View ref={containerRef} onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
      <ScrollView
        ref={scrollRef}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={onMomentumEnd}
        scrollEventThrottle={16}>
        {width > 0 &&
          pages.map((pg, pi) => (
            <View key={pi} style={[styles.page, { width, gap }]}>
              {pg.map((binder) => (
                <BinderThumb
                  key={binder.id}
                  binder={binder}
                  width={tileWidth}
                  onPress={() => onOpen(binder.id)}
                  accessory={accessory?.(binder)}
                />
              ))}
            </View>
          ))}
      </ScrollView>

      {pageCount > 1 ? (
        <>
          <Arrow dir="prev" onPress={() => goTo(page - 1)} />
          <Arrow dir="next" onPress={() => goTo(page + 1)} />
          <View style={styles.dots}>
            {pages.map((_, i) => (
              <View key={i} style={[styles.dot, i === page && styles.dotActive]} />
            ))}
          </View>
        </>
      ) : null}
    </View>
  );
}

function Arrow({ dir, onPress }: { dir: 'prev' | 'next'; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      hitSlop={8}
      accessibilityLabel={dir === 'prev' ? 'Previous examples' : 'More examples'}
      style={[styles.arrow, dir === 'prev' ? styles.arrowLeft : styles.arrowRight]}>
      <Text style={styles.arrowText}>{dir === 'prev' ? '‹' : '›'}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  page: { flexDirection: 'row' },
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
