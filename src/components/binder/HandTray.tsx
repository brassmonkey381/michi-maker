/**
 * THE HAND (MIC-017 editor-hand, owner's pick 2026-11-10). The binder's tray as a hand of cards
 * under the page: up to ~24 cards in three staggered, overlapping rows, the way cards sit when you
 * sort them on a table. Same cards and same handling as the tray (CardTray: DemoBinder.tray) —
 * drag one up into any pocket, or tap it then a pocket; drag a card off the page onto the hand to
 * put it back. The header fills it fast: Suggest (cards that fit this page: similar, palette, theme,
 * the Complete-page fills sent here instead of into pockets), Search (the card browser, each pick
 * lands in the hand), and Clear.
 *
 * Behind the 'editor-hand' dev flag; BinderScreen decides where it sits and owns every store call.
 */
import { useMemo, useState, type RefObject } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import type { SharedValue } from 'react-native-reanimated';

import { TrayChip } from '@/components/binder/CardTray';
import { FontSize, Palette, Radius, Spacing, Weight } from '@/constants/theme';
import type { DemoSlot } from '@/data/binderTypes';

/** Three rows, the hand's shape: a row is offset half a card from the one above it. */
const ROWS = 3;

/** Cards per row and the row each card sits in, for `n` cards. Pure; exported for tests. */
export function handRows(n: number, rows = ROWS): number[][] {
  const perRow = Math.max(1, Math.ceil(n / rows));
  const out: number[][] = [];
  for (let i = 0; i < n; i += perRow) out.push(Array.from({ length: Math.min(perRow, n - i) }, (_, k) => i + k));
  return out;
}

/** A small, stable tilt per card, so the hand looks held rather than gridded (-3..3 degrees). */
function tilt(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i += 1) h = (h * 31 + id.charCodeAt(i)) | 0;
  return ((Math.abs(h) % 7) - 3) * 1;
}

export function HandTray({
  slots,
  armedId,
  onArm,
  onDragStart,
  onDrop,
  onRemove,
  onClear,
  onSuggest,
  onSearch,
  ghostOn,
  ghostX,
  ghostY,
  trayRef,
  onHeight,
}: {
  slots: readonly DemoSlot[];
  armedId: string | null;
  onArm: (slotId: string | null) => void;
  onDragStart: (slot: DemoSlot) => void;
  onDrop: (slot: DemoSlot, windowX: number, windowY: number) => void;
  onRemove: (slot: DemoSlot) => void;
  onClear: () => void;
  onSuggest: () => void;
  onSearch: () => void;
  ghostOn: SharedValue<number>;
  ghostX: SharedValue<number>;
  ghostY: SharedValue<number>;
  trayRef: RefObject<View | null>;
  /** The hand's measured height, so the page leaves room for it. */
  onHeight: (h: number) => void;
}) {
  const [open, setOpen] = useState(true);
  const ordered = useMemo(() => [...slots].sort((a, b) => a.col - b.col), [slots]);
  const rows = useMemo(() => handRows(ordered.length), [ordered.length]);
  const phone = useWindowDimensions().width < 600;
  return (
    <View
      ref={trayRef}
      collapsable={false}
      style={styles.hand}
      testID="editor-hand"
      onLayout={(e) => onHeight(Math.round(e.nativeEvent.layout.height))}>
      <View style={styles.header}>
        <Pressable onPress={() => setOpen((o) => !o)} hitSlop={6} accessibilityRole="button" accessibilityState={{ expanded: open }} style={styles.titleBtn}>
          <Text style={styles.title}>Hand{ordered.length ? ` · ${ordered.length}` : ''}</Text>
          <Text style={styles.chevron}>{open ? '▾' : '▸'}</Text>
        </Pressable>
        <View style={styles.actions}>
          <Pressable onPress={onSuggest} style={[styles.btn, styles.btnPrimary]} accessibilityRole="button" testID="hand-suggest">
            <Text style={[styles.btnText, styles.btnPrimaryText]}>✦ Suggest</Text>
          </Pressable>
          <Pressable onPress={onSearch} style={styles.btn} accessibilityRole="button" testID="hand-search">
            <Text style={styles.btnText}>Search</Text>
          </Pressable>
          {ordered.length ? (
            <Pressable onPress={onClear} style={styles.btn} accessibilityRole="button" accessibilityLabel="Clear the hand">
              <Text style={styles.btnText}>Clear</Text>
            </Pressable>
          ) : null}
        </View>
      </View>
      {open ? (
        ordered.length === 0 ? (
          <Text style={styles.empty}>
            Your hand is empty. Suggest deals cards that fit this page; Search adds the ones you pick. Drag a card up into a pocket, or a card from the page down here.
          </Text>
        ) : (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.scroll}>
            <View>
              {rows.map((row, r) => (
                <View key={r} style={[styles.row, r > 0 && styles.rowStacked, r % 2 === 1 && (phone ? styles.rowOffsetPhone : styles.rowOffset)]}>
                  {row.map((i) => {
                    const slot = ordered[i];
                    return (
                      <View key={slot.id} style={[styles.card, { transform: [{ rotate: `${tilt(slot.id)}deg` }] }]}>
                        <TrayChip
                          slot={slot}
                          large={false}
                          armed={slot.id === armedId}
                          onArm={onArm}
                          onDragStart={onDragStart}
                          onDrop={onDrop}
                          onRemove={onRemove}
                          ghostOn={ghostOn}
                          ghostX={ghostX}
                          ghostY={ghostY}
                        />
                      </View>
                    );
                  })}
                </View>
              ))}
            </View>
          </ScrollView>
        )
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  hand: {
    borderTopWidth: 1,
    borderTopColor: Palette.hairline,
    backgroundColor: Palette.surface,
    paddingBottom: Spacing.two,
  },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Spacing.three, paddingVertical: Spacing.two, gap: Spacing.two },
  titleBtn: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  title: { fontSize: FontSize.label, fontWeight: Weight.bold, color: Palette.ink },
  chevron: { fontSize: FontSize.md, color: Palette.muted },
  actions: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  btn: { minHeight: 32, justifyContent: 'center', paddingHorizontal: 12, borderRadius: Radius.pill, backgroundColor: Palette.panel },
  btnText: { fontSize: FontSize.sm, fontWeight: Weight.semibold, color: Palette.ink },
  btnPrimary: { backgroundColor: Palette.accent },
  btnPrimaryText: { color: Palette.accentText },
  empty: { fontSize: FontSize.sm, color: Palette.muted, lineHeight: 17, paddingHorizontal: Spacing.three, paddingBottom: Spacing.two },
  scroll: { paddingHorizontal: Spacing.three, paddingTop: 2 },
  row: { flexDirection: 'row' },
  // Rows overlap like a held hand; each card overlaps its neighbour.
  rowStacked: { marginTop: -34 },
  rowOffset: { marginLeft: 28 },
  rowOffsetPhone: { marginLeft: 22 },
  card: { marginRight: -14 },
});
