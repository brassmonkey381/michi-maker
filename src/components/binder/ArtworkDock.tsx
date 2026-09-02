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
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import type { SharedValue } from 'react-native-reanimated';

import { ArtworkPanel } from '@/components/binder/ArtworkPanel';
import { ThemedView } from '@/components/themed-view';
import { FontSize, Palette, Radius, Spacing, Weight } from '@/constants/theme';
import { sheet } from '@/constants/ui';
import type { SavedSlice } from '@/data/savedSlices';

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
  ...panel
}: ArtworkDockProps) {
  if (!visible) return null;

  const body = (
    <>
      <View style={styles.head}>
        <Pressable onPress={onClose} hitSlop={10} accessibilityRole="button">
          <Text style={styles.close}>Done</Text>
        </Pressable>
      </View>
      <ArtworkPanel {...panel} />
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
  head: { flexDirection: 'row', justifyContent: 'flex-end', paddingBottom: 2 },
  close: { fontSize: FontSize.label, fontWeight: Weight.semibold, color: Palette.accent },
});
