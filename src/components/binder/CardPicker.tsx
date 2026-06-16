import { Image } from 'expo-image';
import { useEffect, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { VUNION_SETS } from '@/data/cardSizing';
import { ARTWORK_LIBRARY, domainOf, slotAspect, type ArtworkAsset } from '@/data/artworkLibrary';
import { CARDS, CARDS_BY_ID } from '@/data/sampleData';
import type { DemoPage, DemoSlot } from '@/data/binderTypes';

/** Tasteful tonal inserts for filling a pocket with negative space. */
const INSERT_TONES: { label: string; color: string }[] = [
  { label: 'Cream', color: '#F3ECDD' },
  { label: 'Sand', color: '#E4D5BB' },
  { label: 'Slate', color: '#5C6B7A' },
  { label: 'Dusk', color: '#3B3A52' },
  { label: 'Blush', color: '#E9CBD1' },
  { label: 'Sky', color: '#C7DBE8' },
  { label: 'Charcoal', color: '#2A2A30' },
];

/**
 * Placement footprints. A real card is portrait (63×88), an aspect only square blocks
 * (1×1, 2×2, 3×3) preserve — so only those carry cards. Artwork panels + tonal inserts can
 * take any shape (they're chosen/cropped to fit), per woahpoke.com/michi-method.
 */
const SHAPES: { label: string; rows: number; cols: number }[] = [
  { label: '1×1', rows: 1, cols: 1 },
  { label: '1×2', rows: 1, cols: 2 },
  { label: '2×1', rows: 2, cols: 1 },
  { label: '2×2', rows: 2, cols: 2 },
  { label: '1×3', rows: 1, cols: 3 },
  { label: '3×1', rows: 3, cols: 1 },
  { label: '2×3', rows: 2, cols: 3 },
  { label: '3×2', rows: 3, cols: 2 },
  { label: '3×3', rows: 3, cols: 3 },
];

interface CardPickerProps {
  visible: boolean;
  page: DemoPage | null;
  cell: { row: number; col: number } | null;
  slot?: DemoSlot | null;
  /** A theme keyword guessed from the binder, used to seed the artwork search. */
  themeHint?: string;
  onClose: () => void;
  onPickCard: (cardId: string) => void;
  onPickVUnion: (pieces: readonly string[]) => void;
  /** Place a custom artwork image (playground art or a pasted URL) at the chosen shape. */
  onPickArtwork: (imageUrl: string, rowSpan: number, colSpan: number) => void;
  onPickInsert: (color: string, rowSpan: number, colSpan: number) => void;
  onClear: () => void;
}

const STANDARD_CARDS = CARDS.filter((c) => c.kind !== 'jumbo' && c.kind !== 'vunion');
const JUMBO_CARDS = CARDS.filter((c) => c.kind === 'jumbo');

export function CardPicker({
  visible,
  page,
  cell,
  slot,
  themeHint,
  onClose,
  onPickCard,
  onPickVUnion,
  onPickArtwork,
  onPickInsert,
  onClear,
}: CardPickerProps) {
  const [shape, setShape] = useState({ rows: 1, cols: 1 });
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setShape(slot ? { rows: slot.rowSpan, cols: slot.colSpan } : { rows: 1, cols: 1 });
  }, [cell?.row, cell?.col, slot?.id, slot?.rowSpan, slot?.colSpan]);

  const [query, setQuery] = useState(themeHint ?? '');
  const [urlInput, setUrlInput] = useState('');

  const fits = (rows: number, cols: number) =>
    !!cell && !!page && cell.row + rows <= page.rows && cell.col + cols <= page.cols;

  const is = (rows: number, cols: number) => shape.rows === rows && shape.cols === cols;
  const framedCards = is(1, 1) ? STANDARD_CARDS : is(2, 2) ? JUMBO_CARDS : [];
  const showVUnion = is(2, 2);
  const sizeLabel = `${shape.rows}×${shape.cols}`;

  // Artwork suggestions: theme-filtered, with art that matches this slot's aspect first.
  const q = query.trim().toLowerCase();
  const targetAspect = slotAspect(shape.rows, shape.cols);
  const artwork = ARTWORK_LIBRARY.filter(
    (a) => !q || a.title.toLowerCase().includes(q) || a.themes.some((t) => t.includes(q)),
  ).sort((a, b) => (a.aspect === targetAspect ? 0 : 1) - (b.aspect === targetAspect ? 0 : 1));

  const urlValid = /^https?:\/\/\S+$/i.test(urlInput.trim());
  const title = slot ? 'Edit pocket' : 'Add to pocket';

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <Pressable style={styles.backdropFill} onPress={onClose} />
        <View style={styles.sheet}>
          <View style={styles.handle} />
          <View style={styles.header}>
            <ThemedText type="subtitle">{title}</ThemedText>
            <Pressable onPress={onClose} hitSlop={12}>
              <Text style={styles.close}>Done</Text>
            </Pressable>
          </View>

          {/* Shape selector — sizes that don't fit from this pocket are disabled. */}
          <View style={styles.controlsRow}>
            <Text style={styles.controlsLabel}>Shape</Text>
            {SHAPES.map((s) => {
              const enabled = fits(s.rows, s.cols);
              const active = is(s.rows, s.cols);
              return (
                <Pressable
                  key={s.label}
                  disabled={!enabled}
                  onPress={() => setShape({ rows: s.rows, cols: s.cols })}
                  style={[styles.spanChip, active && styles.spanChipActive, !enabled && styles.disabled]}>
                  <Text style={[styles.spanChipText, active && styles.spanChipTextActive]}>{s.label}</Text>
                </Pressable>
              );
            })}
          </View>

          <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
            {/* Framed cards that physically match this shape (1×1 standard, 2×2 jumbo). */}
            {framedCards.length > 0 ? (
              <>
                <Text style={styles.sectionLabel}>Cards · {sizeLabel}</Text>
                <View style={styles.grid}>
                  {framedCards.map((card) => {
                    const selected = slot?.type === 'card' && slot?.cardId === card.id;
                    const jumbo = card.kind === 'jumbo';
                    return (
                      <Pressable
                        key={card.id}
                        style={[styles.thumb, selected && styles.thumbSelected]}
                        onPress={() => onPickCard(card.id)}>
                        <View style={[styles.thumbImageWrap, { backgroundColor: `${card.dominantColor}22` }]}>
                          <Image source={{ uri: card.imageUrl }} style={styles.thumbImage} contentFit="contain" />
                          {jumbo ? (
                            <View style={styles.tag}>
                              <Text style={styles.tagText}>JUMBO</Text>
                            </View>
                          ) : null}
                        </View>
                        <Text numberOfLines={1} style={styles.thumbName}>
                          {card.name}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              </>
            ) : null}

            {showVUnion ? (
              <>
                <Text style={styles.sectionLabel}>V-UNION · 2×2 of 4 pieces</Text>
                <View style={styles.grid}>
                  {VUNION_SETS.map((set) => {
                    const tl = CARDS_BY_ID[set.pieces[0]];
                    return (
                      <Pressable key={set.key} style={styles.thumb} onPress={() => onPickVUnion(set.pieces)}>
                        <View style={[styles.thumbImageWrap, { backgroundColor: `${tl?.dominantColor ?? '#888'}33` }]}>
                          {tl ? <Image source={{ uri: tl.imageUrl }} style={styles.thumbImage} contentFit="contain" /> : null}
                          <View style={styles.tag}>
                            <Text style={styles.tagText}>V-UNION</Text>
                          </View>
                        </View>
                        <Text numberOfLines={1} style={styles.thumbName}>
                          {set.label}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              </>
            ) : null}

            {/* Artwork panels — themed art that fits the chosen shape (cropped to cover). */}
            <Text style={styles.sectionLabel}>Artwork panel · {sizeLabel}</Text>
            <View style={styles.controlsRow}>
              <TextInput
                value={query}
                onChangeText={setQuery}
                placeholder="Search art (e.g. fire, ocean)"
                placeholderTextColor="#aaa"
                style={styles.input}
              />
            </View>
            <View style={styles.grid}>
              {artwork.map((art) => (
                <ArtThumb
                  key={art.id}
                  art={art}
                  selected={slot?.type === 'artwork' && slot?.imageUrl === art.url}
                  onPress={() => onPickArtwork(art.url, shape.rows, shape.cols)}
                />
              ))}
              {artwork.length === 0 ? (
                <Text style={styles.hint}>No art matches “{query}”. Paste a URL below.</Text>
              ) : null}
            </View>

            {/* Paste your own art (any source). Provenance is derived from the URL for cleanup. */}
            <View style={styles.controlsRow}>
              <TextInput
                value={urlInput}
                onChangeText={setUrlInput}
                placeholder="Paste image URL…"
                placeholderTextColor="#aaa"
                autoCapitalize="none"
                autoCorrect={false}
                style={[styles.input, styles.inputGrow]}
              />
              <Pressable
                disabled={!urlValid}
                onPress={() => {
                  onPickArtwork(urlInput.trim(), shape.rows, shape.cols);
                  setUrlInput('');
                }}
                style={[styles.addBtn, !urlValid && styles.disabled]}>
                <Text style={styles.addBtnText}>Add</Text>
              </Pressable>
            </View>
            {urlInput.trim() ? (
              <Text style={styles.hint}>
                From {domainOf(urlInput)} — saved as-is; check you have the right to use it.
              </Text>
            ) : null}

            {/* Tonal inserts at the chosen shape — solid colour, so any shape is fine. */}
            <Text style={styles.sectionLabel}>Insert · {sizeLabel}</Text>
            <View style={styles.insertRow}>
              {INSERT_TONES.map((tone) => {
                const active = slot?.type === 'insert' && slot.insertColor === tone.color;
                return (
                  <Pressable
                    key={tone.color}
                    accessibilityLabel={`${tone.label} insert`}
                    onPress={() => onPickInsert(tone.color, shape.rows, shape.cols)}
                    style={[styles.insertSwatch, { backgroundColor: tone.color }, active && styles.insertSwatchActive]}
                  />
                );
              })}
              <Pressable onPress={onClear} style={styles.emptyBtn}>
                <Text style={styles.emptyText}>Leave empty</Text>
              </Pressable>
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

/** An artwork suggestion thumbnail, with a visible fallback if the image fails to load. */
function ArtThumb({
  art,
  selected,
  onPress,
}: {
  art: ArtworkAsset;
  selected: boolean;
  onPress: () => void;
}) {
  const [failed, setFailed] = useState(false);
  return (
    <Pressable style={[styles.artThumb, selected && styles.thumbSelected]} onPress={onPress}>
      <View style={styles.artImageWrap}>
        {failed ? (
          <View style={styles.artFail}>
            <Text style={styles.artFailText}>no image</Text>
          </View>
        ) : (
          <Image
            source={{ uri: art.url }}
            style={styles.thumbImage}
            contentFit="cover"
            onError={() => setFailed(true)}
          />
        )}
        <View style={[styles.tag, !art.licenseClear && styles.tagWarn]}>
          <Text style={styles.tagText}>{art.licenseClear ? art.license : '⚠ review'}</Text>
        </View>
      </View>
      <Text numberOfLines={1} style={styles.thumbName}>
        {art.title}
      </Text>
      <Text numberOfLines={1} style={styles.source}>
        {art.sourceDomain}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.4)' },
  backdropFill: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  sheet: {
    backgroundColor: '#ffffff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 24,
    maxHeight: '85%',
  },
  handle: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: '#d4d4d4', marginBottom: 8 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  close: { fontSize: 16, fontWeight: '600', color: '#3B82F6' },
  controlsRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 10, flexWrap: 'wrap' },
  controlsLabel: { fontSize: 13, color: '#666', marginRight: 2 },
  spanChip: { paddingVertical: 5, paddingHorizontal: 10, borderRadius: 8, backgroundColor: '#f0f0f3' },
  spanChipActive: { backgroundColor: '#3B82F6' },
  spanChipText: { fontSize: 13, color: '#333' },
  spanChipTextActive: { color: '#fff', fontWeight: '600' },
  disabled: { opacity: 0.3 },
  hint: { fontSize: 12, color: '#999', marginTop: 4, marginBottom: 4, lineHeight: 17, width: '100%' },
  input: {
    borderWidth: 1,
    borderColor: '#e0e0e3',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 7,
    fontSize: 14,
    color: '#222',
    minWidth: 200,
  },
  inputGrow: { flex: 1, minWidth: 160 },
  addBtn: { paddingVertical: 8, paddingHorizontal: 16, borderRadius: 8, backgroundColor: '#3B82F6' },
  addBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  insertRow: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginBottom: 8 },
  insertSwatch: { width: 28, height: 28, borderRadius: 7, borderWidth: 1, borderColor: 'rgba(128,128,128,0.35)' },
  insertSwatchActive: { borderWidth: 3, borderColor: '#3B82F6' },
  emptyBtn: { marginLeft: 'auto', paddingVertical: 5, paddingHorizontal: 10, borderRadius: 8, backgroundColor: '#fdeaea' },
  emptyText: { fontSize: 13, color: '#c0392b', fontWeight: '600' },
  scroll: { paddingBottom: 16 },
  sectionLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#888',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginTop: 12,
    marginBottom: 6,
  },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  thumb: { width: 70, borderRadius: 8, padding: 3 },
  artThumb: { width: 86, borderRadius: 8, padding: 3 },
  thumbSelected: { backgroundColor: '#e8f0fe' },
  thumbImageWrap: { width: '100%', aspectRatio: 63 / 88, borderRadius: 6, overflow: 'hidden' },
  artImageWrap: { width: '100%', aspectRatio: 1, borderRadius: 6, overflow: 'hidden', backgroundColor: '#11111a' },
  artFail: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  artFailText: { color: '#8a8a96', fontSize: 9 },
  thumbImage: { width: '100%', height: '100%' },
  tag: {
    position: 'absolute',
    bottom: 3,
    left: 3,
    paddingHorizontal: 4,
    paddingVertical: 1,
    borderRadius: 3,
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  tagWarn: { backgroundColor: 'rgba(192,57,43,0.85)' },
  tagText: { color: '#fff', fontSize: 7, fontWeight: '700', letterSpacing: 0.4 },
  thumbName: { fontSize: 11, textAlign: 'center', marginTop: 3, color: '#444' },
  source: { fontSize: 9, textAlign: 'center', color: '#aaa' },
});
