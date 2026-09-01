import { useMemo, type ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { runOnJS, useAnimatedStyle, useSharedValue } from 'react-native-reanimated';

import { BinderGrid } from '@/components/binder/BinderGrid';
import { FontSize, Palette, Weight } from '@/constants/theme';
import type { DemoPage } from '@/data/binderTypes';

const ITEM_W = 66; // width of each page thumbnail (incl. its margin step)
const THUMB_W = 58;
/** The width a strip thumbnail is drawn at, for callers supplying their own (a cover). */
export const STRIP_THUMB_W = THUMB_W;

/**
 * SOMETHING IN THE STRIP THAT IS NOT A PAGE: a binder cover. It has a label instead of a number,
 * draws itself, and is never reordered, because the index space of this strip belongs to the
 * pages and a cover has no index in it. Leading ones sit before page 1, trailing ones after the
 * last page, and page N stays labelled N.
 */
export interface StripExtra {
  key: string;
  /** Short. 'FC', 'IFC': the strip has 58px to work with. */
  label: string;
  current: boolean;
  onSelect: () => void;
  /** Already drawn at STRIP_THUMB_W. */
  thumb: ReactNode;
}

interface PageStripProps {
  pages: DemoPage[];
  currentIndex: number;
  onSelect: (index: number) => void;
  /** Omit to make the strip read-only (tap to jump only) — e.g. when inspecting a binder. */
  onReorder?: (from: number, to: number) => void;
  leading?: StripExtra[];
  trailing?: StripExtra[];
}

/** Horizontal filmstrip of page thumbnails: tap to jump, and (when editable) long-press-drag to reorder. */
export function PageStrip({ pages, currentIndex, onSelect, onReorder, leading, trailing }: PageStripProps) {
  // One page is nothing to choose between, unless there are covers to choose as well.
  if (pages.length <= 1 && !leading?.length && !trailing?.length) return null;
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      // flexGrow centres the strip under the page when it's narrower than the screen, while a
      // long strip still scrolls normally from its left edge.
      contentContainerStyle={styles.row}>
      {(leading ?? []).map((x) => (
        <ExtraThumb key={x.key} extra={x} />
      ))}
      {pages.map((page, index) => (
        <PageThumb
          key={page.id}
          page={page}
          index={index}
          count={pages.length}
          current={index === currentIndex}
          onSelect={onSelect}
          onReorder={onReorder}
        />
      ))}
      {(trailing ?? []).map((x) => (
        <ExtraThumb key={x.key} extra={x} />
      ))}
    </ScrollView>
  );
}

/** A cover in the strip. Same footprint as a page thumb, so the drag pitch the pages use holds. */
function ExtraThumb({ extra }: { extra: StripExtra }) {
  return (
    <Pressable onPress={extra.onSelect} style={styles.thumb} accessibilityLabel={extra.label}>
      <View style={[styles.thumbInner, extra.current && styles.thumbCurrent]} pointerEvents="none">
        {extra.thumb}
      </View>
      <Text style={[styles.num, extra.current && styles.numCurrent]}>{extra.label}</Text>
    </Pressable>
  );
}

interface PageThumbProps {
  page: DemoPage;
  index: number;
  count: number;
  current: boolean;
  onSelect: (index: number) => void;
  onReorder?: (from: number, to: number) => void;
}

function PageThumb({ page, index, count, current, onSelect, onReorder }: PageThumbProps) {
  const tx = useSharedValue(0);
  const lifted = useSharedValue(0);

  const gesture = useMemo(() => {
    const tap = Gesture.Tap().onEnd(() => runOnJS(onSelect)(index));
    // Read-only strip (inspecting): tap-to-jump only, no drag-to-reorder.
    if (!onReorder) return tap;
    const pan = Gesture.Pan()
      // Long-press to lift, so horizontal scrolling of the strip still works normally.
      .activateAfterLongPress(220)
      .onStart(() => {
        lifted.value = 1;
      })
      .onUpdate((e) => {
        tx.value = e.translationX;
      })
      .onEnd((e) => {
        const target = Math.min(count - 1, Math.max(0, index + Math.round(e.translationX / ITEM_W)));
        if (target !== index) runOnJS(onReorder)(index, target);
      })
      .onFinalize(() => {
        tx.value = 0;
        lifted.value = 0;
      });
    return Gesture.Exclusive(pan, tap);
  }, [index, count, onReorder, onSelect, tx, lifted]);

  const animStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: tx.value }, { scale: 1 + lifted.value * 0.08 }],
    zIndex: lifted.value > 0 ? 10 : 0,
    opacity: 1 - lifted.value * 0.06,
  }));

  return (
    <GestureDetector gesture={gesture}>
      <Animated.View style={[styles.thumb, animStyle]}>
        <View style={[styles.thumbInner, current && styles.thumbCurrent]} pointerEvents="none">
          <BinderGrid page={page} width={THUMB_W} />
        </View>
        <Text style={[styles.num, current && styles.numCurrent]}>{index + 1}</Text>
      </Animated.View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  row: {
    gap: 8,
    paddingVertical: 6,
    paddingHorizontal: 2,
    alignItems: 'flex-start',
    flexGrow: 1,
    justifyContent: 'center',
  },
  thumb: { width: THUMB_W, alignItems: 'center' },
  thumbInner: {
    borderRadius: 10,
    padding: 2,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  thumbCurrent: { borderColor: Palette.accent },
  num: { fontSize: FontSize.sm, color: Palette.muted2, marginTop: 2, fontWeight: Weight.semibold },
  numCurrent: { color: Palette.accent },
});
