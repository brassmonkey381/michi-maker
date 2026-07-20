/**
 * Search-by-color sheet — two modes over the kit's color client:
 *   · PICK    — up to 3 weighted colors (primary/secondary/tertiary) → cards whose palette best
 *               matches that weighted mix (the SAME set-distance the similarity metric uses).
 *   · SIMILAR — seeded from a card → cards with the nearest palette (find_similar_by_color).
 * Region toggle: full card face ("Full art") vs illustration window ("Art panel"). Results are card
 * ids rendered by thumbnail; tapping one bubbles up (→ add to a binder). On-device when the color
 * blob is loaded (instant), else the data-server RPCs (~3 s for the multi-color pick — debounced).
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

import { FontSize, Palette, Radius, Spacing, Weight } from '@/constants/theme';

/** Palette of pickable swatches (sRGB) spanning the spectrum + neutrals. */
const HEXES = [
  '#E23B3B', '#E8862E', '#E8B62E', '#EDE23A', '#9BCB3A', '#3FB65C',
  '#2EBBA6', '#35C0D8', '#3B7BE2', '#4B54C8', '#8A4BD8', '#C43BD8',
  '#E24B9B', '#8A5A34', '#C9A06A', '#111418', '#8A8F98', '#F2F2F2',
];
const hexToRgb = (hex: string): [number, number, number] => [
  parseInt(hex.slice(1, 3), 16),
  parseInt(hex.slice(3, 5), 16),
  parseInt(hex.slice(5, 7), 16),
];

const REGIONS: { value: ColorRegion; label: string }[] = [
  { value: 'noborder', label: 'Full art' },
  { value: 'art', label: 'Art panel' },
];

interface Slot {
  hex: string;
  weight: number; // raw 0..1 (normalized for the query + the % display)
}

/** A tap/drag weight track (0..1) — no slider dep; uses the RN responder system (web + native). */
function WeightSlider({ value, color, onChange }: { value: number; color: string; onChange: (v: number) => void }) {
  const [w, setW] = useState(0);
  const set = (x: number) => onChange(Math.max(0, Math.min(1, w > 0 ? x / w : 0)));
  return (
    <View
      style={styles.track}
      onLayout={(e) => setW(e.nativeEvent.layout.width)}
      onStartShouldSetResponder={() => true}
      onMoveShouldSetResponder={() => true}
      onResponderGrant={(e) => set(e.nativeEvent.locationX)}
      onResponderMove={(e) => set(e.nativeEvent.locationX)}>
      <View style={[styles.trackFill, { width: `${value * 100}%`, backgroundColor: color }]} />
      <View style={[styles.thumb, { left: `${value * 100}%` }]} />
    </View>
  );
}

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
  // Three color slots (primary / secondary / tertiary). Start with one weighted color.
  const [slots, setSlots] = useState<Slot[]>([
    { hex: '#E23B3B', weight: 1 },
    { hex: '#3B7BE2', weight: 0 },
    { hex: '#EDE23A', weight: 0 },
  ]);
  const [editing, setEditing] = useState(0); // which slot the palette edits
  const [ids, setIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);

  const similarUnavailable = Boolean(seedCardId) && !(colorIndex && seedCardId && colorIndex.has(seedCardId));

  // Normalized weights (sum → 1) over the active (weight > 0) slots — the query + the % labels.
  const total = slots.reduce((a, s) => a + s.weight, 0);
  const query = useMemo<Lab[]>(
    () =>
      slots
        .filter((s) => s.weight > 0)
        .map((s) => ({ ...srgbToLab(...hexToRgb(s.hex)), w: s.weight / (total || 1) })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [slots, total],
  );

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

  // Debounce so dragging a slider fires one query when it settles (on-device is instant either way).
  useEffect(() => {
    const t = setTimeout(run, 250);
    return () => clearTimeout(t);
  }, [run]);

  const setSlot = (i: number, patch: Partial<Slot>) =>
    setSlots((prev) => prev.map((s, j) => (j === i ? { ...s, ...patch } : s)));

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

          {/* Multi-color picker (PICK mode only) */}
          {!seedCardId ? (
            <View style={styles.picker}>
              {slots.map((s, i) => {
                const pct = s.weight > 0 && total > 0 ? Math.round((s.weight / total) * 100) : 0;
                return (
                  <View key={i} style={styles.slotRow}>
                    <Pressable
                      onPress={() => setEditing(i)}
                      style={[styles.slotChip, { backgroundColor: s.hex }, editing === i && styles.slotChipOn]}
                      accessibilityLabel={`Edit color ${i + 1}`}
                    />
                    <WeightSlider value={s.weight} color={s.hex} onChange={(v) => setSlot(i, { weight: v })} />
                    <Text style={styles.pct}>{pct}%</Text>
                  </View>
                );
              })}
              {/* Palette — sets the editing slot's color (and gives an off slot a starting weight) */}
              <View style={styles.swatchRow}>
                {HEXES.map((hex) => (
                  <Pressable
                    key={hex}
                    onPress={() => setSlot(editing, { hex, weight: slots[editing].weight > 0 ? slots[editing].weight : 0.5 })}
                    accessibilityLabel={`Set color ${hex}`}
                    style={[styles.swatch, { backgroundColor: hex }, slots[editing].hex === hex && styles.swatchOn]}
                  />
                ))}
              </View>
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
    maxHeight: '86%',
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
  slotRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  slotChip: { width: 26, height: 26, borderRadius: 13, borderWidth: 2, borderColor: 'transparent' },
  slotChipOn: { borderColor: Palette.ink },
  track: { flex: 1, height: 22, borderRadius: 11, backgroundColor: Palette.panel, justifyContent: 'center', overflow: 'hidden' },
  trackFill: { position: 'absolute', left: 0, top: 0, bottom: 0, borderRadius: 11, opacity: 0.55 },
  thumb: { position: 'absolute', width: 4, top: 0, bottom: 0, marginLeft: -2, backgroundColor: Palette.ink },
  pct: { width: 38, textAlign: 'right', fontSize: FontSize.label, fontWeight: Weight.semibold, color: Palette.ink2, fontVariant: ['tabular-nums'] },
  swatchRow: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two, marginTop: Spacing.one },
  swatch: { width: 26, height: 26, borderRadius: 13, borderWidth: 2, borderColor: 'transparent' },
  swatchOn: { borderColor: Palette.ink },
  center: { paddingVertical: Spacing.six, alignItems: 'center', justifyContent: 'center' },
  empty: { fontSize: FontSize.control, color: Palette.muted, textAlign: 'center' },
  grid: { gap: Spacing.two },
  gridContent: { gap: Spacing.two, paddingBottom: Spacing.four },
  cell: { flex: 1 / 4 },
  cellImgWrap: { width: '100%', aspectRatio: 63 / 88, borderRadius: Radius.control, overflow: 'hidden', backgroundColor: Palette.panel },
  cellImg: { width: '100%', height: '100%' },
});
