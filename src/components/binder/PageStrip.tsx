import { useMemo } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { runOnJS, useAnimatedStyle, useSharedValue } from 'react-native-reanimated';

import { BinderGrid } from '@/components/binder/BinderGrid';
import type { DemoPage } from '@/data/binderTypes';

const ITEM_W = 66; // width of each page thumbnail (incl. its margin step)
const THUMB_W = 58;

interface PageStripProps {
  pages: DemoPage[];
  currentIndex: number;
  onSelect: (index: number) => void;
  onReorder: (from: number, to: number) => void;
}

/** Horizontal filmstrip of page thumbnails: tap to jump, long-press then drag to reorder. */
export function PageStrip({ pages, currentIndex, onSelect, onReorder }: PageStripProps) {
  if (pages.length <= 1) return null;
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.row}>
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
    </ScrollView>
  );
}

interface PageThumbProps {
  page: DemoPage;
  index: number;
  count: number;
  current: boolean;
  onSelect: (index: number) => void;
  onReorder: (from: number, to: number) => void;
}

function PageThumb({ page, index, count, current, onSelect, onReorder }: PageThumbProps) {
  const tx = useSharedValue(0);
  const lifted = useSharedValue(0);

  const gesture = useMemo(() => {
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
    const tap = Gesture.Tap().onEnd(() => runOnJS(onSelect)(index));
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
  row: { gap: 8, paddingVertical: 6, paddingHorizontal: 2, alignItems: 'flex-start' },
  thumb: { width: THUMB_W, alignItems: 'center' },
  thumbInner: {
    borderRadius: 10,
    padding: 2,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  thumbCurrent: { borderColor: '#3B82F6' },
  num: { fontSize: 11, color: '#888', marginTop: 2, fontWeight: '600' },
  numCurrent: { color: '#3B82F6' },
});
