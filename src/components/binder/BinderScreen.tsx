import { useEffect, useMemo, useRef, useState } from 'react';
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
import Animated, { useAnimatedStyle, useSharedValue } from 'react-native-reanimated';
import { similarAvailable } from 'tcgscan-browse';

import { AddToBinderSheet } from '@/components/binder/AddToBinderSheet';
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
import { Fonts, Palette, Radius, Spacing, Weight, FontSize } from '@/constants/theme';
import {
  firstFreePlacement,
  occupiedCells,
  pagesForCards,
  slotCells,
  uuidv4,
  type DemoPage,
  type DemoSlot,
} from '@/data/binderTypes';
import { fetchLikeCount } from '@/data/binderRepo';
import { isPrivateArt } from '@/data/artAttributionCheck';
import { artPieceAllowed, pageSide, REAL_PAGE_SIZES } from '@/data/binderPhysics';
import type { CaptionFieldKey } from '@/data/cardCaption';
import type { ComposePlacement } from '@/data/pageComposer';
import { isSupabaseConfigured } from '@/lib/env';
import { footprintForKind } from '@/data/cardSizing';
import { resolveCard } from '@/data/cardResolver';
import { addSavedSlices, removeSavedSlice, sliceSignature, slotSignature, useSavedSlices, useSavedSlicesSync, type SavedSlice } from '@/data/savedSlices';
import { binderLimitMessage, pageLimitMessage } from '@/data/limitMessages';
import { TIER_LIMITS } from '@/data/tiers';
import { SliceTray, SliceThumb } from '@/components/binder/SliceTray';
import type { CatalogCard } from '@/lib/catalog';
import { isBlankPage, useBinders } from '@/store/binders';
import { useTheme } from '@/hooks/use-theme';

// Real side-load page grids only — 4 rows × 3 columns doesn't exist physically (binderPhysics).
const PAGE_SIZES = REAL_PAGE_SIZES;

/** Every free footprint on `page` where `slice` legally fits (side-load physics) — the pockets
 *  highlighted while a tray slice is armed or dragged, and the set drops are validated against. */
function computeDropTargets(
  slice: SavedSlice,
  page: DemoPage,
  pageIndex: number,
): { row: number; col: number; rs: number; cs: number }[] {
  const side = pageSide(pageIndex);
  const occupied = new Set(page.slots.flatMap((s) => slotCells(s)));
  const out: { row: number; col: number; rs: number; cs: number }[] = [];
  for (let r = 0; r + slice.rs <= page.rows; r += 1) {
    for (let c = 0; c + slice.cs <= page.cols; c += 1) {
      let free = true;
      for (let i = 0; i < slice.rs && free; i += 1)
        for (let j = 0; j < slice.cs && free; j += 1)
          if (occupied.has(`${r + i},${c + j}`)) free = false;
      if (free && artPieceAllowed(c, slice.rs, slice.cs, page.cols, side).ok)
        out.push({ row: r, col: c, rs: slice.rs, cs: slice.cs });
    }
  }
  return out;
}

interface BinderScreenProps {
  binderId: string;
  onClose: () => void;
  onOpenBinder?: (id: string) => void;
}

export function BinderScreen({ binderId, onClose, onOpenBinder }: BinderScreenProps) {
  const store = useBinders();
  const theme = useTheme();
  const { width } = useWindowDimensions();
  // Keep the saved-slice tray synced to the current (guest or signed-in) user while editing.
  useSavedSlicesSync();
  // Live tray size — the artUploads cap is a retention cap on slices KEPT in the account.
  const traySlices = useSavedSlices();
  // "Artworks kept" = distinct content signatures across the tray AND every placed artwork slot.
  // Placed art only reaches the tray on the NEXT sync (the import scan), so counting the tray
  // alone would let repeated placements in one session sail past the cap unseen. Same signature
  // vocabulary as the import scan, so a tray slice placed into a pocket counts once. Declared here
  // (before any early return) so the hook order is stable — see the `if (!binder)` guard below.
  const keptArtworks = useMemo(() => {
    const sigs = new Set(traySlices.map(sliceSignature));
    for (const b of store.userBinders) {
      for (const p of b.pages) {
        for (const s of p.slots) {
          if (s.type === 'artwork' && s.imageUrl) sigs.add(slotSignature(s));
        }
      }
    }
    return sigs.size;
  }, [traySlices, store.userBinders]);
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
  // Bulk multi-select "Add to another binder…" — the card ids awaiting a target binder.
  const [addElsewhereIds, setAddElsewhereIds] = useState<string[] | null>(null);
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

  // Saved-slice placement: a slice is either "armed" by a tap (then a pocket tap drops it) or
  // dragged; both surface the legal drop targets. The ghost shared values track the finger during
  // a drag so the floating preview follows without re-rendering.
  const [armedSlice, setArmedSlice] = useState<SavedSlice | null>(null);
  const [dragSlice, setDragSlice] = useState<SavedSlice | null>(null);
  const ghostOn = useSharedValue(0);
  const ghostX = useSharedValue(0);
  const ghostY = useSharedValue(0);
  const ghostStyle = useAnimatedStyle(() => ({
    opacity: ghostOn.value,
    transform: [{ translateX: ghostX.value - 34 }, { translateY: ghostY.value - 24 }],
  }));

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
  // Enough room to sit the title fields and page tools side by side (else they stack).
  const wideEditor = width >= 900;
  // Usable content width — BinderPages owns the spread/single layout; it just needs the breakpoint.
  const available = width - 32;
  // prev/next are kept here for the cross-page drag hit-test (resolveSpreadHit below); the spread
  // layout that shows them lives in BinderPages.
  const prevPage = idx > 0 ? binder.pages[idx - 1] : null;
  const nextPage = idx < binder.pages.length - 1 ? binder.pages[idx + 1] : null;
  const slotAtCell = pickerCell
    ? (page.slots.find((s) => s.row === pickerCell.row && s.col === pickerCell.col) ?? null)
    : null;

  // The slice currently being placed (dragged wins over armed) and the pockets it may drop
  // into — computed for EVERY page in the visible spread (current + prev/next neighbours or the
  // double-sided partner), so all reachable pockets light up, not just the active page's.
  const activeSlice = dragSlice ?? armedSlice;
  const sliceTargets = (pg: DemoPage | null, pgIndex: number) =>
    activeSlice && pg ? computeDropTargets(activeSlice, pg, pgIndex) : undefined;
  const dropTargets = sliceTargets(page, idx);
  const prevDropTargets = sliceTargets(prevPage, idx - 1);
  const nextDropTargets = sliceTargets(nextPage, idx + 1);

  // Drop a saved slice into a pocket of any visible page, re-checking side-load physics and
  // occupancy (matches the highlighted targets). Placing keeps the slice in the tray, so it can
  // fill more pockets.
  const placeSliceOnPage = (slice: SavedSlice, pg: DemoPage, pgIndex: number, row: number, col: number) => {
    // PRIVATE art (pulled from a URL, or any non-bucket hotlink) can never enter a shared binder —
    // deny, don't silently drop.
    if (binder.isPublic && isPrivateArt(slice.attribution, slice.imageUrl)) {
      showToast('This is a shared binder — private art (added from a link) can’t go in it. Upload your own art instead.', true);
      return;
    }
    if (row + slice.rs > pg.rows || col + slice.cs > pg.cols) {
      showToast('That slice doesn’t fit there.');
      return;
    }
    const verdict = artPieceAllowed(col, slice.rs, slice.cs, pg.cols, pageSide(pgIndex));
    if (!verdict.ok) {
      showToast(verdict.reason ?? 'That pocket doesn’t fit this slice.');
      return;
    }
    const occupied = new Set(pg.slots.flatMap((s) => slotCells(s)));
    for (let i = 0; i < slice.rs; i += 1)
      for (let j = 0; j < slice.cs; j += 1)
        if (occupied.has(`${row + i},${col + j}`)) {
          showToast('That pocket is already filled.');
          return;
        }
    store.placeArtPanels(binder.id, pg.id, row, col, [
      {
        r: 0,
        c: 0,
        rs: slice.rs,
        cs: slice.cs,
        imageUrl: slice.imageUrl,
        crop: slice.crop ?? { x: 0, y: 0, w: 1, h: 1 },
        fit: slice.fit ?? 'cover',
        transform: slice.transform,
        attribution: slice.attribution,
      },
    ]);
  };
  const placeSliceAt = (slice: SavedSlice, row: number, col: number) =>
    placeSliceOnPage(slice, page, idx, row, col);
  const handleSliceDragStart = (slice: SavedSlice) => {
    // Fresh bounds for every visible grid before the drop hit-test (scroll-safe) — a tray slice
    // can land on the neighbours too.
    prevRef.current?.remeasure();
    curRef.current?.remeasure();
    nextRef.current?.remeasure();
    setArmedSlice(null);
    setDragSlice(slice);
  };
  const handleSliceDrop = (slice: SavedSlice, windowX: number, windowY: number) => {
    setDragSlice(null);
    const hit = resolveSpreadHit(windowX, windowY);
    if (!hit) return;
    const pgIndex = binder.pages.findIndex((p) => p.id === hit.pageId);
    if (pgIndex < 0) return;
    placeSliceOnPage(slice, binder.pages[pgIndex], pgIndex, hit.row, hit.col);
  };
  // Removing a tray slice also clears its placed copies everywhere (same content signature).
  // If any exist, confirm first — this reaches into other binders, not just the open one.
  const handleRemoveSlice = (slice: SavedSlice) => {
    const sig = sliceSignature(slice);
    const placed = store.userBinders.reduce(
      (n, b) =>
        n +
        b.pages.reduce(
          (m, p) =>
            m +
            p.slots.filter((s) => s.type === 'artwork' && !!s.imageUrl && slotSignature(s) === sig)
              .length,
          0,
        ),
      0,
    );
    if (placed === 0) {
      removeSavedSlice(slice.id);
      showToast('Slice removed from your tray', true);
      return;
    }
    setConfirm({
      title: 'Delete this slice?',
      message: `This piece fills ${placed} pocket${placed === 1 ? '' : 's'} across your binders. Deleting it clears ${placed === 1 ? 'that pocket' : 'those pockets'} too.`,
      confirmLabel: 'Delete slice',
      destructive: true,
      onConfirm: () => {
        const cleared = store.removeArtworkBySignature(sig);
        removeSavedSlice(slice.id);
        showToast(`Slice deleted, ${cleared} pocket${cleared === 1 ? '' : 's'} cleared`, true);
      },
    });
  };

  // Open the studio to cut a fresh set of slices — page-sized, not tied to a pocket.
  const openStudioForPage = () =>
    setStudio({ rows: page.rows, cols: page.cols, row: 0, col: 0, imageUrl: undefined });

  // Example binders are read-only: they can't be edited in place, only duplicated into the
  // user's own binders (where the copy is fully editable). Demo binders (the "Try it out!"
  // showcase) are likewise read-only and not shareable — canEdit gates both the edit toggle and
  // the share button, so a demo binder can only be viewed or deleted.
  const canEdit = !binder.isExample && !binder.isDemo;

  const handleDuplicate = () => {
    const copy = store.duplicateBinder(binder.id);
    if (copy) onOpenBinder?.(copy.id);
    // The store refuses past the binder cap — say so instead of silently doing nothing.
    else showToast(binderLimitMessage(store.tier, store.limits));
  };

  // Structural page edits re-space the binder with blank pages when folded 1×2 art would land
  // on the wrong side of the spine (see binderPhysics.requiredPageSide) — say so in the toast.
  const parityNote = (base: string, blanks: number | undefined) =>
    blanks
      ? `${base}. ${blanks > 1 ? 'Blank pages were' : 'A blank page was'} added so folded art stays on its pocket pairs.`
      : base;

  // In-editor "Duplicate" clones the *current page* (right after it) and jumps to the copy.
  // Set the index directly (not via changePage, which would clamp against the stale page count
  // before the new page lands) — the render clamps `pageIndex` to bounds once it does.
  const handleDuplicatePage = () => {
    if (store.pageLimitReached(binder.id)) {
      showToast(pageLimitMessage(store.tier, store.limits));
      return;
    }
    const result = store.duplicatePage(binder.id, page.id);
    if (result) {
      setSelectedSlotId(null);
      setPageIndex(result.pageIndex);
      showToast(parityNote('Page duplicated', result.blanksInserted));
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
    // A slice armed from the tray drops here instead of opening the picker (tap-to-place).
    if (armedSlice) {
      placeSliceAt(armedSlice, row, col);
      return;
    }
    setSelectedSlotId(null);
    clearMulti();
    setPickerCell({ row, col });
  };

  // Drag-to-resize commit: re-place the slot at its fixed top-left with the new footprint.
  // Artwork obeys side-load physics — a piece can't grow into a shape that can't be inserted.
  const handleResizeSlot = (row: number, col: number, rowSpan: number, colSpan: number) => {
    const resizing = page.slots.find((s) => s.row === row && s.col === col);
    if (resizing?.type === 'artwork') {
      const verdict = artPieceAllowed(col, rowSpan, colSpan, page.cols, pageSide(pageIndex));
      if (!verdict.ok) {
        showToast(verdict.reason ?? 'That art shape can’t be inserted into side-load pockets.');
        return;
      }
    }
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
  // and advances to the next empty pocket until the page is full. The browser passes the full
  // card along; for guests (no catalog → resolveCard misses) that carried kind is what keeps a
  // jumbo landing as 2×2 instead of collapsing to 1×1.
  const handlePickCard = (cardId: string, card?: CatalogCard) => {
    if (!pickerCell) return;
    const { rows, cols } = footprintForKind(card?.kind ?? resolveCard(cardId)?.kind);
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

  // Bulk "Add to another binder": copy the selected cards into a chosen (or new) binder.
  const addSelectionToBinder = () => {
    const cardIds = selectedCardIds();
    setMultiActionsOpen(false);
    clearMulti();
    if (cardIds.length > 0) setAddElsewhereIds(cardIds);
  };
  const addElsewhereTo = (targetId: string) => {
    if (!addElsewhereIds?.length) return;
    const { added } = store.addCardsToBinder(targetId, addElsewhereIds);
    const title = store.getBinder(targetId)?.title ?? 'binder';
    setAddElsewhereIds(null);
    if (added > 0) showToast(`Added ${added} card${added === 1 ? '' : 's'} to ${title}`);
  };
  const addElsewhereNew = () => {
    if (!addElsewhereIds?.length) return;
    const copy = store.createBinder({ title: 'New binder', pages: pagesForCards(addElsewhereIds) });
    const count = addElsewhereIds.length;
    setAddElsewhereIds(null);
    showToast(`Added ${count} card${count === 1 ? '' : 's'} to ${copy.title}`);
  };

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

  // The artworks-kept cap covers EVERY way new art enters the account: studio saves are gated
  // in the studio, and direct placements are gated here — each placed piece is mirrored into
  // the tray by the import scan, so an unchecked placement would grow the tray past the cap
  // silently. `newPieces` is the footprint's piece count (an upper bound: folded pairs merge).
  const artCapBlocks = (newPieces: number): boolean => {
    if (keptArtworks + newPieces <= store.limits.artUploads) return false;
    showToast(
      store.tier === 'guest'
        ? `Guests can keep ${store.limits.artUploads} artworks. Sign in (free) to keep up to ${TIER_LIMITS.free.artUploads}.`
        : `You’ve reached your ${store.limits.artUploads}-artwork limit. Upgrade for more room.`,
    );
    return true;
  };

  const handlePickArtwork = (imageUrl: string, rowSpan: number, colSpan: number) => {
    if (!pickerCell) return;
    if (artCapBlocks(rowSpan * colSpan)) {
      closePicker();
      return;
    }
    // Through placeArtPanels so side-load physics applies: a footprint that isn't a single
    // insertable piece (1×1, or a folded 1×2 on an inside-edge pair) is split into legal
    // pieces with proportional crops — the assembled picture looks the same.
    store.placeArtPanels(binder.id, page.id, pickerCell.row, pickerCell.col, [
      { r: 0, c: 0, rs: rowSpan, cs: colSpan, imageUrl, crop: { x: 0, y: 0, w: 1, h: 1 }, fit: 'cover' },
    ]);
    closePicker();
  };

  const handlePickSlicedArtwork = (imageUrl: string, rows: number, cols: number) => {
    if (!pickerCell) return;
    if (artCapBlocks(rows * cols)) {
      closePicker();
      return;
    }
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
    const pgIndex = binder.pages.findIndex((p) => p.id === pageId);
    const pg = pgIndex >= 0 ? binder.pages[pgIndex] : undefined;
    const moving = pg?.slots.find((s) => s.id === slotId);
    if (!pg || !moving) return;
    const r = Math.max(0, Math.min(toRow, pg.rows - moving.rowSpan));
    const c = Math.max(0, Math.min(toCol, pg.cols - moving.colSpan));
    if (r === moving.row && c === moving.col) return;
    // A folded 2-wide art piece only re-inserts at an inside-edge pocket pair — which pair is
    // legal depends on the TARGET page's side of the spine. (Legacy wider pieces are left
    // grandfathered: moving them neither fixes nor worsens their physics.)
    if (moving.type === 'artwork' && moving.colSpan === 2 && moving.rowSpan === 1) {
      const verdict = artPieceAllowed(c, 1, 2, pg.cols, pageSide(pgIndex));
      if (!verdict.ok) {
        showToast(verdict.reason ?? 'That pocket pair doesn’t open along the same edge.');
        return;
      }
    }
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
      const nIdx = role === 'prev' ? idx - 1 : idx + 1;
      return (
        <BinderGrid
          ref={role === 'prev' ? prevRef : nextRef}
          page={p}
          width={width}
          editable
          captionFields={captionFields}
          // A tray slice reaches the neighbours too: show its legal pockets here, and let an
          // armed slice tap-place onto them (drags resolve via resolveSpreadHit regardless).
          dropTargets={role === 'prev' ? prevDropTargets : nextDropTargets}
          {...(armedSlice
            ? { onCellPress: (row: number, col: number) => placeSliceOnPage(armedSlice, p, nIdx, row, col) }
            : {})}
          onCrossDrop={(slotId, x, y) => handleCrossDrop(p.id, slotId, x, y)}
          onDragStart={() => startColumnDrag(role === 'prev' ? 0 : 2)}
        />
      );
    }
    if (role === 'partner') {
      // The facing page of a double-sided spread — fully interactive: tapping a pocket makes
      // this page the active one (same spread stays on screen, so it's seamless) and performs
      // the tap. It's always the page directly before/after the active page, so it reuses the
      // prev/next refs and the existing cross-page drag machinery.
      const isPrev = p.id === prevPage?.id;
      const pIdx = binder.pages.findIndex((pg) => pg.id === p.id);
      return (
        <BinderGrid
          ref={isPrev ? prevRef : nextRef}
          page={p}
          width={width}
          editable
          captionFields={captionFields}
          // The facing page is a first-class drop surface for tray slices too.
          dropTargets={isPrev ? prevDropTargets : nextDropTargets}
          onCellPress={(row, col) => {
            // An armed tray slice places here directly — without stealing the page focus.
            if (armedSlice) {
              placeSliceOnPage(armedSlice, p, pIdx, row, col);
              return;
            }
            changePage(pIdx);
            setPickerCell({ row, col });
          }}
          onSlotPress={(slot) => {
            changePage(pIdx);
            setSelectedSlotId(slot.id);
          }}
          onCrossDrop={(slotId, x, y) => handleCrossDrop(p.id, slotId, x, y)}
          onDragStart={() => startColumnDrag(isPrev ? 0 : 2)}
        />
      );
    }
    return (
      <BinderGrid
        // The active-page grid in both the spread ('current') and the narrow single view — curRef
        // must point to it either way so a tray slice can hit-test its drop cell.
        ref={curRef}
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
        dropTargets={p.id === page.id ? dropTargets : undefined}
        {...(role === 'current'
          ? {
              onCrossDrop: (slotId: string, x: number, y: number) => handleCrossDrop(p.id, slotId, x, y),
              onDragStart: () => startColumnDrag(1),
            }
          : { onDropSlot: handleDropSlot })}
      />
    );
  };

  // Page-level editing tools, sat beside the title/description fields at the top so the bottom of
  // the editor is free for the slice tray.
  const editToolsCard = (
    <ThemedView type="backgroundElement" style={styles.editPanel}>
      <ThemedText type="smallBold" themeColor="textSecondary" style={styles.editPanelTitle}>
        Editing tools
      </ThemedText>

      <View style={styles.btnRow}>
        <PillButton label="↶ Undo" onPress={store.undo} disabled={!store.canUndo} />
        <PillButton label="↷ Redo" onPress={store.redo} disabled={!store.canRedo} />
        <PillButton
          label="+ Page"
          onPress={() =>
            store.pageLimitReached(binder.id)
              ? showToast(pageLimitMessage(store.tier, store.limits))
              : store.addPage(binder.id)
          }
        />
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
                  const result = store.removePage(binder.id, page.id);
                  changePage(0);
                  showToast(parityNote('Page deleted', result?.blanksInserted), true);
                },
              })
            }
          />
        )}
        {binder.pages.some(isBlankPage) && (
          <PillButton
            label="Compact blanks"
            onPress={() => {
              const result = store.compactBlankPages(binder.id);
              if (!result) return;
              if (result.removed === 0) {
                showToast(
                  result.kept > 0
                    ? 'Every blank page here keeps folded art on its pocket pairs.'
                    : 'No blank pages to remove.',
                );
                return;
              }
              showToast(
                `Removed ${result.removed} blank page${result.removed === 1 ? '' : 's'}${
                  result.kept > 0
                    ? `. ${result.kept === 1 ? 'One stays' : `${result.kept} stay`} to keep folded art aligned.`
                    : ''
                }`,
                true,
              );
            }}
          />
        )}
      </View>

      <View style={styles.inlineRow}>
        <ThemedText type="small" themeColor="textSecondary" style={styles.inlineLabel}>
          Page size
        </ThemedText>
        {/* Segmented control — same voice as the studio's fit/view toggles. */}
        <View style={styles.segGroup}>
          {PAGE_SIZES.map((size) => {
            const active = page.rows === size.rows && page.cols === size.cols;
            return (
              <Pressable
                key={size.label}
                onPress={() => {
                  // One pocket layout per binder (real pages don't mix) — the chip re-sizes EVERY
                  // page, refusing when content would fall outside.
                  const res = store.setBinderPageSize(binder.id, size.rows, size.cols);
                  if (!res.ok && res.reason) showToast(res.reason);
                  else if (res.ok && binder.pages.length > 1)
                    showToast(`All ${binder.pages.length} pages set to ${size.label}`);
                }}
                style={[styles.seg, active && styles.segActive]}>
                <Text style={[styles.segText, active && styles.segTextActive]}>{size.label}</Text>
              </Pressable>
            );
          })}
        </View>
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
            onChange={(backgroundColor) => store.updatePage(binder.id, page.id, { backgroundColor })}
          />
        </View>
      </View>

      {isSupabaseConfigured ? (
        <View style={styles.pageVisRow}>
          <View style={styles.pageVisText}>
            <ThemedText type="smallBold">Page visibility</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              {(page.isPublic ?? true)
                ? 'Public: shown to anyone viewing this binder.'
                : 'Private: hidden from public viewers; only you see it.'}
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
  );

  return (
    <ThemedView style={styles.flex}>
      <SafeAreaView style={styles.flex} edges={['top']}>
          {/* Header */}
          <View style={styles.header}>
            <Pressable onPress={onClose} hitSlop={10}>
              <Text style={[styles.headerAction, { color: theme.text }]}>Close</Text>
            </Pressable>
            {/* The title is edited in the detail fields below (same width as the description);
                the header always shows it read-only, updating live as you type. */}
            <ThemedText type="subtitle" numberOfLines={1} style={styles.titleText}>
              {binder.title || (editing ? 'Untitled binder' : '')}
            </ThemedText>
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
                  {/* A filled pill so entering/leaving the workbench reads as a real mode change. */}
                  <View style={styles.modeBtn}>
                    <Text style={styles.modeBtnText}>{editing ? 'Done' : 'Edit'}</Text>
                  </View>
                </Pressable>
              </View>
            ) : (
              <Pressable onPress={handleDuplicate} hitSlop={10}>
                <View style={styles.modeBtn}>
                  <Text style={styles.modeBtnText}>Duplicate</Text>
                </View>
              </Pressable>
            )}
          </View>

          <ScrollView contentContainerStyle={styles.scroll}>
            {/* Editing: title/description fields and the page tools sit side by side at the top, so
                the bottom of the editor stays clear for the slice tray. Stacks on narrow screens. */}
            {editing ? (
              <View style={[styles.editTopRow, wideEditor && styles.editTopRowWide]}>
                <View style={styles.binderFields}>
                  <LabeledInput
                    label="Binder title"
                    value={binder.title}
                    onChangeText={(title) => store.updateBinder(binder.id, { title })}
                    placeholder="Binder title"
                  />
                  <LabeledInput
                    label="Binder description"
                    value={binder.description ?? ''}
                    onChangeText={(description) => store.updateBinder(binder.id, { description })}
                    placeholder="What is this binder about?"
                    multiline
                  />
                </View>
                <View style={styles.editToolsCol}>{editToolsCard}</View>
              </View>
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
                      const result = store.reorderPages(binder.id, from, to);
                      // Follow the moved page to where it actually landed — a parity spacer can
                      // shift it past the raw drop index.
                      changePage(result ? result.pageIndex : to);
                      if (result?.blanksInserted)
                        showToast(parityNote('Pages reordered', result.blanksInserted));
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
            {editing ? <View style={styles.traySpacer} /> : null}
          </ScrollView>

          {editing ? (
            <SliceTray
              armedId={armedSlice?.id ?? null}
              onArm={setArmedSlice}
              onDragStart={handleSliceDragStart}
              onDrop={handleSliceDrop}
              onRemove={handleRemoveSlice}
              onNew={openStudioForPage}
              ghostOn={ghostOn}
              ghostX={ghostX}
              ghostY={ghostY}
            />
          ) : null}
          {dragSlice ? (
            <Animated.View pointerEvents="none" style={[styles.dragGhost, ghostStyle]}>
              <SliceThumb slice={dragSlice} style={StyleSheet.absoluteFill} />
            </Animated.View>
          ) : null}
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
            // The studio slices the WHOLE page, so its grid is the binder's page size. Merging is
            // position-free in the studio; pocket-pair physics applies when a slice is placed.
            rows={page.rows}
            cols={page.cols}
            imageUrl={studio.imageUrl}
            onSaveSlices={(slices) => {
              // The studio disables Save past the cap; this is the belt-and-braces guard.
              if (artCapBlocks(slices.length)) return;
              addSavedSlices(slices);
              setStudio(null);
              showToast(`Saved ${slices.length} slice${slices.length === 1 ? '' : 's'} to your tray`);
            }}
            onClose={() => setStudio(null)}
            trayCount={keptArtworks}
            trayLimit={store.limits.artUploads}
            guest={store.tier === 'guest'}
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
            onAddToBinder={selectedCardIds().length > 0 ? addSelectionToBinder : undefined}
            onClose={closeMultiActions}
          />
        ) : null}
        {addElsewhereIds ? (
          <AddToBinderSheet
            binders={store.userBinders.filter((b) => b.id !== binder.id)}
            onPick={addElsewhereTo}
            onNew={addElsewhereNew}
            onClose={() => setAddElsewhereIds(null)}
          />
        ) : null}
        <ShareSheet
          visible={shareOpen}
          binder={binder}
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
    paddingVertical: 12,
    gap: 12,
    borderBottomWidth: 1,
    borderBottomColor: Palette.hairline,
  },
  headerAction: { fontSize: FontSize.md, fontWeight: Weight.semibold },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three },
  headerPrimary: { color: Palette.accent },
  // The Edit/Done mode toggle — filled pill, same voice as the studio's "Save slices".
  modeBtn: { paddingVertical: 8, paddingHorizontal: 18, borderRadius: Radius.pill, backgroundColor: Palette.accent },
  modeBtnText: { fontSize: FontSize.body, fontWeight: Weight.bold, color: Palette.accentText },
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
  titleText: { flex: 1, textAlign: 'center', fontFamily: Fonts?.brand, fontSize: FontSize.title, lineHeight: 28 },
  scroll: { paddingHorizontal: 16, paddingBottom: 48 },
  description: { marginTop: 10, textAlign: 'center', maxWidth: 640, alignSelf: 'center' },
  // Detail fields share one centred column (matches the edit-tools card) so the editable
  // chrome reads as a single organised stack instead of page-wide boxes.
  // The top editing row: title/description fields beside the page tools (side by side when there's
  // room, stacked otherwise), leaving the bottom of the editor free for the slice tray.
  editTopRow: { width: '100%', maxWidth: 1120, alignSelf: 'center', marginTop: 8, gap: 12, flexDirection: 'column' },
  editTopRowWide: { flexDirection: 'row', alignItems: 'flex-start' },
  binderFields: { gap: 10, flexGrow: 1, flexBasis: 300, minWidth: 240 },
  editToolsCol: { flexGrow: 1, flexBasis: 360, minWidth: 280 },
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
    borderRadius: Radius.panel,
    padding: 14,
    gap: 10,
  },
  editPanelTitle: { textTransform: 'uppercase', letterSpacing: 0.5 },
  btnRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  inlineRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 },
  // Segmented control (matches the studio's fit/view toggles).
  segGroup: { flexDirection: 'row', alignItems: 'center', backgroundColor: Palette.panel, borderRadius: Radius.pill, padding: 2 },
  seg: { paddingVertical: 6, paddingHorizontal: 12, borderRadius: Radius.pill },
  segActive: {
    backgroundColor: Palette.surface,
    shadowColor: '#000000',
    shadowOpacity: 0.1,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
  segText: { fontSize: FontSize.label, color: Palette.muted, fontWeight: Weight.medium },
  segTextActive: { color: Palette.ink, fontWeight: Weight.semibold },
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
  // Clearance so scrolled content isn't hidden behind the docked slice tray.
  traySpacer: { height: 150 },
  // Floating drag preview that follows the finger while a slice is dragged from the tray.
  dragGhost: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: 68,
    height: 48,
    borderRadius: 8,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: Palette.accent,
    backgroundColor: Palette.chromeDeepest,
    zIndex: 100,
    elevation: 12,
  },
});
