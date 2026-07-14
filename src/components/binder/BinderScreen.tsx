import { useEffect, useRef, useState } from 'react';
import {
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useSharedValue } from 'react-native-reanimated';
import { similarAvailable } from 'tcgscan-browse';

import { AutoFillSheet } from '@/components/binder/AutoFillSheet';
import { BinderGrid, type BinderGridHandle } from '@/components/binder/BinderGrid';
import { CardPicker } from '@/components/binder/CardPicker';
import { BinderPages, type GridRole } from '@/components/binder/BinderPages';
import { ColorField } from '@/components/binder/ColorField';
import { ConfirmDialog, type ConfirmSpec } from '@/components/binder/ConfirmDialog';
import { LikersSheet } from '@/components/binder/LikersSheet';
import { ShareSheet } from '@/components/binder/ShareSheet';
import { SliceStudio } from '@/components/binder/SliceStudio';
import { SlotMultiActions } from '@/components/binder/SlotMultiActions';
import { Toast, type ToastSpec } from '@/components/binder/Toast';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Palette, Radius, Spacing, Weight, FontSize } from '@/constants/theme';
import { pillChip } from '@/constants/ui';
import { firstFreePlacement, occupiedCells, slotCells, uuidv4, type DemoPage, type DemoSlot } from '@/data/binderTypes';
import { fetchLikeCount } from '@/data/binderRepo';
import type { CaptionFieldKey } from '@/data/cardCaption';
import type { ComposePlacement } from '@/data/pageComposer';
import { isSupabaseConfigured } from '@/lib/env';
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
  // "Find similar to all" seed handed to the picker's card browser as an explicit prop (not via
  // the broadcast command bus, which a second mounted browser would steal — see kit initialSimilar).
  const [similarSeed, setSimilarSeed] = useState<string[] | null>(null);
  const [studio, setStudio] = useState<
    { rows: number; cols: number; row: number; col: number; imageUrl?: string } | null
  >(null);
  // The pocket selected for quick actions (action bar + resize handle); distinct from pickerCell.
  const [selectedSlotId, setSelectedSlotId] = useState<string | null>(null);
  // "✨ Fill page" sheet (auto-curate around the selected card).
  const [autoFillOpen, setAutoFillOpen] = useState(false);
  // Ctrl/Cmd multi-select (web): a set of pocket ids highlighted together; releasing the modifier
  // opens the bulk-action modal. `modifierHeld` is read at click time; `multiIdsRef` lets the
  // key-up handler read the latest selection without re-subscribing.
  const [multiIds, setMultiIds] = useState<Set<string>>(new Set());
  const [multiActionsOpen, setMultiActionsOpen] = useState(false);
  const modifierHeld = useRef(false);
  const multiIdsRef = useRef(multiIds);
  // "Keep adding" fast-fill: after placing a card the picker stays open and jumps to the next pocket.
  const [keepAdding, setKeepAdding] = useState(false);
  const [confirm, setConfirm] = useState<ConfirmSpec | null>(null);
  const [shareOpen, setShareOpen] = useState(false);
  const [toast, setToast] = useState<ToastSpec | null>(null);
  // Likes this binder has received (owner view). Fetched on open; tapping opens the likers list.
  const [likeCount, setLikeCount] = useState<number | null>(null);
  const [likesOpen, setLikesOpen] = useState(false);
  // Handles to the three grids in the wide-screen edit spread, for cross-page drag hit-testing.
  const prevRef = useRef<BinderGridHandle>(null);
  const curRef = useRef<BinderGridHandle>(null);
  const nextRef = useRef<BinderGridHandle>(null);
  const toastId = useRef(0);

  // Which spread column (0 prev · 1 current · 2 next) has an active drag, so it renders ABOVE
  // its neighbours — otherwise a card dragged onto the next page paints behind it. Driven by a
  // shared value (set from the drag callbacks) so lifting the column never re-renders mid-drag
  // and cancels the gesture. -1 = no drag.
  const dragCol = useSharedValue(-1);

  // NOTE: we deliberately do NOT prefetch the ~27MB catalog here. Viewing/editing a binder
  // never needs it — card images resolve from the id (cardThumbUrl), and only the badge
  // enrichment reads it passively. The catalog's synchronous JSON.parse freezes the main
  // thread for seconds, so we defer it to when the user actually browses cards: the
  // CardPicker's useCatalog(visible) loads it on open. Opening/creating a binder stays instant.

  // Mirror the multi-selection into a ref so the key-up handler (subscribed once per edit toggle)
  // reads the latest set without re-subscribing.
  useEffect(() => {
    multiIdsRef.current = multiIds;
  }, [multiIds]);

  // Web: track the Ctrl/Cmd modifier so a click can extend a multi-selection, and pop the bulk
  // action modal when it's released with pockets selected. Gated to edit mode.
  useEffect(() => {
    if (Platform.OS !== 'web' || !editing || typeof window === 'undefined') return;
    const isMod = (e: KeyboardEvent) => e.key === 'Control' || e.key === 'Meta';
    const down = (e: KeyboardEvent) => {
      if (isMod(e)) modifierHeld.current = true;
    };
    const up = (e: KeyboardEvent) => {
      if (!isMod(e)) return;
      modifierHeld.current = false;
      if (multiIdsRef.current.size > 0) setMultiActionsOpen(true);
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
    };
  }, [editing]);

  const binder = store.getBinder(binderId);

  // Load the like count for the owner's own (non-example) binder. Keyed on id + example-ness
  // (both stable across edits) so ordinary editing doesn't refetch it.
  useEffect(() => {
    // Examples/local binders never show the chip (gated on canEdit below), so there's no stale
    // count to clear here — only fetch for a real cloud binder, and set state in the callback.
    if (!isSupabaseConfigured || !binder || binder.isExample) return;
    let active = true;
    fetchLikeCount(binder.id)
      .then((n) => {
        if (active) setLikeCount(n);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [binderId, binder?.isExample]);

  if (!binder) {
    return (
      <ThemedView style={styles.flex}>
        <SafeAreaView style={styles.flex} edges={['top']}>
          <View style={styles.header}>
            <Pressable onPress={onClose} hitSlop={10}>
              <Text style={[styles.headerAction, { color: theme.text }]}>Close</Text>
            </Pressable>
          </View>
          <View style={styles.notFound}>
            <ThemedText type="subtitle">Binder not found</ThemedText>
          </View>
        </SafeAreaView>
      </ThemedView>
    );
  }

  const idx = Math.min(pageIndex, binder.pages.length - 1);
  const page = binder.pages[idx];
  // Usable content width — BinderPages owns the spread/single layout; it just needs the breakpoint.
  const available = width - 32;
  // prev/next are kept here for the cross-page drag hit-test (resolveSpreadHit below); the spread
  // layout that shows them lives in BinderPages.
  const prevPage = idx > 0 ? binder.pages[idx - 1] : null;
  const nextPage = idx < binder.pages.length - 1 ? binder.pages[idx + 1] : null;
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

  // In-editor "Duplicate" clones the *current page* (right after it) and jumps to the copy.
  // Set the index directly (not via changePage, which would clamp against the stale page count
  // before the new page lands) — the render clamps `pageIndex` to bounds once it does.
  const handleDuplicatePage = () => {
    const result = store.duplicatePage(binder.id, page.id);
    if (result) {
      setSelectedSlotId(null);
      setPageIndex(result.pageIndex);
      showToast('Page duplicated');
    }
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

  const clearMulti = () => setMultiIds((cur) => (cur.size ? new Set() : cur));

  // Change page and drop any pocket selection (selection is per-page).
  const changePage = (i: number) => {
    setSelectedSlotId(null);
    clearMulti();
    setPageIndex(Math.max(0, Math.min(i, binder.pages.length - 1)));
  };

  const closePicker = () => {
    setPickerCell(null);
    setSimilarSeed(null); // consume the one-shot seed so a later normal open doesn't re-run it
  };

  // Tapping a filled pocket selects it (for the action bar + resize handle); tapping an empty
  // pocket opens the picker to add. Ctrl/Cmd-click instead toggles the pocket in a multi-selection
  // (seeding from any single selection so it extends). Selecting never opens the sheet.
  const handleSelectSlot = (slot: DemoSlot) => {
    if (modifierHeld.current) {
      setMultiIds((cur) => {
        const next = new Set(cur);
        if (next.size === 0 && selectedSlotId) next.add(selectedSlotId);
        if (next.has(slot.id)) next.delete(slot.id);
        else next.add(slot.id);
        return next;
      });
      setSelectedSlotId(null);
      return;
    }
    clearMulti();
    setSelectedSlotId(slot.id);
  };
  const handleAddCell = (row: number, col: number) => {
    setSelectedSlotId(null);
    clearMulti();
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

  // ✨ Fill page: place the composer's picks (one commit → one Undo) and report the result.
  const handleAutoFillPlaced = (placements: ComposePlacement[], methodLabel: string) => {
    const { placed } = store.placeCards(binder.id, page.id, placements);
    setSelectedSlotId(null);
    showToast(
      placed > 0 ? `Filled ${placed} pocket${placed === 1 ? '' : 's'} · ${methodLabel}` : 'Nothing placed',
      placed > 0,
    );
  };

  // --- Bulk actions on the Ctrl/Cmd multi-selection ---
  const closeMultiActions = () => {
    setMultiActionsOpen(false);
    clearMulti();
  };

  const removeMany = () => {
    const ids = [...multiIds];
    for (const id of ids) store.removeSlot(binder.id, page.id, id);
    closeMultiActions();
    if (ids.length) showToast(`Cleared ${ids.length} pocket${ids.length === 1 ? '' : 's'}`, true);
  };

  const duplicateMany = () => {
    // Compute every destination up front against an evolving page copy, so the copies land in
    // DISTINCT free pockets (a naive loop would re-find the same "first free" cell — the collision
    // that 409'd batch-add). Then place them. Stops early if the page runs out of room.
    const chosen = page.slots.filter((s) => multiIds.has(s.id));
    const working: DemoPage = { ...page, slots: [...page.slots] };
    const dests: { slot: DemoSlot; row: number; col: number }[] = [];
    for (const slot of chosen) {
      const dest = firstFreePlacement(working, slot.rowSpan, slot.colSpan);
      if (!dest) break;
      working.slots.push({ ...slot, id: uuidv4(), row: dest.row, col: dest.col });
      dests.push({ slot, row: dest.row, col: dest.col });
    }
    for (const { slot, row, col } of dests) {
      store.upsertSlot(binder.id, page.id, {
        row,
        col,
        rowSpan: slot.rowSpan,
        colSpan: slot.colSpan,
        type: slot.type,
        cardId: slot.cardId,
        insertColor: slot.insertColor,
        imageUrl: slot.imageUrl,
      });
    }
    closeMultiActions();
    const n = dests.length;
    const short = chosen.length - n;
    showToast(short > 0 ? `Duplicated ${n}, ${short} didn’t fit` : `Duplicated ${n}`);
  };

  // Card ids of the selected pockets (card slots only) — the seed for "Find similar to all".
  const selectedCardIds = () =>
    page.slots
      .filter((s) => multiIds.has(s.id) && s.type === 'card' && s.cardId)
      .map((s) => s.cardId as string);

  const findSimilarToAll = () => {
    const cardIds = selectedCardIds();
    if (cardIds.length === 0) return;
    const chosen0 = page.slots.find((s) => multiIds.has(s.id));
    // Hand the seed to the picker as an explicit prop, then open it: the picker's CatalogBrowser
    // runs the multi-similar search on mount. A fresh array each call re-triggers it (kit
    // initialSimilar is ref-guarded). Not the command bus — the home browser would intercept that.
    setSimilarSeed(cardIds);
    const cell = firstFreePlacement(page, 1, 1) ?? (chosen0 ? { row: chosen0.row, col: chosen0.col } : null);
    setMultiActionsOpen(false);
    clearMulti();
    setSelectedSlotId(null);
    if (cell) setPickerCell(cell);
  };

  const handlePickVUnion = (pieces: readonly string[]) => {
    if (!pickerCell) return;
    store.placeVUnion(binder.id, page.id, pickerCell.row, pickerCell.col, pieces);
    closePicker();
  };

  // Batch "Add all to a binder" (multi-select): add each card to the next free 1×1 pocket
  // (addCardToBinder), collect any that don't fit, then report the result in one toast.
  const handlePickCards = (cardIds: string[]) => {
    // One batch pass — each card lands in the next free pocket (pages appended as needed), so they
    // never collide on a cell. A per-card loop re-read stale state and 409'd on every card but the first.
    const { added } = store.addCardsToBinder(binder.id, cardIds);
    closePicker();
    if (added > 0) showToast(`Added ${added} card${added === 1 ? '' : 's'}`);
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

  // Drag-and-drop onto a target cell of `pageId`: same-footprint occupant → swap; empty → move;
  // otherwise it springs back. Shared by the single-page editor and every page in the spread.
  const handleDropOnPage = (pageId: string, slotId: string, toRow: number, toCol: number) => {
    const pg = binder.pages.find((p) => p.id === pageId);
    const moving = pg?.slots.find((s) => s.id === slotId);
    if (!pg || !moving) return;
    const r = Math.max(0, Math.min(toRow, pg.rows - moving.rowSpan));
    const c = Math.max(0, Math.min(toCol, pg.cols - moving.colSpan));
    if (r === moving.row && c === moving.col) return;
    const occupant = pg.slots.find((s) => s.id !== slotId && slotCells(s).includes(`${r},${c}`));
    if (
      occupant &&
      occupant.row === r &&
      occupant.col === c &&
      occupant.rowSpan === moving.rowSpan &&
      occupant.colSpan === moving.colSpan
    ) {
      store.swapSlots(binder.id, pageId, slotId, occupant.id);
    } else {
      store.moveSlot(binder.id, pageId, slotId, r, c);
    }
  };
  const handleDropSlot = (slotId: string, toRow: number, toCol: number) =>
    handleDropOnPage(page.id, slotId, toRow, toCol);

  // Spread cross-page drag: re-measure the grids at drag start, then on drop convert the reported
  // drop point (source-grid-local) into the shared window frame and resolve a page + cell. Keeping
  // the drop point and every page's bounds in ONE measured frame is what makes it reliable — the
  // earlier version mixed the gesture's screen coords with measured origins and misfired.
  // A drag started in `col` (0 prev · 1 current · 2 next): re-measure every grid so the drop
  // hit-test has fresh bounds, and lift that column above its neighbours. Defined as a plain
  // function (not an inline JSX arrow) so mutating the `dragCol` shared value — which the column
  // z-index styles read — doesn't trip react-hooks/immutability.
  const startColumnDrag = (col: number) => {
    prevRef.current?.remeasure();
    curRef.current?.remeasure();
    nextRef.current?.remeasure();
    dragCol.value = col;
  };
  // The grid a drag started in — its localToWindow maps the drop point into the hit-test frame.
  const sourceRefFor = (pageId: string) =>
    pageId === prevPage?.id ? prevRef : pageId === nextPage?.id ? nextRef : curRef;
  const resolveSpreadHit = (winX: number, winY: number) => {
    const check = (pg: DemoPage | null, r: typeof curRef) => {
      if (!pg) return null;
      const cell = r.current?.hitTest(winX, winY);
      return cell ? { pageId: pg.id, row: cell.row, col: cell.col } : null;
    };
    return check(prevPage, prevRef) ?? check(page, curRef) ?? check(nextPage, nextRef);
  };
  // localX/localY: the drop point in the SOURCE grid's inner-content coords (see BinderGrid's
  // onCrossDrop). Convert via that grid to window coords, then resolve the page + cell.
  const handleCrossDrop = (fromPageId: string, slotId: string, localX: number, localY: number) => {
    dragCol.value = -1; // drag ended → drop the column back to its normal stacking
    const win = sourceRefFor(fromPageId).current?.localToWindow(localX, localY);
    if (!win) return; // source grid not measured yet → springs back
    const hit = resolveSpreadHit(win.x, win.y);
    if (!hit) return; // dropped outside any visible page → springs back
    if (hit.pageId === fromPageId) handleDropOnPage(fromPageId, slotId, hit.row, hit.col);
    else store.moveSlotAcrossPages(binder.id, fromPageId, slotId, hit.pageId, hit.row, hit.col);
  };

  // Build the grid for one slot of the shared BinderPages layout. Inspecting → read-only. Editing →
  // wire slot editing + cross-page drag; neighbours are drag-only surfaces (no per-slot editing),
  // the current page and the single (narrow) view are fully editable. Refs stay here so the drag
  // hit-test above (localToWindow / resolveSpreadHit) keeps measuring these exact grids.
  const renderGrid = ({
    page: p,
    width,
    role,
    captionFields,
  }: {
    page: DemoPage;
    width: number;
    role: GridRole;
    captionFields: CaptionFieldKey[];
  }) => {
    if (!editing) {
      return <BinderGrid page={p} width={width} editable={false} captionFields={captionFields} />;
    }
    if (role === 'prev' || role === 'next') {
      return (
        <BinderGrid
          ref={role === 'prev' ? prevRef : nextRef}
          page={p}
          width={width}
          editable
          captionFields={captionFields}
          onCrossDrop={(slotId, x, y) => handleCrossDrop(p.id, slotId, x, y)}
          onDragStart={() => startColumnDrag(role === 'prev' ? 0 : 2)}
        />
      );
    }
    return (
      <BinderGrid
        ref={role === 'current' ? curRef : undefined}
        page={p}
        width={width}
        editable
        captionFields={captionFields}
        selectedSlotId={selectedSlotId}
        multiSelectedIds={multiIds}
        onCellPress={handleAddCell}
        onSlotPress={handleSelectSlot}
        onResizeSlot={handleResizeSlot}
        onReplaceSlot={replaceSelected}
        onDuplicateSlot={duplicateSelected}
        onRemoveSlot={removeSelected}
        onDeselectSlot={() => setSelectedSlotId(null)}
        onAutoFillSlot={() => setAutoFillOpen(true)}
        {...(role === 'current'
          ? {
              onCrossDrop: (slotId: string, x: number, y: number) => handleCrossDrop(p.id, slotId, x, y),
              onDragStart: () => startColumnDrag(1),
            }
          : { onDropSlot: handleDropSlot })}
      />
    );
  };

  return (
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
                style={[
                  styles.titleInput,
                  {
                    color: theme.text,
                    borderColor: theme.backgroundSelected,
                    backgroundColor: theme.backgroundElement,
                  },
                ]}
              />
            ) : (
              <ThemedText type="subtitle" numberOfLines={1} style={styles.titleText}>
                {binder.title}
              </ThemedText>
            )}
            {canEdit ? (
              <View style={styles.headerRight}>
                {isSupabaseConfigured && likeCount !== null ? (
                  <Pressable
                    onPress={() => setLikesOpen(true)}
                    hitSlop={8}
                    accessibilityLabel="See who liked this binder"
                    style={styles.likeChip}>
                    <Text style={styles.likeChipHeart}>♥</Text>
                    <Text style={styles.likeChipText}>{likeCount}</Text>
                  </Pressable>
                ) : null}
                {isSupabaseConfigured ? (
                  <Pressable onPress={() => setShareOpen(true)} hitSlop={10}>
                    <Text style={[styles.headerAction, { color: theme.text }]}>Share</Text>
                  </Pressable>
                ) : null}
                <Pressable
                  onPress={() => {
                    setEditing((e) => !e);
                    setSelectedSlotId(null);
                    clearMulti();
                    setMultiActionsOpen(false);
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
            {/* Binder description — just under the title. Compact + width-capped so it reads as
                one detail field, not a page-wide text area. */}
            {editing ? (
              <LabeledInput
                label="Binder description"
                value={binder.description ?? ''}
                onChangeText={(description) => store.updateBinder(binder.id, { description })}
                placeholder="What is this binder about?"
                multiline
                style={styles.binderDescField}
              />
            ) : binder.description ? (
              <ThemedText type="small" themeColor="textSecondary" style={styles.description}>
                {binder.description}
              </ThemedText>
            ) : null}

            {/* One shared page-browsing surface — arrows · prev·current·next spread · filmstrip ·
                Card labels — identical to the public viewer. Only what each grid *does* differs by
                mode, injected through renderGrid; edit adds the value badge, page-detail inputs and
                filmstrip reordering. */}
            <BinderPages
              binder={binder}
              pageIndex={idx}
              onPageChange={changePage}
              availableWidth={available}
              editable={editing}
              dragCol={dragCol}
              onReorderPages={
                editing
                  ? (from, to) => {
                      store.reorderPages(binder.id, from, to);
                      changePage(to);
                    }
                  : undefined
              }
              pageHeader={
                editing ? (
                  <View style={styles.pageDetails}>
                    <LabeledInput
                      label={`Page ${idx + 1} title`}
                      value={page.title ?? ''}
                      onChangeText={(title) => store.updatePage(binder.id, page.id, { title })}
                      placeholder="Untitled page"
                      style={styles.pageTitleField}
                    />
                    <LabeledInput
                      label={`Page ${idx + 1} description`}
                      value={page.description ?? ''}
                      onChangeText={(description) => store.updatePage(binder.id, page.id, { description })}
                      placeholder="What's on this page?"
                      multiline
                      style={styles.pageDescField}
                    />
                  </View>
                ) : undefined
              }
              renderGrid={renderGrid}
            />

            {editing && (
              <>
                {/* One organized card for the page-level tools, width-matched to the detail
                    fields above so the edit chrome reads as a single column, not scattered rows. */}
                <ThemedView type="backgroundElement" style={styles.editPanel}>
                  <ThemedText type="smallBold" themeColor="textSecondary" style={styles.editPanelTitle}>
                    Editing tools
                  </ThemedText>

                  <View style={styles.btnRow}>
                    <PillButton label="↶ Undo" onPress={store.undo} disabled={!store.canUndo} />
                    <PillButton label="↷ Redo" onPress={store.redo} disabled={!store.canRedo} />
                    <PillButton label="+ Page" onPress={() => store.addPage(binder.id)} />
                    <PillButton label="Duplicate page" onPress={handleDuplicatePage} />
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
                  </View>

                  <View style={styles.inlineRow}>
                    <ThemedText type="small" themeColor="textSecondary" style={styles.inlineLabel}>
                      Page size
                    </ThemedText>
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
                    <ThemedText
                      type="small"
                      themeColor="textSecondary"
                      style={[styles.inlineLabel, styles.inlineLabelGap]}>
                      Background
                    </ThemedText>
                    <View style={styles.colorFieldBox}>
                      <ColorField
                        key={page.id}
                        value={page.backgroundColor}
                        onChange={(backgroundColor) =>
                          store.updatePage(binder.id, page.id, { backgroundColor })
                        }
                      />
                    </View>
                  </View>

                  {isSupabaseConfigured ? (
                    <View style={styles.pageVisRow}>
                      <View style={styles.pageVisText}>
                        <ThemedText type="smallBold">Page visibility</ThemedText>
                        <ThemedText type="small" themeColor="textSecondary">
                          {(page.isPublic ?? true)
                            ? 'Public — shown to anyone viewing this binder.'
                            : 'Private — hidden from public viewers; only you see it.'}
                        </ThemedText>
                      </View>
                      <Switch
                        value={page.isPublic ?? true}
                        onValueChange={(v) => store.updatePage(binder.id, page.id, { isPublic: v })}
                        trackColor={{ true: Palette.accent, false: theme.backgroundSelected }}
                      />
                    </View>
                  ) : null}
                </ThemedView>

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
              </>
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
          onPickCards={handlePickCards}
          onPickArtwork={handlePickArtwork}
          onPickSlicedArtwork={handlePickSlicedArtwork}
          onOpenSliceStudio={handleOpenStudio}
          onPickInsert={handlePickInsert}
          onClear={handleClear}
          keepAdding={keepAdding}
          onToggleKeepAdding={() => setKeepAdding((v) => !v)}
          initialSimilar={similarSeed ?? undefined}
        />

        <AutoFillSheet
          visible={autoFillOpen}
          seedCardId={selectedSlot?.cardId ?? null}
          page={page}
          onClose={() => setAutoFillOpen(false)}
          onPlaced={handleAutoFillPlaced}
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
        {multiActionsOpen ? (
          <SlotMultiActions
            count={multiIds.size}
            onDuplicate={duplicateMany}
            onRemove={removeMany}
            onFindSimilar={
              similarAvailable() && selectedCardIds().length > 0 ? findSimilarToAll : undefined
            }
            onClose={closeMultiActions}
          />
        ) : null}
        <ShareSheet
          visible={shareOpen}
          binderId={binder.id}
          isPublic={!!binder.isPublic}
          onClose={() => setShareOpen(false)}
          onSetPublic={(v) => store.updateBinder(binder.id, { isPublic: v })}
        />
        <LikersSheet visible={likesOpen} binderId={binder.id} onClose={() => setLikesOpen(false)} />
      </ThemedView>
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

/**
 * A previous/next page beside the current one in the wide-screen edit spread. Its cards are
 * draggable (drag one onto the current page to move it, or reach a card in from the current page),
 * but it has no add/resize chrome — tap its label to make it the current page. An empty View keeps
 * the current page centred when there's no neighbour on that side.
 */
/**
 * A compact detail field: a tiny uppercase label floating over a small filled+bordered input,
 * so every editable field reads unmistakably as editable while staying visually quiet. Used for
 * the binder/page title–description fields, which used to be bare page-wide boxes.
 */
function LabeledInput({
  label,
  value,
  onChangeText,
  placeholder,
  multiline = false,
  style,
}: {
  label: string;
  value: string;
  onChangeText: (text: string) => void;
  placeholder?: string;
  multiline?: boolean;
  style?: object;
}) {
  const theme = useTheme();
  return (
    <View style={style}>
      <Text style={[styles.fieldMiniLabel, { color: theme.textSecondary }]}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={theme.textSecondary}
        multiline={multiline}
        style={[
          styles.fieldInput,
          multiline && styles.fieldInputMulti,
          {
            color: theme.text,
            borderColor: theme.backgroundSelected,
            backgroundColor: theme.backgroundElement,
          },
        ]}
      />
    </View>
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
  notFound: { flex: 1, alignItems: 'center', justifyContent: 'center' },
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
  likeChip: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  likeChipHeart: { color: Palette.accent, fontSize: FontSize.md, lineHeight: 18 },
  likeChipText: { color: Palette.ink2, fontSize: FontSize.control, fontWeight: Weight.semibold },
  pageVisRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.three,
    marginTop: Spacing.three,
  },
  pageVisText: { flex: 1, gap: 2 },
  titleText: { flex: 1, textAlign: 'center', fontSize: FontSize.title, lineHeight: 28 },
  titleInput: {
    flex: 1,
    maxWidth: 420,
    alignSelf: 'center',
    fontSize: FontSize.lg,
    fontWeight: Weight.semibold,
    textAlign: 'center',
    borderWidth: 1,
    borderRadius: Radius.control,
    paddingVertical: 5,
    paddingHorizontal: 12,
  },
  scroll: { paddingHorizontal: 16, paddingBottom: 48 },
  description: { marginTop: 10, textAlign: 'center', maxWidth: 640, alignSelf: 'center' },
  // Detail fields share one centred column (matches the edit-tools card) so the editable
  // chrome reads as a single organised stack instead of page-wide boxes.
  binderDescField: { width: '100%', maxWidth: 680, alignSelf: 'center', marginTop: 8 },
  pageDetails: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    width: '100%',
    maxWidth: 680,
    alignSelf: 'center',
    marginTop: 10,
  },
  pageTitleField: { flexGrow: 1, flexBasis: 200 },
  pageDescField: { flexGrow: 2, flexBasis: 280 },
  fieldMiniLabel: {
    fontSize: FontSize.xs,
    fontWeight: Weight.semibold,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 3,
  },
  fieldInput: {
    borderWidth: 1,
    borderRadius: Radius.control,
    paddingHorizontal: 10,
    paddingVertical: 6,
    fontSize: FontSize.control,
  },
  fieldInputMulti: { minHeight: 36, textAlignVertical: 'top' },
  editPanel: {
    width: '100%',
    maxWidth: 680,
    alignSelf: 'center',
    borderRadius: Radius.panel,
    padding: 14,
    gap: 10,
  },
  editPanelTitle: { textTransform: 'uppercase', letterSpacing: 0.5 },
  btnRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  inlineRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 },
  inlineLabel: { marginRight: 2 },
  inlineLabelGap: { marginLeft: 10 },
  colorFieldBox: { width: 170 },
  pill: { paddingVertical: 8, paddingHorizontal: 14, borderRadius: Radius.pill, backgroundColor: Palette.panel },
  pillDisabled: { opacity: 0.4 },
  pillDanger: { backgroundColor: Palette.dangerBg },
  pillText: { fontSize: FontSize.body, fontWeight: Weight.semibold, color: Palette.ink2 },
  pillTextDanger: { color: Palette.dangerAlt },
  pressed: { opacity: 0.7 },
  deleteBinder: { marginTop: 20, alignItems: 'center', paddingVertical: 10 },
  deleteBinderText: { color: Palette.dangerAlt, fontSize: FontSize.control, fontWeight: Weight.semibold },
});
