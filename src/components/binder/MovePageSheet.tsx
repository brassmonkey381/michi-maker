/**
 * MOVE THIS PAGE (owner, 2026-09-16). Opened with W while editing. Pick another page by number,
 * then either swap the two, or send this page to sit in front of that one. Both are one commit
 * on the undo stack, and both keep folded art on its pocket pairs the way the filmstrip drag does.
 */
import { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { PillButton, styles as controls } from '@/components/binder/inspector/controls';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { FontSize, Palette, Radius, Weight } from '@/constants/theme';
import type { DemoPage } from '@/data/binderTypes';

export function MovePageSheet({
  pages,
  current,
  onClose,
  onSwap,
  onMoveBefore,
}: {
  pages: DemoPage[];
  /** 0-based index of the page being moved. */
  current: number;
  onClose: () => void;
  onSwap: (target: number) => void;
  /** Move the current page to sit in front of `target`; `pages.length` means to the end. */
  onMoveBefore: (target: number) => void;
}) {
  const [target, setTarget] = useState<number | null>(null);
  const label = (i: number) => (pages[i]?.title ? `${i + 1}: ${pages[i].title}` : `Page ${i + 1}`);
  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Close" />
        <ThemedView type="backgroundElement" style={styles.card} testID="move-page-sheet">
          <View style={styles.head}>
            <ThemedText type="subtitle">Move page {current + 1}</ThemedText>
            <Pressable onPress={onClose} hitSlop={10}>
              <Text style={styles.done}>Cancel</Text>
            </Pressable>
          </View>
          <ThemedText type="small" themeColor="textSecondary">
            Pick the other page, then choose what happens.
          </ThemedText>
          <ScrollView style={styles.grid} contentContainerStyle={styles.gridInner}>
            {pages.map((p, i) => {
              const me = i === current;
              const on = i === target;
              return (
                <Pressable
                  key={p.id}
                  disabled={me}
                  onPress={() => setTarget(i)}
                  accessibilityRole="button"
                  accessibilityState={{ selected: on, disabled: me }}
                  accessibilityLabel={label(i)}
                  testID={`move-page-${i + 1}`}
                  style={[controls.chip, styles.chip, on && controls.chipActive, me && styles.me]}>
                  <Text style={[controls.chipText, on && controls.chipTextActive]}>{i + 1}</Text>
                </Pressable>
              );
            })}
          </ScrollView>
          <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
            {target == null ? 'No page chosen yet.' : label(target)}
          </ThemedText>
          <View style={styles.actions}>
            <PillButton label={target == null ? 'Swap' : `Swap with ${target + 1}`} disabled={target == null} onPress={() => target != null && onSwap(target)} testID="move-page-swap" />
            <PillButton label={target == null ? 'Move in front of' : `Move in front of ${target + 1}`} disabled={target == null} onPress={() => target != null && onMoveBefore(target)} testID="move-page-before" />
            <PillButton label="Move to the end" disabled={current === pages.length - 1} onPress={() => onMoveBefore(pages.length)} testID="move-page-end" />
          </View>
        </ThemedView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', alignItems: 'center', justifyContent: 'center', padding: 16 },
  card: { width: '100%', maxWidth: 520, maxHeight: '86%', borderRadius: Radius.panel, paddingHorizontal: 20, paddingTop: 14, paddingBottom: 18, gap: 10 },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  done: { fontSize: FontSize.md, fontWeight: Weight.semibold, color: Palette.accent },
  grid: { maxHeight: 220 },
  gridInner: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: { minWidth: 40, alignItems: 'center' },
  /** The page being moved: greyed, not a target. */
  me: { opacity: 0.35 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4 },
});
