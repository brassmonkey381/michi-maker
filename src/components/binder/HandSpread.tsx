/**
 * THE HAND, SPREAD ACROSS THE SCREEN (MIC-017, owner 2026-11-11: "blow up our hand and have it
 * shoot out across the screen, with the cards shaking a little bit, waiting to get selected ...
 * scale up their sizes for much easier viewing, and then pick one to add while getting a good look
 * at it first ... an option to cancel and go back to the hand dock"; then "reduce the wobble to
 * like 25%" and "a button for next 12").
 *
 * Phones. A full-screen layer over everything (TopLayer): the hand's cards fly out from the dock to
 * a 3 x 4 grid as large as the screen allows, each with a gentle idle wobble (0.4 degrees). Sets
 * of 12: "Next 12" / "Back" or a sideways swipe. Tapping a card lifts it to a big preview with
 * Back and "Add to page" (the next empty pocket on the page in view). The close, a tap on the
 * dark ground or a swipe down sends the cards back. Reduced motion: no flight, no wobble.
 */
import { Image } from 'expo-image';
import { useEffect, useMemo, useState } from 'react';
import { AccessibilityInfo, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { Easing, runOnJS, useAnimatedStyle, useSharedValue, withDelay, withRepeat, withSequence, withTiming } from 'react-native-reanimated';

import { TopLayer } from '@/components/binder/TopLayer';
import type { DemoSlot } from '@/data/binderTypes';
import { cardThumbUrl } from '@/lib/catalogConfig';

const PER = 12;
const COLS = 3;
const ROWS = 4;
const GAP = 10;
const ASPECT = 88 / 63;

interface Props {
  slots: readonly DemoSlot[];
  /** Where the dock's cards sit in the window, so the spread flies out of it. */
  dockTop: number;
  onAdd: (slot: DemoSlot) => void;
  onClose: () => void;
}

export function HandSpread({ slots, dockTop, onAdd, onClose }: Props) {
  const { width: winW, height: winH } = useWindowDimensions();
  const [reduce, setReduce] = useState(false);
  useEffect(() => {
    let live = true;
    AccessibilityInfo.isReduceMotionEnabled().then((on) => live && setReduce(on)).catch(() => {});
    return () => {
      live = false;
    };
  }, []);
  const cards = useMemo(() => slots.filter((s) => s.cardId), [slots]);
  const pages = Math.max(1, Math.ceil(cards.length / PER));
  const [page, setPage] = useState(0);
  const [turn, setTurn] = useState(0);
  const [peek, setPeek] = useState<DemoSlot | null>(null);
  const shown = cards.slice(page * PER, page * PER + PER);

  // The grid: as large as the screen allows under the bar and above the nav row.
  const top = 60;
  const navH = cards.length > PER ? 64 : 24;
  const cardW = Math.floor(Math.min((winW - 32 - (COLS - 1) * GAP) / COLS, ((winH - top - navH - (ROWS - 1) * GAP) / ROWS) / ASPECT));
  const cardH = Math.round(cardW * ASPECT);
  const left0 = (winW - (COLS * cardW + (COLS - 1) * GAP)) / 2;
  const spot = (k: number) => ({ x: left0 + (k % COLS) * (cardW + GAP), y: top + Math.floor(k / COLS) * (cardH + GAP) });

  const go = (d: number) => {
    const np = page + d;
    if (np < 0 || np >= pages) return;
    setPage(np);
    setTurn((t) => t + 1);
  };

  const swipe = Gesture.Pan()
    .minDistance(24)
    .onEnd((e) => {
      if (e.translationY > 80 && Math.abs(e.translationY) > Math.abs(e.translationX)) runOnJS(onClose)();
      else if (Math.abs(e.translationX) > 60 && Math.abs(e.translationX) > Math.abs(e.translationY)) runOnJS(go)(e.translationX < 0 ? 1 : -1);
    });

  const from = page * PER;
  return (
    <TopLayer>
      <GestureDetector gesture={swipe}>
        <View style={[styles.layer, { width: winW, height: winH }]} testID="hand-spread">
          <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Put the cards back in the hand" />
          <View style={styles.bar} pointerEvents="box-none">
            <Text style={styles.barText}>Your hand · {cards.length}</Text>
            <Pressable onPress={onClose} hitSlop={8} accessibilityRole="button" accessibilityLabel="Back to the hand" style={styles.x} testID="hand-spread-close">
              <Text style={styles.xText}>✕</Text>
            </Pressable>
          </View>
          {shown.map((slot, k) => (
            <SpreadCard
              key={`${turn}-${slot.id}`}
              slot={slot}
              order={k}
              to={spot(k)}
              fromY={dockTop}
              w={cardW}
              h={cardH}
              winW={winW}
              reduce={reduce}
              onPress={() => setPeek(slot)}
            />
          ))}
          {cards.length > PER ? (
            <View style={styles.nav} pointerEvents="box-none">
              <Pressable onPress={() => go(-1)} disabled={page === 0} accessibilityRole="button" accessibilityLabel="Previous 12 cards" style={[styles.navBtn, page === 0 && styles.navOff]} testID="hand-spread-prev">
                <Text style={styles.navText}>‹ Back</Text>
              </Pressable>
              <Text style={styles.navCount}>{`${from + 1}–${from + shown.length} of ${cards.length}`}</Text>
              <Pressable onPress={() => go(1)} disabled={page >= pages - 1} accessibilityRole="button" accessibilityLabel="Next 12 cards" style={[styles.navBtn, page >= pages - 1 && styles.navOff]} testID="hand-spread-next">
                <Text style={styles.navText}>{`Next ${Math.min(PER, cards.length - from - shown.length) || PER} ›`}</Text>
              </Pressable>
            </View>
          ) : null}
          {peek?.cardId ? (
            <View style={[styles.peek, { width: winW, height: winH }]} testID="hand-spread-preview">
              <Pressable style={StyleSheet.absoluteFill} onPress={() => setPeek(null)} accessibilityLabel="Back to the spread" />
              <Image source={{ uri: cardThumbUrl(peek.cardId, 640) }} style={{ width: Math.min(300, winW - 60), height: Math.min(300, winW - 60) * ASPECT, borderRadius: 12 }} contentFit="cover" transition={0} />
              <View style={styles.peekBtns}>
                <Pressable onPress={() => setPeek(null)} accessibilityRole="button" style={[styles.peekBtn, styles.peekBack]}>
                  <Text style={styles.peekBackText}>Back</Text>
                </Pressable>
                <Pressable
                  onPress={() => {
                    const s = peek;
                    setPeek(null);
                    onAdd(s);
                  }}
                  accessibilityRole="button"
                  style={[styles.peekBtn, styles.peekAdd]}
                  testID="hand-spread-add">
                  <Text style={styles.peekAddText}>Add to page</Text>
                </Pressable>
              </View>
            </View>
          ) : null}
        </View>
      </GestureDetector>
    </TopLayer>
  );
}

/** One card: flies from the dock to its place (staggered), then wobbles gently until picked. */
function SpreadCard({
  slot,
  order,
  to,
  fromY,
  w,
  h,
  winW,
  reduce,
  onPress,
}: {
  slot: DemoSlot;
  order: number;
  to: { x: number; y: number };
  fromY: number;
  w: number;
  h: number;
  winW: number;
  reduce: boolean;
  onPress: () => void;
}) {
  const t = useSharedValue(reduce ? 1 : 0);
  const wob = useSharedValue(0);
  useEffect(() => {
    if (reduce) return;
    t.value = withDelay(order * 30, withTiming(1, { duration: 480, easing: Easing.out(Easing.back(1.2)) }));
    wob.value = withDelay(
      600 + ((order * 370) % 2400),
      withRepeat(withSequence(withTiming(1, { duration: 1200, easing: Easing.inOut(Easing.sin) }), withTiming(-1, { duration: 1200, easing: Easing.inOut(Easing.sin) })), -1, true),
    );
  }, [reduce, order, t, wob]);
  // The dock: a small card along the bottom, spaced across the width.
  const startX = 16 + ((order % 6) * (winW - 72)) / 6;
  const startY = fromY + Math.floor(order / 6) * 30;
  const style = useAnimatedStyle(() => {
    const k = t.value;
    const s = 0.3 + 0.7 * k;
    return {
      opacity: Math.min(1, k * 3),
      transform: [
        { translateX: startX + (to.x - startX) * k },
        { translateY: startY + (to.y - startY) * k },
        { scale: s },
        { rotate: `${wob.value * 0.4}deg` },
        { translateY: -wob.value * 0.5 },
      ],
    };
  });
  return (
    <Animated.View style={[styles.card, { width: w, height: h }, style]}>
      <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel="Look closer" style={StyleSheet.absoluteFill} testID="hand-spread-card">
        <Image source={{ uri: cardThumbUrl(slot.cardId!, w > 150 ? 640 : 245) }} style={StyleSheet.absoluteFill} contentFit="cover" transition={0} />
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  layer: { position: 'absolute', left: 0, top: 0, backgroundColor: 'rgba(12,14,22,0.86)', pointerEvents: 'auto' } as object,
  bar: { position: 'absolute', left: 0, right: 0, top: 0, height: 56, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16 },
  barText: { color: '#fff', fontWeight: '700', fontSize: 16 },
  x: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.35)', backgroundColor: 'rgba(255,255,255,0.12)' },
  xText: { color: '#fff', fontSize: 18, fontWeight: '700' },
  card: { position: 'absolute', left: 0, top: 0, borderRadius: 7, overflow: 'hidden', backgroundColor: '#ddd', shadowColor: '#000', shadowOpacity: 0.35, shadowRadius: 9, shadowOffset: { width: 0, height: 6 }, elevation: 8 },
  nav: { position: 'absolute', left: 0, right: 0, bottom: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 14 },
  navBtn: { minHeight: 40, paddingHorizontal: 16, justifyContent: 'center', borderRadius: 999, borderWidth: 1, borderColor: 'rgba(255,255,255,0.35)', backgroundColor: 'rgba(255,255,255,0.12)' },
  navOff: { opacity: 0.3 },
  navText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  navCount: { color: '#fff', fontSize: 14, minWidth: 92, textAlign: 'center' },
  peek: { position: 'absolute', left: 0, top: 0, alignItems: 'center', justifyContent: 'center', gap: 16, backgroundColor: 'rgba(12,14,22,0.6)' },
  peekBtns: { flexDirection: 'row', gap: 10 },
  peekBtn: { minHeight: 46, paddingHorizontal: 22, borderRadius: 999, justifyContent: 'center' },
  peekBack: { borderWidth: 1, borderColor: 'rgba(255,255,255,0.35)', backgroundColor: 'rgba(255,255,255,0.15)' },
  peekBackText: { color: '#fff', fontWeight: '700', fontSize: 16 },
  peekAdd: { backgroundColor: '#3b82f6' },
  peekAddText: { color: '#fff', fontWeight: '700', fontSize: 16 },
});
