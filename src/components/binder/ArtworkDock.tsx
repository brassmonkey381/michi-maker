/**
 * THE ARTWORK PANEL, DOCKED — the left-hand half of the two-panel editor.
 *
 * Same panel either way; this only decides where it is drawn. Docked it is a column pinned to an
 * edge with no scrim, so the binder beside it stays visible AND clickable — you can keep tapping
 * pockets while it is open, which is the entire reason for having it beside the page instead of
 * over it. Too narrow to dock, it opens as a centred modal instead: covering the binder honestly
 * for a moment beats sitting beside it in a column too thin to show a piece.
 *
 * It exists as its own component rather than a second CardPicker because the two panels are not
 * interchangeable. Only one card browser may be mounted at a time — `browseState` in
 * tcgscan-browse is a module-level singleton that every CatalogBrowser hydrates from and writes
 * back to, and `sendBrowseCommand` is a broadcast — so two browsers would silently corrupt each
 * other's query, sort and similarity state. One browser, one tray.
 */
import { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { SharedValue } from 'react-native-reanimated';

import { ArtworkPanel } from '@/components/binder/ArtworkPanel';
import { ThemedView } from '@/components/themed-view';
import { FontSize, Palette, Radius, Spacing, Weight } from '@/constants/theme';
import { sheet } from '@/constants/ui';
import type { SavedSlice } from '@/data/savedSlices';

/** The tonal inserts, the same set the picker's Insert tab offered. */
const INSERT_COLOURS = [
  '#1F2937',
  '#374151',
  '#6B7280',
  '#9CA3AF',
  '#E5E7EB',
  '#FEF3C7',
  '#FDE68A',
  '#FCA5A5',
  '#BFDBFE',
  '#A7F3D0',
  '#DDD6FE',
  '#F5D0FE',
];

export interface ArtworkDockProps {
  visible: boolean;
  /** False when the window cannot spare the width — the panel becomes a centred modal instead. */
  docked: boolean;
  /** Elastic: whatever the page did not need. */
  width: number;
  /** Which edge. The picker takes the right, so this is the left, but neither is hard-coded here. */
  side?: 'left' | 'right';
  onClose: () => void;
  armedId: string | null;
  onArm: (slice: SavedSlice | null) => void;
  onDragStart: (slice: SavedSlice) => void;
  onDrop: (slice: SavedSlice, windowX: number, windowY: number) => void;
  onRemove: (slice: SavedSlice) => void;
  onNewSlice: () => void;
  /** Inserts live on this side too — see the tab note below. */
  onPickInsert?: (color: string, rowSpan: number, colSpan: number) => void;
  onClear?: () => void;
  ghostOn: SharedValue<number>;
  ghostX: SharedValue<number>;
  ghostY: SharedValue<number>;
}

export function ArtworkDock({
  visible,
  docked,
  width,
  side = 'left',
  onClose,
  onPickInsert,
  onClear,
  ...panel
}: ArtworkDockProps) {
  /**
   * ART AND INSERTS, because both are "something that is not a card" and both belong on the side
   * the card browser is not on. Splitting them across the two panels would have put one non-card
   * thing beside the cards and the other opposite it, for no reason a person could name.
   */
  const [tab, setTab] = useState<'art' | 'insert'>('art');
  const tabs = onPickInsert ? (['art', 'insert'] as const) : (['art'] as const);

  if (!visible) return null;

  const body = (
    <>
      <View style={styles.head}>
        <View style={styles.tabs}>
          {tabs.length > 1
            ? tabs.map((t) => (
                <Pressable
                  key={t}
                  onPress={() => setTab(t)}
                  accessibilityRole="tab"
                  accessibilityState={{ selected: tab === t }}
                  style={[styles.tab, tab === t && styles.tabOn]}>
                  <Text style={[styles.tabText, tab === t && styles.tabTextOn]}>
                    {t === 'art' ? 'Artwork' : 'Inserts'}
                  </Text>
                </Pressable>
              ))
            : null}
        </View>
        <Pressable onPress={onClose} hitSlop={10} accessibilityRole="button">
          <Text style={styles.close}>Done</Text>
        </Pressable>
      </View>
      {tab === 'art' ? (
        <ArtworkPanel {...panel} />
      ) : (
        <ScrollView contentContainerStyle={styles.insertScroll} showsVerticalScrollIndicator={false}>
          <Text style={styles.insertHint}>
            A plain colour behind a pocket — a divider, a spacer, or a rest between runs of cards.
          </Text>
          <View style={styles.swatches}>
            {INSERT_COLOURS.map((c) => (
              <Pressable
                key={c}
                onPress={() => onPickInsert?.(c, 1, 1)}
                accessibilityRole="button"
                accessibilityLabel={`Insert ${c}`}
                style={[styles.swatch, { backgroundColor: c }]}
              />
            ))}
          </View>
          {onClear ? (
            <Pressable onPress={onClear} style={styles.clearBtn} accessibilityRole="button">
              <Text style={styles.clearText}>Leave the pocket empty</Text>
            </Pressable>
          ) : null}
        </ScrollView>
      )}
    </>
  );

  if (docked) {
    return (
      <View
        testID="artwork-dock"
        style={[
          styles.dock,
          { width },
          // The border goes on the side facing the page, whichever edge this is.
          side === 'left'
            ? { left: 0, borderRightWidth: 1, borderRightColor: Palette.hairlineStrong }
            : { right: 0, borderLeftWidth: 1, borderLeftColor: Palette.hairlineStrong },
        ]}>
        {body}
      </View>
    );
  }

  // Not enough width to sit beside the page. A centred sheet, not an edge column: a 300px column
  // pinned to the side of a narrow window is neither one thing nor the other.
  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <View style={sheet.dialogBackdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <ThemedView type="backgroundElement" testID="artwork-modal" style={styles.modalCard}>
          {body}
        </ThemedView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  dock: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    backgroundColor: Palette.surface,
    paddingHorizontal: Spacing.three,
    paddingTop: Spacing.two,
    paddingBottom: Spacing.three,
    // Above the page, below the drag ghost (50) and the resize overlay (40) — the same band the
    // card picker's dock sits in, on the opposite edge.
    zIndex: 70,
  },
  modalCard: {
    width: '100%',
    maxWidth: 640,
    maxHeight: '86%',
    alignSelf: 'center',
    borderRadius: Radius.panel,
    paddingHorizontal: Spacing.three,
    paddingTop: Spacing.two,
    paddingBottom: Spacing.three,
  },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingBottom: 6, gap: Spacing.two },
  tabs: { flexDirection: 'row', gap: 4 },
  tab: { paddingVertical: 4, paddingHorizontal: 10, borderRadius: Radius.pill },
  tabOn: { backgroundColor: Palette.panel },
  tabText: { fontSize: FontSize.label, fontWeight: Weight.semibold, color: Palette.muted2 },
  tabTextOn: { color: Palette.ink2 },
  insertScroll: { gap: Spacing.three, paddingBottom: Spacing.four },
  insertHint: { fontSize: FontSize.sm, color: Palette.muted2, lineHeight: 16 },
  swatches: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  swatch: { width: 56, height: 78, borderRadius: Radius.thumb, borderWidth: 1, borderColor: Palette.hairline },
  clearBtn: { paddingVertical: 8, alignSelf: 'flex-start' },
  clearText: { fontSize: FontSize.label, fontWeight: Weight.semibold, color: Palette.muted2 },
  close: { fontSize: FontSize.label, fontWeight: Weight.semibold, color: Palette.accent },
});
