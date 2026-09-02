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
 * A VERTICAL THUMB'S BOX IS PINNED, and a horizontal one's is not.
 *
 * The drop calculation is `index + round(translation / step)`, so `step` has to be a constant — and
 * along the horizontal axis it is, because every thumb is THUMB_W wide whatever shape its page is.
 * Vertically there is no such constant: a thumbnail's HEIGHT comes from its page's own rows/cols
 * through BinderGrid, so a binder mixing 3x3 and 1x2 pages has thumbs of different heights and no
 * single correct pixels-per-index.
 *
 * So in a vertical rail the thumb sits in a fixed box. A 1x2 page's thumb floats in a taller box
 * rather than the rail losing the ability to say where a drag will land.
 */
const THUMB_BOX_H = 92;
const ITEM_H = THUMB_BOX_H + 8; // the box plus the row gap — the vertical pitch

export type StripAxis = 'horizontal' | 'vertical';

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
  /** Which way the strip runs. Vertical is the left rail; horizontal is the bottom dock. */
  axis?: StripAxis;
}

/** Horizontal filmstrip of page thumbnails: tap to jump, and (when editable) long-press-drag to reorder. */
export function PageStrip({
  pages,
  currentIndex,
  onSelect,
  onReorder,
  leading,
  trailing,
  axis = 'horizontal',
}: PageStripProps) {
  // One page is nothing to choose between, unless there are covers to choose as well.
  if (pages.length <= 1 && !leading?.length && !trailing?.length) return null;
  const vertical = axis === 'vertical';
  return (
    <ScrollView
      horizontal={!vertical}
      showsHorizontalScrollIndicator={false}
      // Shown on the vertical rail only. It is now full height and really does overflow on a long
      // binder, and the scrollbar is the only thing that says there are more pages below.
      showsVerticalScrollIndicator={vertical}
      // flexGrow centres the strip under the page when it's narrower than the screen, while a
      // long strip still scrolls normally from its left edge.
      contentContainerStyle={vertical ? styles.column : styles.row}>
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
          vertical={vertical}
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
  vertical?: boolean;
}

function PageThumb({ page, index, count, current, onSelect, onReorder, vertical = false }: PageThumbProps) {
  // One offset, along whichever axis the strip runs. Two shared values would be two ways to be
  // half-reset.
  const drag = useSharedValue(0);
  const lifted = useSharedValue(0);

  const gesture = useMemo(() => {
    const tap = Gesture.Tap().onEnd(() => runOnJS(onSelect)(index));
    // Read-only strip (inspecting): tap-to-jump only, no drag-to-reorder.
    if (!onReorder) return tap;
    const step = vertical ? ITEM_H : ITEM_W;
    const pan = Gesture.Pan()
      // Long-press to lift, so ordinary scrolling of the strip still works. Load-bearing on both
      // axes and more so vertically, where a drag would otherwise contend with the page's own
      // scroller as well as with the rail's.
      .activateAfterLongPress(220)
      .onStart(() => {
        lifted.value = 1;
      })
      .onUpdate((e) => {
        drag.value = vertical ? e.translationY : e.translationX;
      })
      .onEnd((e) => {
        const moved = vertical ? e.translationY : e.translationX;
        const target = Math.min(count - 1, Math.max(0, index + Math.round(moved / step)));
        if (target !== index) runOnJS(onReorder)(index, target);
      })
      .onFinalize(() => {
        drag.value = 0;
        lifted.value = 0;
      });
    return Gesture.Exclusive(pan, tap);
  }, [index, count, onReorder, onSelect, drag, lifted, vertical]);

  const animStyle = useAnimatedStyle(() => ({
    transform: [
      vertical ? { translateY: drag.value } : { translateX: drag.value },
      { scale: 1 + lifted.value * 0.08 },
    ],
    zIndex: lifted.value > 0 ? 10 : 0,
    opacity: 1 - lifted.value * 0.06,
  }));

  return (
    <GestureDetector gesture={gesture}>
      <Animated.View style={[styles.thumb, vertical && styles.thumbBoxed, animStyle]}>
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
  /** The same row, turned. flexGrow + centre keeps a short rail beside the middle of the page. */
  /**
   * The same row, turned. ANCHORED TO THE TOP, not centred: a full-height rail genuinely overflows
   * once a binder has seven or eight thumbnails, and centred overflow on the web is overflow you
   * cannot scroll back to — FC and IFC would sit above the reachable area with no way to reach them.
   */
  column: {
    gap: 8,
    paddingHorizontal: 6,
    paddingVertical: 2,
    alignItems: 'center',
    flexGrow: 1,
    justifyContent: 'flex-start',
  },
  thumb: { width: THUMB_W, alignItems: 'center' },
  /** Vertical only: a fixed box, so the drop calculation has a constant pitch. See THUMB_BOX_H. */
  thumbBoxed: { height: THUMB_BOX_H, justifyContent: 'center' },
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
