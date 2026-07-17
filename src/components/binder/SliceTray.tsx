import { Image } from 'expo-image';
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { runOnJS, type SharedValue } from 'react-native-reanimated';

import { PagedCarousel } from '@/components/PagedCarousel';
import { FontSize, Palette, Radius, Spacing, Weight } from '@/constants/theme';
import { useSavedSlices, type SavedSlice } from '@/data/savedSlices';

const POCKET_W = 63;
const POCKET_H = 88;
/** Thumbnail height for a 1-row slice; a folded 1×2 is twice as wide. */
const THUMB_H = 128;
/** A chip's rendered width from its footprint (pocket aspect at THUMB_H tall). */
const chipWidth = (s: SavedSlice) => (THUMB_H * (s.cs * POCKET_W)) / (s.rs * POCKET_H);
/** chipWrap's paddingRight — part of the space a chip occupies when packing pages. */
const CHIP_PAD = 6;

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
  onRemove,
  onNew,
  ghostOn,
  ghostX,
  ghostY,
}: {
  armedId: string | null;
  onArm: (slice: SavedSlice | null) => void;
  onDragStart: (slice: SavedSlice) => void;
  onDrop: (slice: SavedSlice, windowX: number, windowY: number) => void;
  /** Remove a slice from the tray (the editor confirms if it is placed in any binder). */
  onRemove: (slice: SavedSlice) => void;
  onNew: () => void;
  ghostOn: SharedValue<number>;
  ghostX: SharedValue<number>;
  ghostY: SharedValue<number>;
}) {
  const slices = useSavedSlices();
  const [open, setOpen] = useState(true);
  const [width, setWidth] = useState(0);

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

  // Pack chips into pages of the measured width (PagedCarousel snaps page-by-page and shows the
  // dots). Groups stay in order with a wider gap at each group boundary; a group that doesn't fit
  // simply continues on the next page. `lead` is the chip's gap to its left neighbour on the page.
  const pages = useMemo(() => {
    const capacity = width - Spacing.three * 2; // pageRow's horizontal padding
    if (capacity <= 0) return [];
    const out: { slice: SavedSlice; lead: number }[][] = [];
    let cur: { slice: SavedSlice; lead: number }[] = [];
    let used = 0;
    for (const g of groups) {
      g.items.forEach((slice, idx) => {
        const w = chipWidth(slice) + CHIP_PAD;
        const lead = cur.length === 0 ? 0 : idx === 0 ? Spacing.three : Spacing.two;
        if (cur.length && used + lead + w > capacity) {
          out.push(cur);
          cur = [{ slice, lead: 0 }];
          used = w;
        } else {
          cur.push({ slice, lead });
          used += lead + w;
        }
      });
    }
    if (cur.length) out.push(cur);
    return out;
  }, [groups, width]);

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
          <View key="tray-empty" style={styles.empty}>
            <Text style={styles.emptyText}>
              No slices yet. Open the Slice Studio, cut some art, and Save slices. They land here to
              drag into your pockets.
            </Text>
          </View>
        ) : (
          <View
            // Distinct keys per branch: without them React updates the empty-state View in place
            // when slices arrive, and react-native-web never attaches onLayout to the reused node,
            // so the strip stays width 0 and renders nothing.
            key="tray-strip"
            style={styles.carousel}
            onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
            <PagedCarousel
              width={width}
              prevLabel="Previous slices"
              nextLabel="More slices"
              pages={pages.map((items, pi) => (
                <View key={pi} style={styles.pageRow}>
                  {items.map(({ slice, lead }) => (
                    <View key={slice.id} style={{ marginLeft: lead }}>
                      <SliceChip
                        slice={slice}
                        armed={slice.id === armedId}
                        onArm={onArm}
                        onRemove={onRemove}
                        onDragStart={onDragStart}
                        onDrop={onDrop}
                        ghostOn={ghostOn}
                        ghostX={ghostX}
                        ghostY={ghostY}
                      />
                    </View>
                  ))}
                </View>
              ))}
            />
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
  onRemove,
  ghostOn,
  ghostX,
  ghostY,
}: {
  slice: SavedSlice;
  armed: boolean;
  onArm: (slice: SavedSlice | null) => void;
  onDragStart: (slice: SavedSlice) => void;
  onDrop: (slice: SavedSlice, windowX: number, windowY: number) => void;
  onRemove: (slice: SavedSlice) => void;
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
      <Pressable
        onPress={() => onRemove(slice)}
        hitSlop={6}
        accessibilityLabel="Remove slice"
        style={styles.remove}>
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
  carousel: { paddingBottom: Spacing.two },
  pageRow: { flexDirection: 'row', alignItems: 'flex-start', paddingHorizontal: Spacing.three },
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
