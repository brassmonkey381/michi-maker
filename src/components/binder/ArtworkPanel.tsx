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
 *
 * BUILT FOR FIVE HUNDRED PIECES (owner, 2026-09-15). Three things keep it quick:
 *   - The groups are a virtualised list, so only the rows on screen are mounted. A group is one
 *     picture's pieces, wrapping, which keeps a row a sensible height.
 *   - The chips are memoised and the callbacks handed to them never change identity (they read the
 *     latest handlers through a ref), so arming one chip re-renders one chip.
 *   - Search and sort are one pass over the list, memoised on the query and the list.
 */
import { useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import type { SharedValue } from 'react-native-reanimated';

import { SliceChip } from '@/components/binder/SliceTray';
import { ThemedText } from '@/components/themed-text';
import { FontSize, Palette, Radius, Spacing, Weight } from '@/constants/theme';
import { domainOf } from '@/data/artworkLibrary';
import { useSavedSlices, type SavedSlice } from '@/data/savedSlices';

type Sort = 'newest' | 'oldest' | 'source' | 'largest';
const SORTS: { id: Sort; label: string }[] = [
  { id: 'newest', label: 'Newest' },
  { id: 'oldest', label: 'Oldest' },
  { id: 'source', label: 'By source' },
  { id: 'largest', label: 'Most pieces' },
];

interface Group {
  key: string;
  items: SavedSlice[];
  /** What the group is called: the label, else the source's domain. */
  name: string;
  newest: string;
}

/** What a piece can be found by: its label, its source, and its footprint. */
function haystack(s: SavedSlice): string {
  const a = s.attribution as { title?: string; author?: string; sourceUrl?: string } | undefined;
  return [s.label, domainOf(s.imageUrl), a?.title, a?.author, a?.sourceUrl, `${s.rs}x${s.cs}`].filter(Boolean).join(' ').toLowerCase();
}

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
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<Sort>('newest');

  // THE HANDLERS, BEHIND A REF. The caller passes new closures every render; the chips are
  // memoised, so they are handed these four, which never change, and read the latest through it.
  const handlers = useRef({ onArm, onDragStart, onDrop, onRemove });
  useLayoutEffect(() => {
    handlers.current = { onArm, onDragStart, onDrop, onRemove };
  });
  const arm = useCallback((s: SavedSlice | null) => handlers.current.onArm(s), []);
  const dragStart = useCallback((s: SavedSlice) => handlers.current.onDragStart(s), []);
  const drop = useCallback((s: SavedSlice, x: number, y: number) => handlers.current.onDrop(s, x, y), []);
  const remove = useCallback((s: SavedSlice) => handlers.current.onRemove(s), []);

  /**
   * Pieces cut from one picture stay together and in cutting order, so a sliced 3x3 reads as the
   * nine parts of one thing rather than nine unrelated chips. `groupId` is stamped per save; older
   * rows without one stand alone.
   */
  const groups = useMemo(() => {
    const q = query.trim().toLowerCase();
    const byKey = new Map<string, Group>();
    for (const slice of slices) {
      if (q && !haystack(slice).includes(q)) continue;
      const key = slice.groupId ?? slice.id;
      let g = byKey.get(key);
      if (!g) {
        g = { key, items: [], name: slice.label ?? domainOf(slice.imageUrl) ?? 'Pieces', newest: slice.createdAt ?? '' };
        byKey.set(key, g);
      }
      g.items.push(slice);
      if ((slice.createdAt ?? '') > g.newest) g.newest = slice.createdAt ?? '';
    }
    const out = [...byKey.values()];
    if (sort === 'newest') out.sort((a, b) => b.newest.localeCompare(a.newest));
    else if (sort === 'oldest') out.sort((a, b) => a.newest.localeCompare(b.newest));
    else if (sort === 'source') out.sort((a, b) => a.name.localeCompare(b.name) || b.newest.localeCompare(a.newest));
    else out.sort((a, b) => b.items.length - a.items.length || b.newest.localeCompare(a.newest));
    return out;
  }, [slices, query, sort]);
  const shown = groups.reduce((n, g) => n + g.items.length, 0);

  const renderGroup = useCallback(
    ({ item: group }: { item: Group }) => (
      // One row per picture, wrapping — so the nine pieces of a sliced page sit together and a
      // tall panel shows several pictures at once instead of one long line.
      <View style={styles.groupBlock}>
        {group.items.length > 1 ? (
          <Text style={styles.groupName} numberOfLines={1}>
            {group.name} · {group.items.length}
          </Text>
        ) : null}
        <View style={styles.group}>
          {group.items.map((slice) => (
            <SliceChip
              key={slice.id}
              slice={slice}
              armed={slice.id === armedId}
              onArm={arm}
              onDragStart={dragStart}
              onDrop={drop}
              onRemove={remove}
              ghostOn={ghostOn}
              ghostX={ghostX}
              ghostY={ghostY}
            />
          ))}
        </View>
      </View>
    ),
    [armedId, arm, dragStart, drop, remove, ghostOn, ghostX, ghostY],
  );

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
        <>
          {/* Worth its row from a dozen pieces up; below that the whole tray is on screen anyway. */}
          {slices.length >= 12 ? (
            <View style={styles.tools}>
              <TextInput
                value={query}
                onChangeText={setQuery}
                placeholder="Search by source, name or size…"
                placeholderTextColor={Palette.muted}
                autoCapitalize="none"
                autoCorrect={false}
                clearButtonMode="while-editing"
                testID="artwork-search"
                style={styles.search}
              />
              <View style={styles.sorts}>
                {SORTS.map((s) => (
                  <Pressable
                    key={s.id}
                    onPress={() => setSort(s.id)}
                    accessibilityRole="button"
                    accessibilityState={{ selected: sort === s.id }}
                    style={[styles.sortChip, sort === s.id && styles.sortChipOn]}>
                    <Text style={[styles.sortText, sort === s.id && styles.sortTextOn]}>{s.label}</Text>
                  </Pressable>
                ))}
              </View>
            </View>
          ) : null}
          <FlatList
            data={groups}
            keyExtractor={(g) => g.key}
            renderItem={renderGroup}
            extraData={armedId}
            contentContainerStyle={styles.scroll}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            initialNumToRender={8}
            maxToRenderPerBatch={8}
            windowSize={7}
            removeClippedSubviews
            ListHeaderComponent={
              <Text style={styles.hint}>
                {query.trim() ? `${shown} of ${slices.length} pieces match.` : 'Drag a piece into a pocket, or tap it then tap the pocket.'}
              </Text>
            }
            ListEmptyComponent={<Text style={styles.emptyText}>Nothing matches that. Try the source site, or a size like 1x2.</Text>}
          />
        </>
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
  tools: { gap: 6, paddingBottom: Spacing.two },
  search: { height: 34, paddingHorizontal: 10, borderRadius: Radius.control, backgroundColor: Palette.panel, color: Palette.ink, fontSize: FontSize.label },
  sorts: { flexDirection: 'row', flexWrap: 'wrap', gap: 4 },
  sortChip: { paddingVertical: 3, paddingHorizontal: 9, borderRadius: Radius.pill, backgroundColor: Palette.panel },
  sortChipOn: { backgroundColor: Palette.accent },
  sortText: { fontSize: FontSize.sm, fontWeight: Weight.semibold, color: Palette.muted2 },
  sortTextOn: { color: Palette.accentText },
  scroll: { gap: Spacing.three, paddingBottom: Spacing.four },
  hint: { fontSize: FontSize.sm, color: Palette.muted2, lineHeight: 16 },
  groupBlock: { gap: 4 },
  groupName: { fontSize: FontSize.xs, color: Palette.muted, fontWeight: Weight.semibold, textTransform: 'uppercase', letterSpacing: 0.4 },
  /** Wrapping, not a carousel: a docked panel is tall and narrow, the opposite of the bottom tray. */
  group: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  empty: { paddingVertical: Spacing.four },
  emptyText: { fontSize: FontSize.sm, color: Palette.muted3, lineHeight: 18 },
});
