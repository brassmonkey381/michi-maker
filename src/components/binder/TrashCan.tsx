/**
 * THE EDITOR'S TRASH CAN (MIC-017, owner 2026-11-11): "a TRASHCAN icon somewhere where users can
 * drag a card to from the hand or a binder page to get rid of it. the icon should grow in size,
 * animate, color switch, etc, when a card is in range and can be released to be thrown in the
 * trash."
 *
 * It slides in at the bottom centre of the screen, only while a card is being dragged. While the pointer
 * is over it (with RANGE px of slack), it is HOT: it grows, turns red, tips its lid open and
 * wiggles, and `onHot` tells the editor a release here throws the card away. The editor decides
 * what that means (a hand card leaves the hand, a page card empties its pocket) and offers Undo.
 *
 * The pointer is read from window pointer events, which keep arriving while a gesture holds the
 * pointer (web). `rect()` lets the editor also test a drop point on platforms without them.
 */
import { useEffect, useRef, useState } from 'react';
import { Platform, StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import { Palette } from '@/constants/theme';

const SIZE = 56;
const HOT = '#d64545';
const RANGE = 24;

export interface TrashRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface TrashCanProps {
  /** A card is being dragged: show the can. */
  active: boolean;
  /** Distance from the screen's bottom edge (the phone's tool bar). */
  bottom: number;
  /** Hot changed: a release now throws the card away. */
  onHot: (hot: boolean) => void;
  /** The can's window rectangle, for a drop-point test. */
  rectRef?: { current: TrashRect | null };
}

export function TrashCan({ active, bottom, onHot, rectRef }: TrashCanProps) {
  const ref = useRef<View>(null);
  const [hot, setHot] = useState(false);
  const hotRef = useRef(false);
  const shown = useSharedValue(0);
  const heat = useSharedValue(0);
  const wiggle = useSharedValue(0);

  useEffect(() => {
    shown.value = withTiming(active ? 1 : 0, { duration: active ? 180 : 140, easing: Easing.out(Easing.cubic) });
    if (!active && hotRef.current) {
      hotRef.current = false;
      setHot(false);
      onHot(false);
    }
  }, [active, shown, onHot]);

  useEffect(() => {
    heat.value = withSpring(hot ? 1 : 0, { damping: 12, stiffness: 220 });
    wiggle.value = hot
      ? withRepeat(withSequence(withTiming(-7, { duration: 70 }), withTiming(7, { duration: 120 }), withTiming(0, { duration: 70 })), -1)
      : withTiming(0, { duration: 80 });
  }, [hot, heat, wiggle]);

  // Where the can is, re-read when it appears (the page may have scrolled since).
  useEffect(() => {
    if (!active) return;
    const read = () =>
      ref.current?.measureInWindow((x, y, w, h) => {
        if (rectRef && w) rectRef.current = { x, y, w, h };
      });
    const t = setTimeout(read, 200);
    read();
    return () => clearTimeout(t);
  }, [active, rectRef, bottom]);

  // The pointer, while a drag is on (web: window events still arrive during a held gesture).
  useEffect(() => {
    if (!active || Platform.OS !== 'web' || typeof window === 'undefined') return;
    const onMove = (e: PointerEvent | TouchEvent) => {
      const p = 'touches' in e ? e.touches[0] : e;
      const r = rectRef?.current;
      if (!p || !r) return;
      const inside = p.clientX >= r.x - RANGE && p.clientX <= r.x + r.w + RANGE && p.clientY >= r.y - RANGE && p.clientY <= r.y + r.h + RANGE;
      if (inside !== hotRef.current) {
        hotRef.current = inside;
        setHot(inside);
        onHot(inside);
      }
    };
    window.addEventListener('pointermove', onMove as EventListener, { passive: true });
    window.addEventListener('touchmove', onMove as EventListener, { passive: true });
    return () => {
      window.removeEventListener('pointermove', onMove as EventListener);
      window.removeEventListener('touchmove', onMove as EventListener);
    };
  }, [active, rectRef, onHot]);

  const wrapStyle = useAnimatedStyle(() => ({
    opacity: shown.value,
    transform: [{ translateY: (1 - shown.value) * 40 }, { scale: 1 + heat.value * 0.35 }, { rotate: `${wiggle.value}deg` }],
  }));
  const lidStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: -heat.value * 5 }, { translateX: -heat.value * 4 }, { rotate: `${-heat.value * 28}deg` }],
  }));

  const ink = hot ? '#ffffff' : Palette.ink;
  return (
    <Animated.View
      ref={ref as never}
      pointerEvents="none"
      collapsable={false}
      style={[
        styles.can,
        hot ? styles.canHot : null,
        place(bottom),
        wrapStyle,
      ]}
      accessibilityElementsHidden={!active}
      accessibilityLabel={hot ? 'Release to throw the card away' : 'Trash: drag a card here to throw it away'}
      testID={hot ? 'editor-trash-hot' : 'editor-trash'}>
      {/* Drawn with views (no SVG dependency): a lid with its handle, a body with three ribs. */}
      <Animated.View style={[styles.lid, lidStyle]}>
        <View style={[styles.handle, { backgroundColor: ink }]} />
        <View style={[styles.lidBar, { backgroundColor: ink }]} />
      </Animated.View>
      <View style={[styles.body, { backgroundColor: ink }]}>
        {[0, 1, 2].map((i) => (
          <View key={i} style={[styles.rib, { backgroundColor: hot ? HOT : Palette.panel }]} />
        ))}
      </View>
      {hot ? <Text style={styles.label}>Release</Text> : null}
    </Animated.View>
  );
}

/**
 * ONE PLACE, ALWAYS (owner, 2026-11-11: "just ONE trash icon, in the same spot always"): bottom
 * centre of the screen, whatever the hand is doing; on a phone, just above the tool bar.
 */
function place(bottom: number): object {
  const at = { left: '50%', marginLeft: -SIZE / 2, bottom: bottom + 18 };
  return Platform.OS === 'web' ? ({ position: 'fixed', ...at } as unknown as object) : at;
}

const styles = StyleSheet.create({
  can: {
    position: 'absolute',
    width: SIZE,
    height: SIZE,
    borderRadius: SIZE / 2,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Palette.panel,
    borderWidth: 1,
    borderColor: Palette.hairline,
    zIndex: 400,
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 6,
  },
  canHot: { backgroundColor: HOT, borderColor: '#b33232' },
  lid: { alignItems: 'center', marginBottom: 1 },
  handle: { width: 8, height: 3, borderTopLeftRadius: 2, borderTopRightRadius: 2 },
  lidBar: { width: 26, height: 3, borderRadius: 1.5 },
  body: { width: 20, height: 20, borderBottomLeftRadius: 4, borderBottomRightRadius: 4, flexDirection: 'row', justifyContent: 'space-evenly', alignItems: 'center', paddingVertical: 4 },
  rib: { width: 2, height: '100%', borderRadius: 1 },
  // A white pill, so the word reads over card art as well as over the page.
  label: { position: 'absolute', top: -22, fontSize: 11, fontWeight: '700', color: HOT, backgroundColor: '#ffffff', paddingHorizontal: 6, paddingVertical: 1, borderRadius: 8, overflow: 'hidden' },
});
