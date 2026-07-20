/**
 * Search-by-color PICKER sheet. Builds a query and hands the resulting card ids back to the browse
 * page (`onResults`), which pushes them into the CatalogBrowser as a result set — so color results
 * get the full search-result treatment (facets, multi-select, sort, card actions).
 *   · PICK    — a gradient mix bar with up to 3 draggable color STOPS (positions set the weights) +
 *               a continuous HSV picker per stop → searchByColors.
 *   · SIMILAR — seeded from a card → findSimilarByColor (warm on-device; falls back to a note).
 * Region toggle: full card face ("Full art") vs illustration window ("Art panel").
 */
import { useEffect, useMemo, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { findSimilarByColor, searchByColors, srgbToLab, useColorIndex, type ColorRegion, type Lab } from 'tcgscan-browse';

import { GradientMixBar, HsvColorPicker, stopWeights, type Stop } from '@/components/color/ColorPicker';
import { FontSize, Palette, Radius, Spacing, Weight } from '@/constants/theme';

const REGIONS: { value: ColorRegion; label: string }[] = [
  { value: 'noborder', label: 'Full art' },
  { value: 'art', label: 'Art panel' },
];

// Session-sticky picker state so reopening the picker resumes the last color mix + region (module
// level, mirrors the app's viewModePref/recentLangPref prefs — resets on a fresh app load).
let savedStops: Stop[] = [
  { pos: 0.2, rgb: [226, 59, 59] },
  { pos: 0.5, rgb: [59, 123, 226] },
  { pos: 0.8, rgb: [237, 226, 58] },
];
let savedRegion: ColorRegion = 'noborder';

export function ColorSearchSheet({
  seedCardId,
  seedName,
  onResults,
  onClose,
}: {
  seedCardId?: string;
  seedName?: string;
  /** The ranked result ids (nearest first) + a short label — the page shows them in the browser. */
  onResults: (ids: string[], label: string) => void;
  onClose: () => void;
}) {
  const colorIndex = useColorIndex(true);
  const [region, setRegion] = useState<ColorRegion>(savedRegion);
  const [stops, setStops] = useState<Stop[]>(savedStops);
  const [editing, setEditing] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');

  // Remember the mix + region across opens (session-sticky).
  useEffect(() => {
    savedStops = stops;
    savedRegion = region;
  }, [stops, region]);

  const similarUnavailable = Boolean(seedCardId) && !(colorIndex && seedCardId && colorIndex.has(seedCardId));

  const query = useMemo<Lab[]>(() => {
    const w = stopWeights(stops);
    return stops.map((s, i) => ({ ...srgbToLab(s.rgb[0], s.rgb[1], s.rgb[2]), w: w[i] })).filter((c) => c.w > 0);
  }, [stops]);

  const findMatches = async () => {
    setBusy(true);
    setNote('');
    const ids = seedCardId
      ? await findSimilarByColor(seedCardId, region, { limit: 120 })
      : await searchByColors(query, region, { limit: 120 });
    setBusy(false);
    if (ids.length) onResults(ids, seedCardId ? `Similar: ${seedName ?? 'card'}` : 'Color mix');
    else setNote('No color matches.');
  };

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

          {similarUnavailable ? (
            <Text style={styles.msg}>
              Similar-by-color needs the on-device color data (still publishing). Use the color picker meanwhile.
            </Text>
          ) : !seedCardId ? (
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
          ) : (
            <Text style={styles.msg}>Find cards whose palette is closest to this card.</Text>
          )}

          {note ? <Text style={styles.note}>{note}</Text> : null}

          <Pressable
            onPress={findMatches}
            disabled={busy || similarUnavailable}
            style={({ pressed }) => [styles.searchBtn, (busy || similarUnavailable) && styles.searchBtnOff, pressed && styles.pressed]}
            accessibilityRole="button">
            <Text style={styles.searchBtnText}>{busy ? 'Searching…' : 'Find matches'}</Text>
          </Pressable>
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
    gap: Spacing.three,
  },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { flex: 1, fontSize: FontSize.body, fontWeight: Weight.bold, color: Palette.ink },
  close: { fontSize: FontSize.md, color: Palette.muted, paddingHorizontal: Spacing.two },
  regionRow: { flexDirection: 'row', gap: Spacing.two },
  regionBtn: { paddingVertical: 6, paddingHorizontal: Spacing.three, borderRadius: Radius.pill, backgroundColor: Palette.panel },
  regionBtnOn: { backgroundColor: Palette.accent },
  regionTxt: { fontSize: FontSize.label, fontWeight: Weight.semibold, color: Palette.ink2 },
  regionTxtOn: { color: Palette.accentText },
  picker: { gap: Spacing.two },
  hint: { fontSize: FontSize.xs, color: Palette.muted },
  msg: { fontSize: FontSize.control, color: Palette.muted },
  note: { fontSize: FontSize.control, color: Palette.muted, textAlign: 'center' },
  searchBtn: { paddingVertical: Spacing.two, borderRadius: Radius.pill, backgroundColor: Palette.accent, alignItems: 'center' },
  searchBtnOff: { opacity: 0.5 },
  searchBtnText: { fontSize: FontSize.control, fontWeight: Weight.bold, color: Palette.accentText },
  pressed: { opacity: 0.7 },
});
