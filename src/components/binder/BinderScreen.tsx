import { useEffect, useState } from 'react';
import {
  InteractionManager,
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
import { SliceStudio } from '@/components/binder/SliceStudio';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { slotCells } from '@/data/binderTypes';
import { prefetchCatalog } from '@/lib/catalog';
import { binderValue, formatUsd, pageValue, usePriceSummary } from '@/lib/prices';
import { footprintForKind } from '@/data/cardSizing';
import { resolveCard } from '@/data/cardResolver';
import { useBinders } from '@/store/binders';
import { useTheme } from '@/hooks/use-theme';

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
  const [studio, setStudio] = useState<
    { rows: number; cols: number; row: number; col: number; imageUrl?: string } | null
  >(null);

  // Warm the 9.87MB catalog off the editor's first-paint critical path: kick off the
  // load-once fetch/parse only once mount interactions have settled. The persistently
  // mounted CardPicker's useCatalog(visible) subscribes to the same load-once promise,
  // so this shares one fetch. runAfterInteractions resolves promptly on web (no native
  // interaction queue), which is the intended short-delay fallback.
  useEffect(() => {
    const handle = InteractionManager.runAfterInteractions(() => prefetchCatalog());
    return () => handle.cancel();
  }, []);

  // Latest card values (shared load-once fetch) for the fun running totals.
  const priceSummary = usePriceSummary();

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
  // Running totals — decoration only: '' until the summary loads or when no card has a price.
  const pageTotal = priceSummary ? formatUsd(pageValue(page, priceSummary)) : '';
  const binderTotal = priceSummary ? formatUsd(binderValue(binder, priceSummary)) : '';
  const slotAtCell = pickerCell
    ? (page.slots.find((s) => s.row === pickerCell.row && s.col === pickerCell.col) ?? null)
    : null;

  // Example binders are read-only: they can't be edited in place, only duplicated into the
  // user's own binders (where the copy is fully editable).
  const canEdit = !binder.isExample;

  const handleDuplicate = () => {
    const copy = store.duplicateBinder(binder.id);
    if (copy) onOpenBinder?.(copy.id);
  };

  const closePicker = () => setPickerCell(null);

  // Placing a card: its footprint comes from its real-world kind (standard 1×1, jumbo 2×2),
  // so a piece's shape always matches its pocket.
  const handlePickCard = (cardId: string) => {
    if (!pickerCell) return;
    const { rows, cols } = footprintForKind(resolveCard(cardId)?.kind);
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

  const handlePickArtwork = (imageUrl: string, rowSpan: number, colSpan: number) => {
    if (!pickerCell) return;
    store.upsertSlot(binder.id, page.id, { ...pickerCell, type: 'artwork', imageUrl, rowSpan, colSpan });
    closePicker();
  };

  const handlePickSlicedArtwork = (imageUrl: string, rows: number, cols: number) => {
    if (!pickerCell) return;
    store.placeSlicedArtwork(binder.id, page.id, pickerCell.row, pickerCell.col, rows, cols, imageUrl);
    closePicker();
  };

  const handleOpenStudio = (imageUrl: string | undefined, rows: number, cols: number) => {
    if (!pickerCell) return;
    setStudio({ rows, cols, row: pickerCell.row, col: pickerCell.col, imageUrl });
    closePicker();
  };

  const handlePickInsert = (insertColor: string, rowSpan: number, colSpan: number) => {
    if (!pickerCell) return;
    store.upsertSlot(binder.id, page.id, { ...pickerCell, type: 'insert', insertColor, rowSpan, colSpan });
    closePicker();
  };

  // Guess a theme keyword from the binder to seed the artwork search.
  const themeHint =
    ['fire', 'water', 'ocean', 'grass', 'forest', 'electric', 'storm', 'sunset', 'gold', 'psychic', 'dragon', 'ice'].find(
      (k) => binder.title.toLowerCase().includes(k),
    ) ?? '';

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
            {canEdit ? (
              <Pressable onPress={() => setEditing((e) => !e)} hitSlop={10}>
                <Text style={[styles.headerAction, styles.headerPrimary]}>{editing ? 'Done' : 'Edit'}</Text>
              </Pressable>
            ) : (
              <Pressable onPress={handleDuplicate} hitSlop={10}>
                <Text style={[styles.headerAction, styles.headerPrimary]}>Duplicate</Text>
              </Pressable>
            )}
          </View>

          <ScrollView contentContainerStyle={styles.scroll}>
            {/* Binder description — just under the title */}
            {editing ? (
              <TextInput
                value={binder.description ?? ''}
                onChangeText={(description) => store.updateBinder(binder.id, { description })}
                placeholder="Add a binder description…"
                placeholderTextColor={theme.textSecondary}
                multiline
                style={[
                  styles.detailInput,
                  styles.detailMultiline,
                  styles.topDescInput,
                  { color: theme.text, borderColor: theme.backgroundSelected },
                ]}
              />
            ) : binder.description ? (
              <ThemedText type="small" themeColor="textSecondary" style={styles.description}>
                {binder.description}
              </ThemedText>
            ) : null}

            {/* Meta + page navigation */}
            <View style={styles.metaRow}>
              {binderTotal ? (
                <ThemedView type="backgroundElement" style={styles.badge}>
                  <ThemedText type="small" themeColor="textSecondary">
                    {pageTotal ? `Page ${pageTotal} · ` : ''}Binder {binderTotal}
                  </ThemedText>
                </ThemedView>
              ) : null}
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

            {/* Page title + description — just above the page */}
            {editing ? (
              <View style={styles.pageDetails}>
                <TextInput
                  value={page.title ?? ''}
                  onChangeText={(title) => store.updatePage(binder.id, page.id, { title })}
                  placeholder={`Page ${idx + 1} title`}
                  placeholderTextColor={theme.textSecondary}
                  style={[styles.detailInput, { color: theme.text, borderColor: theme.backgroundSelected }]}
                />
                <TextInput
                  value={page.description ?? ''}
                  onChangeText={(description) => store.updatePage(binder.id, page.id, { description })}
                  placeholder="Page description"
                  placeholderTextColor={theme.textSecondary}
                  multiline
                  style={[
                    styles.detailInput,
                    styles.detailMultiline,
                    { color: theme.text, borderColor: theme.backgroundSelected },
                  ]}
                />
              </View>
            ) : page.title || page.description ? (
              <View style={styles.pageDetailsRead}>
                {page.title ? (
                  <ThemedText type="smallBold" style={styles.pageTitle}>
                    {page.title}
                  </ThemedText>
                ) : null}
                {page.description ? (
                  <ThemedText type="small" themeColor="textSecondary" style={styles.pageDescription}>
                    {page.description}
                  </ThemedText>
                ) : null}
              </View>
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
            </View>

            {editing && (
              <View style={styles.editPanel}>
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
                  <PillButton label="Duplicate" onPress={handleDuplicate} />
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
                <ColorField
                  key={page.id}
                  value={page.backgroundColor}
                  onChange={(backgroundColor) =>
                    store.updatePage(binder.id, page.id, { backgroundColor })
                  }
                />

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
          themeHint={themeHint}
          onPickCard={handlePickCard}
          onPickVUnion={handlePickVUnion}
          onPickArtwork={handlePickArtwork}
          onPickSlicedArtwork={handlePickSlicedArtwork}
          onOpenSliceStudio={handleOpenStudio}
          onPickInsert={handlePickInsert}
          onClear={handleClear}
        />

        {studio && (
          <SliceStudio
            rows={studio.rows}
            cols={studio.cols}
            imageUrl={studio.imageUrl}
            onPlace={(panels) => {
              store.placeArtPanels(binder.id, page.id, studio.row, studio.col, panels);
              setStudio(null);
            }}
            onClose={() => setStudio(null)}
          />
        )}
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

const HEX_RE = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

/** A #hex colour field with a live preview swatch. Keyed by page so it re-inits per page. */
function ColorField({ value, onChange }: { value?: string; onChange: (hex: string) => void }) {
  const theme = useTheme();
  const [text, setText] = useState(value ?? '');

  const handleChange = (raw: string) => {
    let next = raw.trim();
    if (next && !next.startsWith('#')) next = `#${next}`;
    setText(next);
    if (HEX_RE.test(next)) onChange(next);
  };

  const preview = HEX_RE.test(text.trim()) ? text.trim() : (value ?? 'transparent');

  return (
    <View style={styles.colorRow}>
      <View style={[styles.colorPreview, { backgroundColor: preview, borderColor: theme.backgroundSelected }]} />
      <TextInput
        value={text}
        onChangeText={handleChange}
        placeholder="#RRGGBB"
        placeholderTextColor={theme.textSecondary}
        autoCapitalize="none"
        autoCorrect={false}
        maxLength={7}
        style={[styles.colorInput, { color: theme.text, borderColor: theme.backgroundSelected }]}
      />
    </View>
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
  topDescInput: { marginTop: 8 },
  pageDetails: { gap: 8, marginTop: 12 },
  pageDetailsRead: { alignItems: 'center', marginTop: 8 },
  pageWrap: { alignItems: 'center', marginVertical: 18 },
  pageTitle: { textAlign: 'center' },
  pageDescription: { marginTop: 4, textAlign: 'center' },
  editPanel: { gap: 8 },
  btnRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  fieldLabel: { marginTop: 12, marginBottom: 2 },
  detailInput: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 15,
  },
  detailMultiline: { minHeight: 56, textAlignVertical: 'top' },
  colorRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  colorPreview: { width: 40, height: 40, borderRadius: 8, borderWidth: 1 },
  colorInput: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 15,
  },
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
