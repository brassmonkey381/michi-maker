/**
 * Search-by-color sheet — two modes over the kit's color client:
 *   · PICK    — a gradient mix bar with up to 3 draggable color STOPS (positions set the weights)
 *               + a continuous HSV picker per stop → cards whose palette best matches that weighted
 *               mix (the SAME set-distance the similarity metric uses).
 *   · SIMILAR — seeded from a card → cards with the nearest palette (find_similar_by_color).
 * Region toggle: full card face ("Full art") vs illustration window ("Art panel"). Results are card
 * ids rendered by thumbnail; tapping one bubbles up (→ add to a binder). On-device when the color
 * blob is loaded (instant), else the data-server RPCs (debounced).
 */
import { Image } from 'expo-image';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import {
  cardThumbUrl,
  findSimilarByColor,
  searchByColors,
  srgbToLab,
  useColorIndex,
  type ColorRegion,
  type Lab,
} from 'tcgscan-browse';

import { GradientMixBar, HsvColorPicker, stopWeights, type Stop } from '@/components/color/ColorPicker';
import { FontSize, Palette, Radius, Spacing, Weight } from '@/constants/theme';

const REGIONS: { value: ColorRegion; label: string }[] = [
  { value: 'noborder', label: 'Full art' },
  { value: 'art', label: 'Art panel' },
];

export function ColorSearchSheet({
  seedCardId,
  seedName,
  onPickCard,
  onClose,
}: {
  seedCardId?: string;
  seedName?: string;
  onPickCard: (cardId: string) => void;
  onClose: () => void;
}) {
  const colorIndex = useColorIndex(true);
  const [region, setRegion] = useState<ColorRegion>('noborder');
  // Three color stops (primary / secondary / tertiary) along the mix bar.
  const [stops, setStops] = useState<Stop[]>([
    { pos: 0.2, rgb: [226, 59, 59] },
    { pos: 0.5, rgb: [59, 123, 226] },
    { pos: 0.8, rgb: [237, 226, 58] },
  ]);
  const [editing, setEditing] = useState<number | null>(null);
  const [ids, setIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);

  const similarUnavailable = Boolean(seedCardId) && !(colorIndex && seedCardId && colorIndex.has(seedCardId));

  // Weighted query palette from the stops (positions → weights that sum to 1).
  const query = useMemo<Lab[]>(() => {
    const w = stopWeights(stops);
    return stops.map((s, i) => ({ ...srgbToLab(s.rgb[0], s.rgb[1], s.rgb[2]), w: w[i] })).filter((c) => c.w > 0);
  }, [stops]);

  const run = useCallback(async () => {
    setLoading(true);
    let result: string[] = [];
    if (seedCardId) {
      if (colorIndex?.has(seedCardId)) result = await findSimilarByColor(seedCardId, region, { limit: 60 });
    } else if (query.length) {
      result = await searchByColors(query, region, { limit: 60 });
    }
    setIds(result);
    setLoading(false);
  }, [seedCardId, colorIndex, query, region]);

  // Debounce so dragging a stop fires one query when it settles (on-device is instant either way).
  useEffect(() => {
    const t = setTimeout(run, 250);
    return () => clearTimeout(t);
  }, [run]);

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
          <View style={styles.headerRow}>
            <Text style={styles.title} numberOfLines={1}>
              {seedCardId ? `Similar by color${seedName ? ` · ${seedName}` : ''}` : 'Search by color'}
            </Text>
            <Pressable onPress={onClose} hitSlop={10}>
              <Text style={styles.close}>✕</Text>
            </Pressable>
          </View>

          {/* Region toggle */}
          <View style={styles.regionRow}>
            {REGIONS.map((r) => {
              const on = r.value === region;
              return (
                <Pressable key={r.value} onPress={() => setRegion(r.value)} style={[styles.regionBtn, on && styles.regionBtnOn]}>
                  <Text style={[styles.regionTxt, on && styles.regionTxtOn]}>{r.label}</Text>
                </Pressable>
              );
            })}
          </View>

          {/* Gradient mix bar + per-stop HSV picker (PICK mode only) */}
          {!seedCardId ? (
            <View style={styles.picker}>
              <Text style={styles.hint}>Drag the stops to reweight · tap a stop to change its color</Text>
              <GradientMixBar stops={stops} onChange={setStops} onEditColor={setEditing} />
              {editing !== null ? (
                <HsvColorPicker
                  rgb={stops[editing].rgb}
                  onChange={(rgb) => setStops((prev) => prev.map((s, i) => (i === editing ? { ...s, rgb } : s)))}
                  onClose={() => setEditing(null)}
                />
              ) : null}
            </View>
          ) : null}

          {/* Results */}
          {similarUnavailable ? (
            <View style={styles.center}>
              <Text style={styles.empty}>
                Similar-by-color needs the on-device color data (still publishing). Try the color picker meanwhile.
              </Text>
            </View>
          ) : loading ? (
            <View style={styles.center}>
              <ActivityIndicator color={Palette.accent} />
            </View>
          ) : ids.length === 0 ? (
            <View style={styles.center}>
              <Text style={styles.empty}>No color matches.</Text>
            </View>
          ) : (
            <FlatList
              data={ids}
              numColumns={4}
              keyExtractor={(id) => id}
              columnWrapperStyle={styles.grid}
              contentContainerStyle={styles.gridContent}
              renderItem={({ item }) => {
                const uri = cardThumbUrl(item, 245);
                return (
                  <Pressable style={styles.cell} onPress={() => onPickCard(item)} accessibilityLabel="Add this card to a binder">
                    <View style={styles.cellImgWrap}>
                      {uri ? (
                        <Image source={{ uri }} style={styles.cellImg} contentFit="contain" cachePolicy="memory-disk" recyclingKey={item} transition={100} />
                      ) : null}
                    </View>
                  </Pressable>
                );
              }}
            />
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: Palette.scrim45, justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: Palette.surface,
    borderTopLeftRadius: Radius.lg,
    borderTopRightRadius: Radius.lg,
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.three,
    paddingBottom: Spacing.six,
    maxHeight: '88%',
  },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: Spacing.three },
  title: { flex: 1, fontSize: FontSize.body, fontWeight: Weight.bold, color: Palette.ink },
  close: { fontSize: FontSize.md, color: Palette.muted, paddingHorizontal: Spacing.two },
  regionRow: { flexDirection: 'row', gap: Spacing.two, marginBottom: Spacing.three },
  regionBtn: { paddingVertical: 6, paddingHorizontal: Spacing.three, borderRadius: Radius.pill, backgroundColor: Palette.panel },
  regionBtnOn: { backgroundColor: Palette.accent },
  regionTxt: { fontSize: FontSize.label, fontWeight: Weight.semibold, color: Palette.ink2 },
  regionTxtOn: { color: Palette.accentText },
  picker: { marginBottom: Spacing.three, gap: Spacing.two },
  hint: { fontSize: FontSize.xs, color: Palette.muted },
  center: { paddingVertical: Spacing.six, alignItems: 'center', justifyContent: 'center' },
  empty: { fontSize: FontSize.control, color: Palette.muted, textAlign: 'center' },
  grid: { gap: Spacing.two },
  gridContent: { gap: Spacing.two, paddingBottom: Spacing.four },
  cell: { flex: 1 / 4 },
  cellImgWrap: { width: '100%', aspectRatio: 63 / 88, borderRadius: Radius.control, overflow: 'hidden', backgroundColor: Palette.panel },
  cellImg: { width: '100%', height: '100%' },
});
