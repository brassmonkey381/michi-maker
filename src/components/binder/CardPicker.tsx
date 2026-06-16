import { Image } from 'expo-image';
import { useEffect, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { VUNION_SETS } from '@/data/cardSizing';
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
 * (1×1, 2×2, 3×3) preserve — so only those carry cards. Non-square shapes carry tonal
 * inserts (a solid colour has no aspect to distort), per woahpoke.com/michi-method.
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
  /** The page being edited (for fit checks). */
  page: DemoPage | null;
  /** The target pocket (top-left cell). */
  cell: { row: number; col: number } | null;
  /** The existing slot at the target cell, if any. */
  slot?: DemoSlot | null;
  onClose: () => void;
  /** Place a framed card (footprint comes from its kind: standard 1×1 / jumbo 2×2). */
  onPickCard: (cardId: string) => void;
  /** Place a V-UNION's four pieces into the 2×2 starting at the target cell. */
  onPickVUnion: (pieces: readonly string[]) => void;
  /** Fill the pocket with a tonal colour insert of the given size (negative space). */
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
  onClose,
  onPickCard,
  onPickVUnion,
  onPickInsert,
  onClear,
}: CardPickerProps) {
  // The chosen footprint gates everything. It can only be a shape that fits on the page
  // starting at this pocket and extending right/down. Defaults to the pocket's current size.
  const [shape, setShape] = useState({ rows: 1, cols: 1 });
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setShape(slot ? { rows: slot.rowSpan, cols: slot.colSpan } : { rows: 1, cols: 1 });
  }, [cell?.row, cell?.col, slot?.id, slot?.rowSpan, slot?.colSpan]);

  const fits = (rows: number, cols: number) =>
    !!cell && !!page && cell.row + rows <= page.rows && cell.col + cols <= page.cols;

  const is = (rows: number, cols: number) => shape.rows === rows && shape.cols === cols;
  // Framed cards only exist at their real, undistorted footprint: standard = 1×1, jumbo = 2×2.
  const framedCards = is(1, 1) ? STANDARD_CARDS : is(2, 2) ? JUMBO_CARDS : [];
  const showVUnion = is(2, 2);
  const noCardForShape = framedCards.length === 0 && !showVUnion;
  const sizeLabel = `${shape.rows}×${shape.cols}`;

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

          <ScrollView contentContainerStyle={styles.scroll}>
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

            {/* V-UNION (only at 2×2). */}
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

            {noCardForShape ? (
              <Text style={styles.hint}>
                No real card is {sizeLabel} (cards are 1×1, jumbo/V-UNION are 2×2). Fill this
                shape with a tonal insert below.
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
    maxHeight: '82%',
  },
  handle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#d4d4d4',
    marginBottom: 8,
  },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  close: { fontSize: 16, fontWeight: '600', color: '#3B82F6' },
  controlsRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 10, flexWrap: 'wrap' },
  controlsLabel: { fontSize: 13, color: '#666', marginRight: 2 },
  spanChip: { paddingVertical: 5, paddingHorizontal: 10, borderRadius: 8, backgroundColor: '#f0f0f3' },
  spanChipActive: { backgroundColor: '#3B82F6' },
  spanChipText: { fontSize: 13, color: '#333' },
  spanChipTextActive: { color: '#fff', fontWeight: '600' },
  disabled: { opacity: 0.3 },
  hint: { fontSize: 12, color: '#999', marginTop: 12, lineHeight: 17 },
  insertRow: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginBottom: 8 },
  insertSwatch: { width: 28, height: 28, borderRadius: 7, borderWidth: 1, borderColor: 'rgba(128,128,128,0.35)' },
  insertSwatchActive: { borderWidth: 3, borderColor: '#3B82F6' },
  emptyBtn: {
    marginLeft: 'auto',
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: 8,
    backgroundColor: '#fdeaea',
  },
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
  thumbSelected: { backgroundColor: '#e8f0fe' },
  thumbImageWrap: { width: '100%', aspectRatio: 63 / 88, borderRadius: 6, overflow: 'hidden' },
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
  tagText: { color: '#fff', fontSize: 7, fontWeight: '700', letterSpacing: 0.4 },
  thumbName: { fontSize: 11, textAlign: 'center', marginTop: 3, color: '#444' },
});
