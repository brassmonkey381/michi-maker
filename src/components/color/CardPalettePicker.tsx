/**
 * "Use a card's colours" — search for a card, see the palette it was actually published with, and
 * take that palette into the tri-color mix.
 *
 * Why not just mount the card browser here: the kit's `browseState` is a module singleton and it
 * says so ("one browser at a time, never two"). This sheet opens ON TOP of a mounted
 * CatalogBrowser, so a second one would overwrite the query, drill-down and sort of the browser
 * underneath while the person is only borrowing a colour. A name search over the same catalog is
 * all this needs, and it leaves the browser behind it untouched.
 *
 * Every row shows the card's OWN dominant colours, read from the same on-device blob the search
 * runs against. That is the honest preview: what you see on the row is exactly what lands on the
 * mix bar, including the cards whose palette is duller than their art looks.
 */
import { Image } from 'expo-image';
import { useMemo, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { labToSrgb, type ColorIndex, type ColorRegion } from 'tcgscan-browse';

import { rgbToHex, type RGB, type Stop } from '@/components/color/ColorPicker';
import { FontSize, Palette, Radius, Spacing, Weight } from '@/constants/theme';
import type { Catalog, CatalogCard } from '@/lib/catalog';
import { cardThumbUrl } from '@/lib/catalogConfig';
import { paletteStops } from '@/data/paletteStops';

const MAX_RESULTS = 24;

/** A card's published palette as mix-bar stops, or [] when the blob has nothing for it. */
export function stopsForCard(index: ColorIndex | null, cardId: string, region: ColorRegion): Stop[] {
  if (!index?.has(cardId)) return [];
  return paletteStops(index.colors(cardId, region)).map(({ pos, color }) => {
    const { r, g, b } = labToSrgb(color.L, color.a, color.b);
    return { pos, rgb: [r, g, b] as RGB };
  });
}

function swatches(index: ColorIndex | null, cardId: string, region: ColorRegion): string[] {
  return stopsForCard(index, cardId, region).map((s) => rgbToHex(s.rgb));
}

export function CardPalettePicker({
  catalog,
  colorIndex,
  region,
  onPick,
  onClose,
}: {
  catalog: Catalog | null;
  colorIndex: ColorIndex | null;
  /** The region whose palette is taken — the sheet's own Full art / Art panel choice. */
  region: ColorRegion;
  onPick: (stops: Stop[], card: CatalogCard) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState('');

  const results = useMemo<CatalogCard[]>(() => {
    const q = query.trim();
    if (!catalog || q.length < 2) return [];
    return catalog.search(q, MAX_RESULTS);
  }, [catalog, query]);

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
          <View style={styles.headerRow}>
            <Text style={styles.title}>Use a card&apos;s colours</Text>
            <Pressable onPress={onClose} hitSlop={10}>
              <Text style={styles.close}>✕</Text>
            </Pressable>
          </View>

          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Search by name"
            placeholderTextColor={Palette.muted}
            style={styles.input}
            autoFocus
            autoCorrect={false}
            returnKeyType="search"
          />

          {!catalog ? (
            <Text style={styles.msg}>The catalog is still loading.</Text>
          ) : query.trim().length < 2 ? (
            <Text style={styles.msg}>Type a card name to find its palette.</Text>
          ) : results.length === 0 ? (
            <Text style={styles.msg}>No cards match “{query.trim()}”.</Text>
          ) : (
            <ScrollView style={styles.list} keyboardShouldPersistTaps="handled">
              {results.map((card) => {
                const hexes = swatches(colorIndex, card.id, region);
                return (
                  <Pressable
                    key={card.id}
                    // A card with no palette cannot hand one over; it stays visible but inert so the
                    // absence reads as "this card has no colour data", not "the search missed it".
                    disabled={hexes.length === 0}
                    onPress={() => {
                      const stops = stopsForCard(colorIndex, card.id, region);
                      if (stops.length) onPick(stops, card);
                    }}
                    style={({ pressed }) => [styles.row, pressed && styles.pressed, hexes.length === 0 && styles.rowOff]}
                    accessibilityRole="button"
                    accessibilityLabel={`Use the colours of ${card.name}`}>
                    <Image source={{ uri: cardThumbUrl(card.id, 245) }} style={styles.thumb} contentFit="contain" />
                    <View style={styles.rowText}>
                      <Text style={styles.cardName} numberOfLines={1}>
                        {card.name}
                      </Text>
                      <Text style={styles.cardSet} numberOfLines={1}>
                        {card.setName}
                        {card.number ? ` · ${card.number}` : ''}
                      </Text>
                    </View>
                    <View style={styles.swatchRow}>
                      {hexes.length ? (
                        hexes.map((hex, i) => (
                          <View key={`${card.id}-${i}`} style={[styles.swatch, { backgroundColor: hex }]} />
                        ))
                      ) : (
                        <Text style={styles.noPalette}>no colours</Text>
                      )}
                    </View>
                  </Pressable>
                );
              })}
            </ScrollView>
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
    padding: Spacing.four,
    maxHeight: '85%',
  },
  headerRow: { flexDirection: 'row', alignItems: 'center', marginBottom: Spacing.two },
  title: { flex: 1, fontSize: FontSize.body, fontWeight: Weight.bold, color: Palette.ink },
  close: { fontSize: FontSize.body, color: Palette.muted, paddingHorizontal: Spacing.one },
  input: {
    backgroundColor: Palette.panel,
    borderRadius: Radius.control,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    color: Palette.ink,
    fontSize: FontSize.md,
  },
  msg: { color: Palette.muted, fontSize: FontSize.sm, paddingVertical: Spacing.four, textAlign: 'center' },
  list: { marginTop: Spacing.two },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: Spacing.two,
    gap: Spacing.two,
  },
  rowOff: { opacity: 0.45 },
  pressed: { opacity: 0.7 },
  thumb: { width: 36, height: 50, borderRadius: Radius.sm, backgroundColor: Palette.panel },
  rowText: { flex: 1 },
  cardName: { color: Palette.ink, fontSize: FontSize.sm, fontWeight: Weight.semibold },
  cardSet: { color: Palette.muted, fontSize: FontSize.xs },
  swatchRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  swatch: { width: 18, height: 18, borderRadius: Radius.sm },
  noPalette: { color: Palette.muted, fontSize: FontSize.xs },
});
