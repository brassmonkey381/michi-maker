/**
 * THE STICKER LIBRARY IN THE DOCK — set and series logos as tiles. Tap one to stick it on the
 * focused cover surface, centred, sized as a badge; then it is a decoration like any other and
 * the canvas takes over.
 *
 * The logos come from the browse kit's tiny public taxonomy (useTaxonomy), exactly as the home
 * screen already puts set logos on headers — guest-safe, one small file, nothing new loaded. A
 * search field filters by name, code or series abbreviation; a chip row narrows to one series.
 *
 * Every placement is stamped origin 'logo' with the sticker's library key, so the sharing gate
 * knows what it is looking at and a changed logo URL can be re-resolved later.
 */
import { Image } from 'expo-image';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useTaxonomy } from 'tcgscan-browse';

import { FontSize, Palette, Radius, Weight } from '@/constants/theme';
import { flatChip } from '@/constants/ui';
import type { CoverImageDecoration } from '@/data/binderTypes';
import { uuidv4 } from '@/data/binderTypes';
import { NEW_STICKER_W } from '@/data/coverDecorations';
import { buildStickerLibrary, filterStickers, stickerSeries, type StickerItem } from '@/data/stickerLibrary';

const TILE_W = 88;
const TILE_H = 56;

/** A library item as a fresh decoration, centred on the surface. */
export function stickerDecoration(item: StickerItem): CoverImageDecoration {
  return {
    id: uuidv4(),
    kind: 'sticker',
    imageUrl: item.uri,
    stickerId: item.id,
    x: 0.5,
    y: 0.5,
    w: NEW_STICKER_W,
    // Logos are wide; a 16:10 box is close to most of them and the picture is contained anyway.
    h: NEW_STICKER_W * 0.62,
    name: item.label,
    attribution: { sourceName: 'Pokémon TCG set logo', origin: 'logo' },
  };
}

export function StickerLibrary({ onPick, disabled }: { onPick: (d: CoverImageDecoration) => void; disabled: boolean }) {
  const tax = useTaxonomy(true);
  const [query, setQuery] = useState('');
  const [seriesId, setSeriesId] = useState<string | null>(null);
  const all = useMemo(() => (tax ? buildStickerLibrary(tax) : []), [tax]);
  const series = useMemo(() => stickerSeries(all), [all]);
  const shown = useMemo(() => {
    const byQuery = filterStickers(all, query);
    return seriesId ? byQuery.filter((i) => i.seriesId === seriesId) : byQuery;
  }, [all, query, seriesId]);

  return (
    <View style={styles.section} testID="sticker-library">
      <Text style={styles.label}>Stickers · set logos</Text>
      {!tax ? (
        <Text style={styles.hint}>{all.length ? '' : 'Loading set logos…'}</Text>
      ) : (
        <>
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Search sets — Obsidian Flames, SV3, SWSH…"
            placeholderTextColor={Palette.muted}
            autoCapitalize="none"
            autoCorrect={false}
            testID="sticker-search"
            style={styles.input}
          />
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
            <Pressable onPress={() => setSeriesId(null)} accessibilityRole="button" accessibilityState={{ selected: seriesId === null }} style={[flatChip.base, seriesId === null && flatChip.active]}>
              <Text style={[flatChip.text, seriesId === null && flatChip.textActive]}>All</Text>
            </Pressable>
            {series.map((s) => (
              <Pressable
                key={s.id}
                onPress={() => setSeriesId(seriesId === s.id ? null : s.id)}
                accessibilityRole="button"
                accessibilityState={{ selected: seriesId === s.id }}
                style={[flatChip.base, styles.seriesChip, seriesId === s.id && flatChip.active]}>
                {s.uri ? <Image source={{ uri: s.uri }} style={styles.seriesLogo} contentFit="contain" cachePolicy="memory-disk" transition={0} /> : null}
                <Text style={[flatChip.text, seriesId === s.id && flatChip.textActive]} numberOfLines={1}>
                  {s.name}
                </Text>
              </Pressable>
            ))}
          </ScrollView>
          {shown.length === 0 ? (
            <Text style={styles.hint}>No set matches that.</Text>
          ) : (
            <View style={styles.tiles}>
              {shown.slice(0, 120).map((item) => (
                <Pressable
                  key={item.id}
                  disabled={disabled}
                  onPress={() => onPick(stickerDecoration(item))}
                  accessibilityRole="button"
                  accessibilityLabel={`Stick the ${item.label} logo on the cover`}
                  testID={`sticker-${item.id}`}
                  style={({ pressed }) => [styles.tile, pressed && styles.pressed, disabled && styles.dim]}>
                  <View style={styles.logoBox}>
                    <Image source={{ uri: item.uri }} style={StyleSheet.absoluteFill} contentFit="contain" cachePolicy="memory-disk" transition={0} />
                  </View>
                  <Text style={styles.tileLabel} numberOfLines={1}>
                    {item.kind === 'series' ? `${item.label} (series)` : item.label}
                  </Text>
                </Pressable>
              ))}
              {shown.length > 120 ? <Text style={styles.hint}>Showing the newest 120 — search to narrow it.</Text> : null}
            </View>
          )}
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  section: { gap: 6 },
  label: { fontSize: FontSize.sm, color: Palette.muted, fontWeight: Weight.medium, textTransform: 'uppercase', letterSpacing: 0.4 },
  hint: { fontSize: FontSize.sm, color: Palette.muted },
  input: { height: 34, paddingHorizontal: 10, borderRadius: Radius.control, backgroundColor: Palette.panel, color: Palette.ink, fontSize: FontSize.label },
  chips: { flexDirection: 'row', gap: 6, paddingVertical: 2 },
  seriesChip: { flexDirection: 'row', alignItems: 'center', gap: 5, maxWidth: 180 },
  seriesLogo: { width: 22, height: 14 },
  tiles: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  tile: { width: TILE_W, gap: 3 },
  // Dark, because most set logos are pale on transparent and vanish on a light panel.
  logoBox: { width: TILE_W, height: TILE_H, borderRadius: 6, overflow: 'hidden', backgroundColor: Palette.chromeDeepest, padding: 4 },
  tileLabel: { fontSize: FontSize.sm, color: Palette.ink2, textAlign: 'center' },
  pressed: { opacity: 0.6 },
  dim: { opacity: 0.4 },
});
