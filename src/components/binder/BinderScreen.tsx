import { useState } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BinderGrid } from '@/components/binder/BinderGrid';
import { CardPicker } from '@/components/binder/CardPicker';
import { PageStrip } from '@/components/binder/PageStrip';
import { layoutLabel } from '@/components/binder/BinderThumb';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { slotCells } from '@/data/binderTypes';
import { footprintForKind } from '@/data/cardSizing';
import { CARDS_BY_ID } from '@/data/sampleData';
import { useBinders } from '@/store/binders';
import { useTheme } from '@/hooks/use-theme';
import { MICHI_LAYOUT_STYLES } from '@/types/domain';

const BG_SWATCHES = [
  // Light / cream / pastel mats
  '#FFFFFF',
  '#F3ECDD',
  '#FBF4D6',
  '#E7F1F8',
  '#F7E9F0',
  '#F5EFE6',
  '#F3EEE6',
  '#EAF3F8',
  // Tonal mids
  '#D9C7B0',
  '#A7B5C2',
  // Dark mats
  '#141A24',
  '#1B1410',
  '#10141C',
  '#1C1726',
];

const PAGE_SIZES: { label: string; rows: number; cols: number }[] = [
  { label: '3×3', rows: 3, cols: 3 },
  { label: '3×4', rows: 3, cols: 4 },
  { label: '4×3', rows: 4, cols: 3 },
  { label: '4×4', rows: 4, cols: 4 },
];

interface BinderScreenProps {
  binderId: string;
  onClose: () => void;
  onOpenBinder?: (id: string) => void;
}

export function BinderScreen({ binderId, onClose, onOpenBinder }: BinderScreenProps) {
  const store = useBinders();
  const theme = useTheme();
  const { width } = useWindowDimensions();
  const [editing, setEditing] = useState(false);
  const [pageIndex, setPageIndex] = useState(0);
  const [pickerCell, setPickerCell] = useState<{ row: number; col: number } | null>(null);

  const binder = store.getBinder(binderId);

  if (!binder) {
    return (
      <Modal visible transparent animationType="fade" onRequestClose={onClose}>
        <Pressable style={styles.dismiss} onPress={onClose} />
      </Modal>
    );
  }

  const idx = Math.min(pageIndex, binder.pages.length - 1);
  const page = binder.pages[idx];
  const pageWidth = Math.min(width - 32, 460);
  const slotAtCell = pickerCell
    ? (page.slots.find((s) => s.row === pickerCell.row && s.col === pickerCell.col) ?? null)
    : null;

  const closePicker = () => setPickerCell(null);

  // Placing a card: its footprint comes from its real-world kind (standard 1×1, jumbo 2×2),
  // so a piece's shape always matches its pocket.
  const handlePickCard = (cardId: string) => {
    if (!pickerCell) return;
    const { rows, cols } = footprintForKind(CARDS_BY_ID[cardId]?.kind);
    store.upsertSlot(binder.id, page.id, {
      ...pickerCell,
      cardId,
      type: 'card',
      rowSpan: rows,
      colSpan: cols,
    });
    closePicker();
  };

  const handlePickVUnion = (pieces: readonly string[]) => {
    if (!pickerCell) return;
    store.placeVUnion(binder.id, page.id, pickerCell.row, pickerCell.col, pieces);
    closePicker();
  };

  const handlePickInsert = (insertColor: string, rowSpan: number, colSpan: number) => {
    if (!pickerCell) return;
    store.upsertSlot(binder.id, page.id, { ...pickerCell, type: 'insert', insertColor, rowSpan, colSpan });
    closePicker();
  };

  const handleClear = () => {
    if (pickerCell && slotAtCell) store.removeSlot(binder.id, page.id, slotAtCell.id);
    closePicker();
  };

  // Drag-and-drop: drop a slot onto a target cell. Same-footprint occupant → swap; empty →
  // move; otherwise moveSlot no-ops and the card springs back.
  const handleDropSlot = (slotId: string, toRow: number, toCol: number) => {
    const moving = page.slots.find((s) => s.id === slotId);
    if (!moving) return;
    const r = Math.max(0, Math.min(toRow, page.rows - moving.rowSpan));
    const c = Math.max(0, Math.min(toCol, page.cols - moving.colSpan));
    if (r === moving.row && c === moving.col) return;
    const occupant = page.slots.find(
      (s) => s.id !== slotId && slotCells(s).includes(`${r},${c}`),
    );
    if (
      occupant &&
      occupant.row === r &&
      occupant.col === c &&
      occupant.rowSpan === moving.rowSpan &&
      occupant.colSpan === moving.colSpan
    ) {
      store.swapSlots(binder.id, page.id, slotId, occupant.id);
    } else {
      store.moveSlot(binder.id, page.id, slotId, r, c);
    }
  };

  return (
    <Modal visible animationType="slide" onRequestClose={onClose}>
      <ThemedView style={styles.flex}>
        <SafeAreaView style={styles.flex} edges={['top']}>
          {/* Header */}
          <View style={styles.header}>
            <Pressable onPress={onClose} hitSlop={10}>
              <Text style={[styles.headerAction, { color: theme.text }]}>Close</Text>
            </Pressable>
            {editing ? (
              <TextInput
                value={binder.title}
                onChangeText={(title) => store.updateBinder(binder.id, { title })}
                placeholder="Binder title"
                placeholderTextColor={theme.textSecondary}
                style={[styles.titleInput, { color: theme.text, borderColor: theme.backgroundSelected }]}
              />
            ) : (
              <ThemedText type="subtitle" numberOfLines={1} style={styles.titleText}>
                {binder.title}
              </ThemedText>
            )}
            <Pressable onPress={() => setEditing((e) => !e)} hitSlop={10}>
              <Text style={[styles.headerAction, styles.headerPrimary]}>{editing ? 'Done' : 'Edit'}</Text>
            </Pressable>
          </View>

          <ScrollView contentContainerStyle={styles.scroll}>
            {/* Meta + page navigation */}
            <View style={styles.metaRow}>
              <ThemedView type="backgroundElement" style={styles.badge}>
                <ThemedText type="small" themeColor="textSecondary">
                  {layoutLabel(binder.layoutStyle)}
                </ThemedText>
              </ThemedView>
              <View style={styles.pageNav}>
                <NavArrow label="‹" disabled={idx <= 0} onPress={() => setPageIndex(idx - 1)} color={theme.text} />
                <ThemedText type="small" themeColor="textSecondary">
                  Page {idx + 1} / {binder.pages.length}
                </ThemedText>
                <NavArrow
                  label="›"
                  disabled={idx >= binder.pages.length - 1}
                  onPress={() => setPageIndex(idx + 1)}
                  color={theme.text}
                />
              </View>
            </View>

            {binder.description ? (
              <ThemedText type="small" themeColor="textSecondary" style={styles.description}>
                {binder.description}
              </ThemedText>
            ) : null}

            {/* The page */}
            <View style={styles.pageWrap}>
              <BinderGrid
                page={page}
                width={pageWidth}
                editable={editing}
                selectedSlotId={slotAtCell?.id}
                onCellPress={(row, col) => setPickerCell({ row, col })}
                onSlotPress={(slot) => setPickerCell({ row: slot.row, col: slot.col })}
                onDropSlot={handleDropSlot}
              />
              {page.title ? (
                <ThemedText type="small" themeColor="textSecondary" style={styles.pageTitle}>
                  {page.title}
                </ThemedText>
              ) : null}
            </View>

            {editing && (
              <View style={styles.editPanel}>
                {!binder.isExample ? null : (
                  <ThemedView type="backgroundElement" style={styles.exampleBanner}>
                    <ThemedText type="small" themeColor="textSecondary" style={styles.flex}>
                      Example binder — edits are local. Duplicate to keep your own copy.
                    </ThemedText>
                  </ThemedView>
                )}

                {/* Page filmstrip — tap to jump, drag to reorder. */}
                <PageStrip
                  pages={binder.pages}
                  currentIndex={idx}
                  onSelect={setPageIndex}
                  onReorder={(from, to) => {
                    store.reorderPages(binder.id, from, to);
                    setPageIndex(to);
                  }}
                />

                <View style={styles.btnRow}>
                  <PillButton label="↶ Undo" onPress={store.undo} disabled={!store.canUndo} />
                  <PillButton label="↷ Redo" onPress={store.redo} disabled={!store.canRedo} />
                  <PillButton label="+ Page" onPress={() => store.addPage(binder.id)} />
                  {binder.pages.length > 1 && (
                    <PillButton
                      label="Delete page"
                      tone="danger"
                      onPress={() => {
                        store.removePage(binder.id, page.id);
                        setPageIndex(0);
                      }}
                    />
                  )}
                  <PillButton
                    label="Duplicate"
                    onPress={() => {
                      const copy = store.duplicateBinder(binder.id);
                      if (copy) onOpenBinder?.(copy.id);
                    }}
                  />
                </View>

                <ThemedText type="small" themeColor="textSecondary" style={styles.fieldLabel}>
                  Page size
                </ThemedText>
                <View style={styles.chipRow}>
                  {PAGE_SIZES.map((size) => {
                    const active = page.rows === size.rows && page.cols === size.cols;
                    return (
                      <Pressable
                        key={size.label}
                        onPress={() =>
                          store.updatePage(binder.id, page.id, { rows: size.rows, cols: size.cols })
                        }
                        style={[styles.chip, active && styles.chipActive]}>
                        <Text style={[styles.chipText, active && styles.chipTextActive]}>
                          {size.label}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>

                <ThemedText type="small" themeColor="textSecondary" style={styles.fieldLabel}>
                  Page background
                </ThemedText>
                <View style={styles.swatchRow}>
                  {BG_SWATCHES.map((color) => (
                    <Pressable
                      key={color}
                      onPress={() => store.updatePage(binder.id, page.id, { backgroundColor: color })}
                      style={[
                        styles.swatch,
                        { backgroundColor: color },
                        page.backgroundColor === color && styles.swatchActive,
                      ]}
                    />
                  ))}
                </View>

                <ThemedText type="small" themeColor="textSecondary" style={styles.fieldLabel}>
                  Layout style
                </ThemedText>
                <View style={styles.chipRow}>
                  {MICHI_LAYOUT_STYLES.map((style) => {
                    const active = binder.layoutStyle === style.value;
                    return (
                      <Pressable
                        key={style.value}
                        onPress={() => store.updateBinder(binder.id, { layoutStyle: style.value })}
                        style={[styles.chip, active && styles.chipActive]}>
                        <Text style={[styles.chipText, active && styles.chipTextActive]}>{style.label}</Text>
                      </Pressable>
                    );
                  })}
                </View>

                {!binder.isExample && (
                  <Pressable
                    onPress={() => {
                      store.deleteBinder(binder.id);
                      onClose();
                    }}
                    style={styles.deleteBinder}>
                    <Text style={styles.deleteBinderText}>Delete binder</Text>
                  </Pressable>
                )}
              </View>
            )}
          </ScrollView>
        </SafeAreaView>

        <CardPicker
          visible={pickerCell != null}
          page={page}
          cell={pickerCell}
          slot={slotAtCell}
          onClose={closePicker}
          onPickCard={handlePickCard}
          onPickVUnion={handlePickVUnion}
          onPickInsert={handlePickInsert}
          onClear={handleClear}
        />
      </ThemedView>
    </Modal>
  );
}

function NavArrow({
  label,
  disabled,
  onPress,
  color,
}: {
  label: string;
  disabled: boolean;
  onPress: () => void;
  color: string;
}) {
  return (
    <Pressable onPress={onPress} disabled={disabled} hitSlop={8} style={disabled && styles.navDisabled}>
      <Text style={[styles.navArrow, { color }]}>{label}</Text>
    </Pressable>
  );
}

function PillButton({
  label,
  onPress,
  tone = 'default',
  disabled = false,
}: {
  label: string;
  onPress: () => void;
  tone?: 'default' | 'danger';
  disabled?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.pill,
        tone === 'danger' && styles.pillDanger,
        pressed && styles.pressed,
        disabled && styles.pillDisabled,
      ]}>
      <Text style={[styles.pillText, tone === 'danger' && styles.pillTextDanger]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  dismiss: { flex: 1, backgroundColor: 'rgba(0,0,0,0.3)' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 12,
  },
  headerAction: { fontSize: 16, fontWeight: '600' },
  headerPrimary: { color: '#3B82F6' },
  titleText: { flex: 1, textAlign: 'center', fontSize: 22, lineHeight: 28 },
  titleInput: {
    flex: 1,
    fontSize: 18,
    fontWeight: '600',
    textAlign: 'center',
    borderBottomWidth: 1,
    paddingVertical: 4,
  },
  scroll: { paddingHorizontal: 16, paddingBottom: 48 },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 4,
  },
  badge: { paddingVertical: 3, paddingHorizontal: 10, borderRadius: 999 },
  pageNav: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  navArrow: { fontSize: 26, lineHeight: 28, fontWeight: '600' },
  navDisabled: { opacity: 0.3 },
  description: { marginTop: 10, textAlign: 'center' },
  pageWrap: { alignItems: 'center', marginVertical: 18 },
  pageTitle: { marginTop: 10 },
  editPanel: { gap: 8 },
  exampleBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 12,
    marginBottom: 4,
  },
  btnRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  fieldLabel: { marginTop: 12, marginBottom: 2 },
  swatchRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  swatch: {
    width: 32,
    height: 32,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(128,128,128,0.35)',
  },
  swatchActive: { borderWidth: 3, borderColor: '#3B82F6' },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { paddingVertical: 6, paddingHorizontal: 12, borderRadius: 999, backgroundColor: '#f0f0f3' },
  chipActive: { backgroundColor: '#3B82F6' },
  chipText: { fontSize: 13, color: '#333' },
  chipTextActive: { color: '#fff', fontWeight: '600' },
  pill: { paddingVertical: 8, paddingHorizontal: 14, borderRadius: 999, backgroundColor: '#f0f0f3' },
  pillDisabled: { opacity: 0.4 },
  pillDanger: { backgroundColor: '#fdeaea' },
  pillText: { fontSize: 14, fontWeight: '600', color: '#333' },
  pillTextDanger: { color: '#c0392b' },
  pressed: { opacity: 0.7 },
  deleteBinder: { marginTop: 20, alignItems: 'center', paddingVertical: 10 },
  deleteBinderText: { color: '#c0392b', fontSize: 15, fontWeight: '600' },
});
