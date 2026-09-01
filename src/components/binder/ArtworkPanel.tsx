/**
 * THE ARTWORK PANEL — the slice tray, given room to be browsed.
 *
 * The picker's Artwork tab used to embed the whole Slice Studio. That was the wrong thing in the
 * wrong place twice over. The studio is a WORKSPACE — a page-shaped canvas, a control column beside
 * it, and a two-column layout that wants 800px before it unstacks — so it could never dock, which
 * is why the picker had a special case forcing the Artwork tab back to a full-width sheet. And it
 * put the cutting tool where you go to PLACE art, when the thing that actually fills a pocket is
 * the tray: the studio saves pieces, and only the tray can put one in a pocket.
 *
 * So the tab shows the tray, and the studio is a button on it. That removes the docking exception
 * (a tray docks fine), it puts the placing surface where placing happens, and it means the panel
 * beside your binder is the pieces you cut rather than the tool you cut them with.
 *
 * It shares the chips — and therefore the drag — with the bottom tray rather than copying them: the
 * gesture reports window-absolute coordinates because that is the space the drop hit-test works in,
 * and a second implementation of that is a second thing to get subtly wrong. Both read the same
 * `useSavedSlices()` store, so a piece cut in the studio appears in both at once.
 */
import { useMemo } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { SharedValue } from 'react-native-reanimated';

import { SliceChip } from '@/components/binder/SliceTray';
import { ThemedText } from '@/components/themed-text';
import { FontSize, Palette, Radius, Spacing, Weight } from '@/constants/theme';
import { useSavedSlices, type SavedSlice } from '@/data/savedSlices';

export function ArtworkPanel({
  armedId,
  onArm,
  onDragStart,
  onDrop,
  onRemove,
  onNewSlice,
  ghostOn,
  ghostX,
  ghostY,
}: {
  armedId: string | null;
  onArm: (slice: SavedSlice | null) => void;
  onDragStart: (slice: SavedSlice) => void;
  onDrop: (slice: SavedSlice, windowX: number, windowY: number) => void;
  onRemove: (slice: SavedSlice) => void;
  /** Opens the Slice Studio — full screen, because that is the room it needs. */
  onNewSlice: () => void;
  ghostOn: SharedValue<number>;
  ghostX: SharedValue<number>;
  ghostY: SharedValue<number>;
}) {
  const slices = useSavedSlices();

  /**
   * Pieces cut from one picture stay together and in cutting order, so a sliced 3x3 reads as the
   * nine parts of one thing rather than nine unrelated chips. `groupId` is stamped per save; older
   * rows without one stand alone.
   */
  const groups = useMemo(() => {
    const out: { key: string; items: SavedSlice[] }[] = [];
    for (const slice of slices) {
      const key = slice.groupId ?? slice.id;
      const last = out[out.length - 1];
      if (last && last.key === key) last.items.push(slice);
      else out.push({ key, items: [slice] });
    }
    return out;
  }, [slices]);

  return (
    <View style={styles.panel}>
      <View style={styles.head}>
        <ThemedText type="subtitle" style={styles.title}>
          Artwork{slices.length ? ` · ${slices.length}` : ''}
        </ThemedText>
        <Pressable
          onPress={onNewSlice}
          accessibilityRole="button"
          style={({ pressed }) => [styles.newBtn, pressed && styles.pressed]}>
          <Text style={styles.newBtnText}>＋ Slice new art</Text>
        </Pressable>
      </View>

      {slices.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyText}>
            No pieces yet. Slice some art and the parts land here — then drag one into a pocket, or
            tap it and tap the pocket.
          </Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
          <Text style={styles.hint}>Drag a piece into a pocket, or tap it then tap the pocket.</Text>
          {groups.map((group) => (
            // One row per picture, wrapping — so the nine pieces of a sliced page sit together and
            // a tall panel shows several pictures at once instead of one long line.
            <View key={group.key} style={styles.group}>
              {group.items.map((slice) => (
                <SliceChip
                  key={slice.id}
                  slice={slice}
                  armed={slice.id === armedId}
                  onArm={onArm}
                  onDragStart={onDragStart}
                  onDrop={onDrop}
                  onRemove={onRemove}
                  ghostOn={ghostOn}
                  ghostX={ghostX}
                  ghostY={ghostY}
                />
              ))}
            </View>
          ))}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  panel: { flex: 1, minHeight: 0 },
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: Spacing.two,
    paddingBottom: Spacing.two,
  },
  title: { fontSize: FontSize.md },
  newBtn: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: Radius.pill,
    backgroundColor: Palette.accent,
  },
  newBtnText: { color: Palette.white, fontSize: FontSize.label, fontWeight: Weight.semibold },
  pressed: { opacity: 0.7 },
  scroll: { gap: Spacing.three, paddingBottom: Spacing.four },
  hint: { fontSize: FontSize.sm, color: Palette.muted2, lineHeight: 16 },
  /** Wrapping, not a carousel: a docked panel is tall and narrow, the opposite of the bottom tray. */
  group: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  empty: { paddingVertical: Spacing.four },
  emptyText: { fontSize: FontSize.sm, color: Palette.muted3, lineHeight: 18 },
});
