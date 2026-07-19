/**
 * Search-by-color sheet — two modes over the kit's color client:
 *   · PICK    — tap a swatch → cards whose palette features that color (search_by_color).
 *   · SIMILAR — seeded from a card → cards with the nearest palette (find_similar_by_color).
 * A region toggle switches between the full card face ("Full art") and the illustration window
 * ("Art panel"). Results are card ids rendered by thumbnail; tapping one bubbles up (→ add to a
 * binder). Uses the warm on-device index when loaded, else the data-server RPCs (guest/gated).
 */
import { Image } from 'expo-image';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import {
  cardThumbUrl,
  findSimilarByColor,
  searchByColor,
  srgbToLab,
  useColorIndex,
  type ColorRegion,
} from 'tcgscan-browse';

import { FontSize, Palette, Radius, Spacing, Weight } from '@/constants/theme';

/** Palette of pickable swatches (sRGB) spanning the spectrum + neutrals. */
const SWATCHES: { hex: string; rgb: [number, number, number] }[] = [
  ['#E23B3B'], ['#E8862E'], ['#E8B62E'], ['#EDE23A'], ['#9BCB3A'], ['#3FB65C'],
  ['#2EBBA6'], ['#35C0D8'], ['#3B7BE2'], ['#4B54C8'], ['#8A4BD8'], ['#C43BD8'],
  ['#E24B9B'], ['#8A5A34'], ['#C9A06A'], ['#111418'], ['#8A8F98'], ['#F2F2F2'],
].map(([hex]) => ({
  hex,
  rgb: [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)] as [
    number,
    number,
    number,
  ],
}));

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
  /** When set, opens in SIMILAR mode seeded from this card; otherwise PICK mode. */
  seedCardId?: string;
  seedName?: string;
  /** A result card was tapped (→ add to a binder). */
  onPickCard: (cardId: string) => void;
  onClose: () => void;
}) {
  // Warm on-device index (activates once the color blob is hosted). The picker uses the fast
  // server RPC when it's not loaded; find-similar is warm-only (its server RPC is too slow — see
  // COLOR-SIMILARITY.md §10), so we gate the seeded mode on the on-device index being present.
  const colorIndex = useColorIndex(true);
  const [region, setRegion] = useState<ColorRegion>('noborder');
  const [pick, setPick] = useState<string | null>(seedCardId ? null : SWATCHES[0].hex);
  const [ids, setIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  // Seeded (find-similar) mode can't run until the on-device index holds the seed card.
  const similarUnavailable = Boolean(seedCardId) && !(colorIndex && seedCardId && colorIndex.has(seedCardId));

  const run = useCallback(async () => {
    setLoading(true);
    let result: string[] = [];
    if (seedCardId) {
      if (colorIndex && colorIndex.has(seedCardId)) {
        result = await findSimilarByColor(seedCardId, region, { limit: 60 });
      }
    } else if (pick) {
      const sw = SWATCHES.find((s) => s.hex === pick);
      if (sw) result = await searchByColor(srgbToLab(...sw.rgb), region, { limit: 60 });
    }
    setIds(result);
    setLoading(false);
  }, [seedCardId, pick, region, colorIndex]);

  useEffect(() => {
    run();
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
                <Pressable
                  key={r.value}
                  onPress={() => setRegion(r.value)}
                  style={[styles.regionBtn, on && styles.regionBtnOn]}>
                  <Text style={[styles.regionTxt, on && styles.regionTxtOn]}>{r.label}</Text>
                </Pressable>
              );
            })}
          </View>

          {/* Swatch picker (PICK mode only) */}
          {!seedCardId ? (
            <View style={styles.swatchRow}>
              {SWATCHES.map((s) => (
                <Pressable
                  key={s.hex}
                  onPress={() => setPick(s.hex)}
                  accessibilityLabel={`Pick color ${s.hex}`}
                  style={[styles.swatch, { backgroundColor: s.hex }, pick === s.hex && styles.swatchOn]}
                />
              ))}
            </View>
          ) : null}

          {/* Results */}
          {similarUnavailable ? (
            <View style={styles.center}>
              <Text style={styles.empty}>
                Similar-by-color needs the on-device color data (still publishing). Try the color
                picker meanwhile.
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
              key={'grid'}
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
    maxHeight: '82%',
  },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: Spacing.three },
  title: { flex: 1, fontSize: FontSize.body, fontWeight: Weight.bold, color: Palette.ink },
  close: { fontSize: FontSize.md, color: Palette.muted, paddingHorizontal: Spacing.two },
  regionRow: { flexDirection: 'row', gap: Spacing.two, marginBottom: Spacing.three },
  regionBtn: { paddingVertical: 6, paddingHorizontal: Spacing.three, borderRadius: Radius.pill, backgroundColor: Palette.panel },
  regionBtnOn: { backgroundColor: Palette.accent },
  regionTxt: { fontSize: FontSize.label, fontWeight: Weight.semibold, color: Palette.ink2 },
  regionTxtOn: { color: Palette.accentText },
  swatchRow: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two, marginBottom: Spacing.three },
  swatch: { width: 30, height: 30, borderRadius: 15, borderWidth: 2, borderColor: 'transparent' },
  swatchOn: { borderColor: Palette.ink },
  center: { paddingVertical: Spacing.six, alignItems: 'center', justifyContent: 'center' },
  empty: { fontSize: FontSize.control, color: Palette.muted },
  grid: { gap: Spacing.two },
  gridContent: { gap: Spacing.two, paddingBottom: Spacing.four },
  cell: { flex: 1 / 4 },
  cellImgWrap: { width: '100%', aspectRatio: 63 / 88, borderRadius: Radius.control, overflow: 'hidden', backgroundColor: Palette.panel },
  cellImg: { width: '100%', height: '100%' },
});
