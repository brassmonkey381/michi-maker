import { useEffect, useRef, useState } from 'react';
import {
  Modal,
  Platform,
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
import { CaptionControls } from '@/components/binder/CaptionControls';
import { CardPicker } from '@/components/binder/CardPicker';
import { ColorField } from '@/components/binder/ColorField';
import { ConfirmDialog, type ConfirmSpec } from '@/components/binder/ConfirmDialog';
import { PageStrip } from '@/components/binder/PageStrip';
import { ShareSheet } from '@/components/binder/ShareSheet';
import { SliceStudio } from '@/components/binder/SliceStudio';
import { Toast, type ToastSpec } from '@/components/binder/Toast';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Palette, Radius, Spacing, Weight, FontSize } from '@/constants/theme';
import { pillChip } from '@/constants/ui';
import { firstFreePlacement, occupiedCells, slotCells, type DemoSlot } from '@/data/binderTypes';
import { DEFAULT_CAPTION_FIELDS, type CaptionFieldKey } from '@/data/cardCaption';
import { isSupabaseConfigured } from '@/lib/env';
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
  // The pocket selected for quick actions (action bar + resize handle); distinct from pickerCell.
  const [selectedSlotId, setSelectedSlotId] = useState<string | null>(null);
  // "Keep adding" fast-fill: after placing a card the picker stays open and jumps to the next pocket.
  const [keepAdding, setKeepAdding] = useState(false);
  // Card labels: master on/off plus the selected metadata fields (display order is fixed in
  // cardCaption.ts, so the toggle order here doesn't matter). Captions show only when both on.
  const [labelsOn, setLabelsOn] = useState(false);
  const [labelFields, setLabelFields] = useState<CaptionFieldKey[]>(DEFAULT_CAPTION_FIELDS);
  const toggleLabelField = (key: CaptionFieldKey) =>
    setLabelFields((cur) => (cur.includes(key) ? cur.filter((k) => k !== key) : [...cur, key]));
  const [confirm, setConfirm] = useState<ConfirmSpec | null>(null);
  const [shareOpen, setShareOpen] = useState(false);
  const [toast, setToast] = useState<ToastSpec | null>(null);
  const toastId = useRef(0);

  // NOTE: we deliberately do NOT prefetch the ~27MB catalog here. Viewing/editing a binder
  // never needs it — card images resolve from the id (cardThumbUrl), and only the badge
  // enrichment reads it passively. The catalog's synchronous JSON.parse freezes the main
  // thread for seconds, so we defer it to when the user actually browses cards: the
  // CardPicker's useCatalog(visible) loads it on open. Opening/creating a binder stays instant.

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

  const selectedSlot = selectedSlotId
    ? (page.slots.find((s) => s.id === selectedSlotId) ?? null)
    : null;

  const showToast = (message: string, withUndo = false) => {
    toastId.current += 1;
    setToast(
      withUndo
        ? { id: toastId.current, message, actionLabel: 'Undo', onAction: store.undo }
        : { id: toastId.current, message },
    );
  };

  // Change page and drop any pocket selection (selection is per-page).
  const changePage = (i: number) => {
    setSelectedSlotId(null);
    setPageIndex(Math.max(0, Math.min(i, binder.pages.length - 1)));
  };

  const closePicker = () => setPickerCell(null);

  // Tapping a filled pocket selects it (for the action bar + resize handle); tapping an empty
  // pocket opens the picker to add. Selecting never opens the sheet.
  const handleSelectSlot = (slot: DemoSlot) => setSelectedSlotId(slot.id);
  const handleAddCell = (row: number, col: number) => {
    setSelectedSlotId(null);
    setPickerCell({ row, col });
  };

  // Drag-to-resize commit: re-place the slot at its fixed top-left with the new footprint.
  const handleResizeSlot = (row: number, col: number, rowSpan: number, colSpan: number) => {
    store.upsertSlot(binder.id, page.id, { row, col, rowSpan, colSpan });
  };

  // The next empty pocket in reading order, treating the just-placed footprint as filled.
  const nextEmptyCell = (r: number, c: number, fr: number, fc: number) => {
    const occ = occupiedCells(page);
    for (let i = 0; i < fr; i += 1) for (let j = 0; j < fc; j += 1) occ.add(`${r + i},${c + j}`);
    for (let rr = 0; rr < page.rows; rr += 1) {
      for (let cc = 0; cc < page.cols; cc += 1) {
        if (!occ.has(`${rr},${cc}`)) return { row: rr, col: cc };
      }
    }
    return null;
  };

  // Placing a card: its footprint comes from its real-world kind (standard 1×1, jumbo 2×2),
  // so a piece's shape always matches its pocket. In "keep adding" mode the sheet stays open
  // and advances to the next empty pocket until the page is full.
  const handlePickCard = (cardId: string) => {
    if (!pickerCell) return;
    const { rows, cols } = footprintForKind(resolveCard(cardId)?.kind);
    const { row, col } = pickerCell;
    store.upsertSlot(binder.id, page.id, { row, col, cardId, type: 'card', rowSpan: rows, colSpan: cols });
    if (keepAdding) {
      const next = nextEmptyCell(row, col, rows, cols);
      if (next) {
        setPickerCell(next);
        return;
      }
    }
    closePicker();
  };

  const replaceSelected = () => {
    if (!selectedSlot) return;
    setPickerCell({ row: selectedSlot.row, col: selectedSlot.col });
  };

  const duplicateSelected = () => {
    if (!selectedSlot) return;
    const dest = firstFreePlacement(page, selectedSlot.rowSpan, selectedSlot.colSpan);
    if (!dest) {
      showToast('No empty pocket to duplicate into');
      return;
    }
    store.upsertSlot(binder.id, page.id, {
      row: dest.row,
      col: dest.col,
      rowSpan: selectedSlot.rowSpan,
      colSpan: selectedSlot.colSpan,
      type: selectedSlot.type,
      cardId: selectedSlot.cardId,
      insertColor: selectedSlot.insertColor,
      imageUrl: selectedSlot.imageUrl,
    });
    showToast('Duplicated');
  };

  const removeSelected = () => {
    if (!selectedSlot) return;
    store.removeSlot(binder.id, page.id, selectedSlot.id);
    setSelectedSlotId(null);
    showToast('Pocket cleared', true);
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
              <View style={styles.headerRight}>
                {isSupabaseConfigured ? (
                  <Pressable onPress={() => setShareOpen(true)} hitSlop={10}>
                    <Text style={[styles.headerAction, { color: theme.text }]}>Share</Text>
                  </Pressable>
                ) : null}
                <Pressable
                  onPress={() => {
                    setEditing((e) => !e);
                    setSelectedSlotId(null);
                  }}
                  hitSlop={10}>
                  <Text style={[styles.headerAction, styles.headerPrimary]}>{editing ? 'Done' : 'Edit'}</Text>
                </Pressable>
              </View>
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
                <NavArrow label="‹" disabled={idx <= 0} onPress={() => changePage(idx - 1)} color={theme.text} />
                <ThemedText type="small" themeColor="textSecondary">
                  Page {idx + 1} / {binder.pages.length}
                </ThemedText>
                <NavArrow
                  label="›"
                  disabled={idx >= binder.pages.length - 1}
                  onPress={() => changePage(idx + 1)}
                  color={theme.text}
                />
              </View>
            </View>

            {/* Card labels — show metadata under each card, and pick which fields. */}
            <CaptionControls
              enabled={labelsOn}
              onToggle={() => setLabelsOn((v) => !v)}
              fields={labelFields}
              onToggleField={toggleLabelField}
            />

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
                captionFields={labelsOn ? labelFields : []}
                selectedSlotId={selectedSlotId}
                onCellPress={handleAddCell}
                onSlotPress={handleSelectSlot}
                onDropSlot={handleDropSlot}
                onResizeSlot={handleResizeSlot}
                onReplaceSlot={replaceSelected}
                onDuplicateSlot={duplicateSelected}
                onRemoveSlot={removeSelected}
                onDeselectSlot={() => setSelectedSlotId(null)}
              />
            </View>

            {editing && (
              <View style={styles.editPanel}>
                {/* Page filmstrip — tap to jump, drag to reorder. */}
                <PageStrip
                  pages={binder.pages}
                  currentIndex={idx}
                  onSelect={changePage}
                  onReorder={(from, to) => {
                    store.reorderPages(binder.id, from, to);
                    changePage(to);
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
                      onPress={() =>
                        setConfirm({
                          title: 'Delete this page?',
                          message: 'The page and everything on it will be removed.',
                          confirmLabel: 'Delete page',
                          destructive: true,
                          onConfirm: () => {
                            store.removePage(binder.id, page.id);
                            changePage(0);
                            showToast('Page deleted', true);
                          },
                        })
                      }
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
                        style={[pillChip.base, active && pillChip.active]}>
                        <Text style={[pillChip.text, active && pillChip.textActive]}>
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
                    onPress={() =>
                      setConfirm({
                        title: 'Delete this binder?',
                        message: 'This binder and all its pages will be permanently deleted.',
                        confirmLabel: 'Delete binder',
                        destructive: true,
                        onConfirm: () => {
                          store.deleteBinder(binder.id);
                          onClose();
                        },
                      })
                    }
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
          keepAdding={keepAdding}
          onToggleKeepAdding={() => setKeepAdding((v) => !v)}
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

        {/* Web keyboard shortcuts (edit mode; disabled while a sheet is open). */}
        <EditorKeyboardShortcuts
          enabled={editing && !pickerCell && !studio && !confirm}
          onUndo={store.undo}
          onRedo={store.redo}
          onDelete={removeSelected}
          onPrevPage={() => changePage(idx - 1)}
          onNextPage={() => changePage(idx + 1)}
        />

        <Toast spec={toast} onDismiss={() => setToast(null)} />
        <ConfirmDialog spec={confirm} onClose={() => setConfirm(null)} />
        <ShareSheet
          visible={shareOpen}
          binderId={binder.id}
          isPublic={!!binder.isPublic}
          onClose={() => setShareOpen(false)}
          onSetPublic={(v) => store.updateBinder(binder.id, { isPublic: v })}
        />
      </ThemedView>
    </Modal>
  );
}

/**
 * Installs web keyboard shortcuts for the editor while `enabled`: ⌘/Ctrl+Z undo, ⇧⌘Z / Ctrl+Y
 * redo, Delete/Backspace to clear the selected pocket, ←/→ to change pages. No-op on native and
 * while typing in a field. A component (not an inline effect) so its hook order stays stable.
 */
function EditorKeyboardShortcuts({
  enabled,
  onUndo,
  onRedo,
  onDelete,
  onPrevPage,
  onNextPage,
}: {
  enabled: boolean;
  onUndo: () => void;
  onRedo: () => void;
  onDelete: () => void;
  onPrevPage: () => void;
  onNextPage: () => void;
}) {
  useEffect(() => {
    if (Platform.OS !== 'web' || !enabled || typeof window === 'undefined') return;
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || target?.isContentEditable) return;
      const meta = e.metaKey || e.ctrlKey;
      const key = e.key.toLowerCase();
      if (meta && key === 'z') {
        e.preventDefault();
        if (e.shiftKey) onRedo();
        else onUndo();
      } else if (meta && key === 'y') {
        e.preventDefault();
        onRedo();
      } else if (e.key === 'Delete' || e.key === 'Backspace') {
        onDelete();
      } else if (e.key === 'ArrowLeft') {
        onPrevPage();
      } else if (e.key === 'ArrowRight') {
        onNextPage();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [enabled, onUndo, onRedo, onDelete, onPrevPage, onNextPage]);
  return null;
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
  dismiss: { flex: 1, backgroundColor: Palette.scrim30 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 12,
  },
  headerAction: { fontSize: FontSize.md, fontWeight: Weight.semibold },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three },
  headerPrimary: { color: Palette.accent },
  titleText: { flex: 1, textAlign: 'center', fontSize: FontSize.title, lineHeight: 28 },
  titleInput: {
    flex: 1,
    fontSize: FontSize.lg,
    fontWeight: Weight.semibold,
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
  badge: { paddingVertical: 3, paddingHorizontal: 10, borderRadius: Radius.pill },
  pageNav: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  navArrow: { fontSize: FontSize.nav, lineHeight: 28, fontWeight: Weight.semibold },
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
    borderRadius: Radius.control,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: FontSize.control,
  },
  detailMultiline: { minHeight: 56, textAlignVertical: 'top' },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  pill: { paddingVertical: 8, paddingHorizontal: 14, borderRadius: Radius.pill, backgroundColor: Palette.panel },
  pillDisabled: { opacity: 0.4 },
  pillDanger: { backgroundColor: Palette.dangerBg },
  pillText: { fontSize: FontSize.body, fontWeight: Weight.semibold, color: Palette.ink2 },
  pillTextDanger: { color: Palette.dangerAlt },
  pressed: { opacity: 0.7 },
  deleteBinder: { marginTop: 20, alignItems: 'center', paddingVertical: 10 },
  deleteBinderText: { color: Palette.dangerAlt, fontSize: FontSize.control, fontWeight: Weight.semibold },
});
