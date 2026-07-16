import { Image } from 'expo-image';
import { useCallback, useMemo, useRef, useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { runOnJS, type SharedValue } from 'react-native-reanimated';

import { FontSize, Palette, Radius, Spacing, Weight } from '@/constants/theme';
import { removeSavedSlice, useSavedSlices, type SavedSlice } from '@/data/savedSlices';

const POCKET_W = 63;
const POCKET_H = 88;
/** Thumbnail height for a 1-row slice; a folded 1×2 is twice as wide. */
const THUMB_H = 128;

/**
 * The saved-slice tray — a collapsible strip docked at the bottom of the binder editor. Each slice
 * is a piece cut in the Slice Studio; drag it (web/desktop) or tap-then-tap-a-pocket (touch) onto a
 * page where it legally fits. Placing keeps the slice, so a piece can fill several pockets/pages.
 *
 * Drag/placement resolution lives in BinderScreen (it owns the page grid ref); the tray only owns
 * the gesture and updates the shared ghost position, reporting the release point in window coords.
 */
export function SliceTray({
  armedId,
  onArm,
  onDragStart,
  onDrop,
  onNew,
  ghostOn,
  ghostX,
  ghostY,
}: {
  armedId: string | null;
  onArm: (slice: SavedSlice | null) => void;
  onDragStart: (slice: SavedSlice) => void;
  onDrop: (slice: SavedSlice, windowX: number, windowY: number) => void;
  onNew: () => void;
  ghostOn: SharedValue<number>;
  ghostX: SharedValue<number>;
  ghostY: SharedValue<number>;
}) {
  const slices = useSavedSlices();
  const [open, setOpen] = useState(true);

  // Carousel bookkeeping: where the strip is scrolled to, and how much there is. The arrows page
  // by ~one viewport and only show when there is more content in that direction. Geometry lives
  // in a ref (layout/content-size/scroll events interleave — reading it back from state races);
  // state holds only the derived arrow visibility.
  const scrollRef = useRef<ScrollView>(null);
  const dims = useRef({ x: 0, viewport: 0, content: 0 });
  const [canLeft, setCanLeft] = useState(false);
  const [canRight, setCanRight] = useState(false);

  const updateArrows = useCallback(() => {
    const { x, viewport, content } = dims.current;
    setCanLeft(x > 4);
    setCanRight(viewport > 0 && x + viewport < content - 4);
  }, []);
  const onScroll = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      dims.current.x = e.nativeEvent.contentOffset.x;
      updateArrows();
    },
    [updateArrows]
  );
  const page = useCallback(
    (dir: -1 | 1) => {
      const { x, viewport, content } = dims.current;
      const step = Math.max(viewport * 0.85, THUMB_H);
      const next = Math.min(Math.max(0, content - viewport), Math.max(0, x + dir * step));
      scrollRef.current?.scrollTo({ x: next, animated: true });
      dims.current.x = next;
      updateArrows();
    },
    [updateArrows]
  );

  // Group the pieces cut from one artwork together, newest group first.
  const groups = useMemo(() => {
    const byGroup = new Map<string, SavedSlice[]>();
    for (const s of slices) {
      const key = s.groupId ?? s.id;
      const arr = byGroup.get(key);
      if (arr) arr.push(s);
      else byGroup.set(key, [s]);
    }
    return [...byGroup.entries()].map(([key, items]) => ({ key, label: items[0].label, items }));
  }, [slices]);

  return (
    <View style={styles.tray}>
      <Pressable
        onPress={() => setOpen((o) => !o)}
        style={styles.header}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}>
        <Text style={styles.headerTitle}>
          Slice tray{slices.length ? ` · ${slices.length}` : ''}
        </Text>
        <View style={styles.headerRight}>
          <Pressable onPress={onNew} hitSlop={8} style={styles.newBtn}>
            <Text style={styles.newBtnText}>+ Slice new art</Text>
          </Pressable>
          <Text style={styles.chevron}>{open ? '▾' : '▸'}</Text>
        </View>
      </Pressable>

      {open ? (
        slices.length === 0 ? (
          <View style={styles.empty}>
            <Text style={styles.emptyText}>
              No slices yet. Open the Slice Studio, cut some art, and Save slices. They land here to
              drag into your pockets.
            </Text>
          </View>
        ) : (
          <View style={styles.carousel}>
            <ScrollView
              ref={scrollRef}
              horizontal
              showsHorizontalScrollIndicator={false}
              onScroll={onScroll}
              scrollEventThrottle={16}
              onLayout={(e) => {
                dims.current.viewport = e.nativeEvent.layout.width;
                updateArrows();
              }}
              onContentSizeChange={(w) => {
                dims.current.content = w;
                updateArrows();
              }}
              contentContainerStyle={styles.strip}>
              {groups.map((g) => (
                <View key={g.key} style={styles.group}>
                  {g.items.map((slice) => (
                    <SliceChip
                      key={slice.id}
                      slice={slice}
                      armed={slice.id === armedId}
                      onArm={onArm}
                      onDragStart={onDragStart}
                      onDrop={onDrop}
                      ghostOn={ghostOn}
                      ghostX={ghostX}
                      ghostY={ghostY}
                    />
                  ))}
                </View>
              ))}
            </ScrollView>
            {canLeft ? (
              <Pressable
                onPress={() => page(-1)}
                style={[styles.arrow, styles.arrowLeft]}
                hitSlop={6}
                accessibilityRole="button"
                accessibilityLabel="Scroll slices left">
                <Text style={styles.arrowText}>‹</Text>
              </Pressable>
            ) : null}
            {canRight ? (
              <Pressable
                onPress={() => page(1)}
                style={[styles.arrow, styles.arrowRight]}
                hitSlop={6}
                accessibilityRole="button"
                accessibilityLabel="Scroll slices right">
                <Text style={styles.arrowText}>›</Text>
              </Pressable>
            ) : null}
          </View>
        )
      ) : null}
    </View>
  );
}

/** One draggable/tappable slice, with a shape badge and a remove control. */
function SliceChip({
  slice,
  armed,
  onArm,
  onDragStart,
  onDrop,
  ghostOn,
  ghostX,
  ghostY,
}: {
  slice: SavedSlice;
  armed: boolean;
  onArm: (slice: SavedSlice | null) => void;
  onDragStart: (slice: SavedSlice) => void;
  onDrop: (slice: SavedSlice, windowX: number, windowY: number) => void;
  ghostOn: SharedValue<number>;
  ghostX: SharedValue<number>;
  ghostY: SharedValue<number>;
}) {
  const gesture = useMemo(() => {
    const pan = Gesture.Pan()
      .activeOffsetX([-8, 8])
      .activeOffsetY([-8, 8])
      .onStart((e) => {
        ghostOn.value = 1;
        ghostX.value = e.absoluteX;
        ghostY.value = e.absoluteY;
        runOnJS(onDragStart)(slice);
      })
      .onUpdate((e) => {
        ghostX.value = e.absoluteX;
        ghostY.value = e.absoluteY;
      })
      .onEnd((e) => {
        ghostOn.value = 0;
        runOnJS(onDrop)(slice, e.absoluteX, e.absoluteY);
      })
      .onFinalize(() => {
        ghostOn.value = 0;
      });
    const tap = Gesture.Tap().onEnd(() => {
      runOnJS(onArm)(armed ? null : slice);
    });
    return Gesture.Exclusive(pan, tap);
  }, [slice, armed, onArm, onDragStart, onDrop, ghostOn, ghostX, ghostY]);

  const w = (THUMB_H * (slice.cs * POCKET_W)) / (slice.rs * POCKET_H);

  return (
    <View style={styles.chipWrap}>
      <GestureDetector gesture={gesture}>
        <View style={[styles.chip, { width: w, height: THUMB_H }, armed && styles.chipArmed]}>
          <SliceThumb slice={slice} style={StyleSheet.absoluteFill} />
          <View style={styles.badge}>
            <Text style={styles.badgeText}>
              {slice.rs}×{slice.cs}
            </Text>
          </View>
        </View>
      </GestureDetector>
      <Pressable onPress={() => removeSavedSlice(slice.id)} hitSlop={6} style={styles.remove}>
        <Text style={styles.removeText}>×</Text>
      </Pressable>
    </View>
  );
}

/** Renders a slice's cropped window of its source image (preview quality — flips honoured, a
 *  quarter-turn is left to the true renderer once placed). Exported so the drag ghost reuses it. */
export function SliceThumb({ slice, style }: { slice: SavedSlice; style?: object }) {
  const crop = slice.crop;
  const flipH = slice.transform?.flipH;
  const flipV = slice.transform?.flipV;
  const transform = [{ scaleX: flipH ? -1 : 1 }, { scaleY: flipV ? -1 : 1 }];
  if (!crop) {
    return (
      <View style={[styles.thumb, style]}>
        <Image source={{ uri: slice.imageUrl }} style={[StyleSheet.absoluteFill, { transform }]} contentFit="cover" />
      </View>
    );
  }
  const cw = Math.max(0.02, crop.w);
  const ch = Math.max(0.02, crop.h);
  return (
    <View style={[styles.thumb, style]}>
      <Image
        source={{ uri: slice.imageUrl }}
        style={{
          position: 'absolute',
          width: `${100 / cw}%`,
          height: `${100 / ch}%`,
          left: `${(-crop.x / cw) * 100}%`,
          top: `${(-crop.y / ch) * 100}%`,
          transform,
        }}
        contentFit="cover"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  tray: {
    borderTopWidth: 1,
    borderTopColor: Palette.hairline,
    backgroundColor: Palette.surface,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
  },
  headerTitle: { fontSize: FontSize.label, fontWeight: Weight.bold, color: Palette.ink2 },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three },
  newBtn: { paddingVertical: 4, paddingHorizontal: 10, borderRadius: Radius.pill, backgroundColor: Palette.panel },
  newBtnText: { fontSize: FontSize.sm, fontWeight: Weight.semibold, color: Palette.ink2 },
  chevron: { fontSize: FontSize.md, color: Palette.muted },
  empty: { paddingHorizontal: Spacing.three, paddingBottom: Spacing.three },
  emptyText: { fontSize: FontSize.sm, color: Palette.muted3, lineHeight: 17 },
  carousel: { position: 'relative' },
  strip: { paddingHorizontal: Spacing.three, paddingBottom: Spacing.three, gap: Spacing.three, flexDirection: 'row', alignItems: 'flex-start' },
  group: { flexDirection: 'row', gap: Spacing.two, alignItems: 'flex-start' },
  arrow: {
    position: 'absolute',
    top: '50%',
    marginTop: -22, // half the button height, minus the strip's bottom padding skew
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: Palette.surface,
    borderWidth: 1,
    borderColor: Palette.controlBorder,
    alignItems: 'center',
    justifyContent: 'center',
    // Lift it off the artwork underneath.
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
  arrowLeft: { left: Spacing.two },
  arrowRight: { right: Spacing.two },
  arrowText: { fontSize: 22, lineHeight: 24, color: Palette.ink2, fontWeight: Weight.bold, marginTop: -2 },
  chipWrap: { paddingTop: 6, paddingRight: 6 },
  chip: {
    borderRadius: Radius.thumb,
    overflow: 'hidden',
    backgroundColor: Palette.chromeDeepest,
    borderWidth: 1,
    borderColor: Palette.controlBorder,
  },
  chipArmed: { borderWidth: 2, borderColor: Palette.accent },
  thumb: { overflow: 'hidden', backgroundColor: Palette.chromeDeepest },
  badge: {
    position: 'absolute',
    bottom: 3,
    left: 3,
    paddingHorizontal: 4,
    paddingVertical: 1,
    borderRadius: Radius.tag,
    backgroundColor: Palette.scrim60,
  },
  badgeText: { color: Palette.white, fontSize: FontSize.tag, fontWeight: Weight.bold, letterSpacing: 0.4 },
  remove: {
    position: 'absolute',
    top: 0,
    right: 0,
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: Palette.toast,
    alignItems: 'center',
    justifyContent: 'center',
  },
  removeText: { color: Palette.white, fontSize: FontSize.sm, fontWeight: Weight.bold, lineHeight: 14 },
});
