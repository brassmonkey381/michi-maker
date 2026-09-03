import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, { useAnimatedStyle, useSharedValue } from 'react-native-reanimated';
import { similarAvailable } from 'tcgscan-browse';

import { AddToBinderSheet } from '@/components/binder/AddToBinderSheet';
import { AutoFillSheet } from '@/components/binder/AutoFillSheet';
import { ComposeAllSheet } from '@/components/binder/ComposeAllSheet';
import { BinderGrid, type BinderGridHandle } from '@/components/binder/BinderGrid';
import {
  CARD_PICKER_DOCK_MIN_WIDTH,
  CARD_PICKER_RAIL_WIDTH,
  CardPicker,
} from '@/components/binder/CardPicker';
import { AboutHoverCard, AboutPopup, BINDER_DESCRIPTION_PLACEHOLDER, PAGE_DESCRIPTION_PLACEHOLDER, useHoverReveal } from '@/components/binder/AboutPopup';
import { PageComposition } from '@/components/binder/PageComposition';
import { BinderPages, type CoverToolsContext, type GridRole } from '@/components/binder/BinderPages';
import { CoverPanel } from '@/components/binder/CoverPanel';
import { withSurface } from '@/components/binder/CoverEditor';
import { MAX_DECORATIONS_PER_SURFACE, addDecoration, sliceToDecoration } from '@/data/coverDecorations';
import { LayersTray } from '@/components/binder/LayersTray';
import { ColorField } from '@/components/binder/ColorField';
import { ConfirmDialog, type ConfirmSpec } from '@/components/binder/ConfirmDialog';
import { LikersSheet } from '@/components/binder/LikersSheet';
import { RightsPrompt } from '@/components/binder/RightsPrompt';
import { PrintPlaceholdersSheet } from '@/components/binder/PrintPlaceholdersSheet';
import { ShareSheet } from '@/components/binder/ShareSheet';
import { SliceStudio, type SliceStudioHandle } from '@/components/binder/SliceStudio';
import { SlotMultiActions } from '@/components/binder/SlotMultiActions';
import { pillChip, sheet } from '@/constants/ui';
import { ContestLockBanner } from '@/components/contest/ContestLockBanner';
import { fetchLockState, type Finalist } from '@/data/contestRepo';
import { EditLockBanner } from '@/components/binder/EditLockBanner';
import { SaveErrorBanner } from '@/components/binder/SaveErrorBanner';
import { Toast, type ToastSpec } from '@/components/binder/Toast';
import { CapGateDialog } from '@/components/monetization/CapGateDialog';
import { useCapGate } from '@/hooks/use-cap-gate';
import { similarityWall } from '@/data/similarityGate';
import { hasFindSimilar } from '@/data/tiers';
import { CopyPickerSheet } from '@/components/binder/CopyPickerSheet';
import { VariantPickerSheet } from '@/components/binder/VariantPickerSheet';
import { catalogArtNote, type OwnedEntry } from '@/data/ownedCopies';
import {
  refreshAllOwnedCopies,
  useAvailableCopies,
  useCopyAssigner,
  useOwnedCopies,
} from '@/hooks/use-owned-copies';
import { useAuth } from '@/store/auth';
import { EntryChangedElsewhereError, invalidateOwnedEntries, setEntryVariant } from '@/data/collectionRepo';
import { useCardLabelPrefs } from '@/hooks/use-card-label-prefs';
import { usePriceSummaryWhen } from '@/lib/prices';
import { chipFor, effectiveFinish, finishIsAskable, nextFinish } from '@/constants/printVariant';
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
import { ArtworkDock } from '@/components/binder/ArtworkDock';
import { artPieceAllowed, pageSide, REAL_PAGE_SIZES } from '@/data/binderPhysics';
import {
  DOCK_PCT_MAX,
  LEGACY_MIN_WIDTH,
  MIN_PAGE_WIDTH,
  PANEL_GAP,
  PANEL_MAX_WIDTH,
  PANEL_MIN_WIDTH,
  PEEK_MIN_WIDTH,
  panelLayout,
} from '@/data/binderLayout';
import type { CaptionFieldKey } from '@/data/cardCaption';
import type { ComposePlacement } from '@/data/pageComposer';
import { isSupabaseConfigured } from '@/lib/env';
import { footprintForKind } from '@/data/cardSizing';
import { resolveCard } from '@/data/cardResolver';
import { addSavedSlices, removeSavedSlice, sliceSignature, slotSignature, useSavedSlices, useSavedSlicesSync, type SavedSlice } from '@/data/savedSlices';
import { artLimitMessage, artTrialMessage, binderLimitMessage, binderTrialMessage, limitCta, pageLimitMessage, pageTrialMessage } from '@/data/limitMessages';

import { SliceThumb } from '@/components/binder/SliceTray';
import type { CatalogCard } from '@/lib/catalog';
import { isBlankPage, useBinders } from '@/store/binders';
import { useTheme } from '@/hooks/use-theme';
import { useViewPrefs } from '@/hooks/use-view-prefs';

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
  /** Open with the print sheet already up (`/binder/<id>?print=1`, from the print guide). */
  initialPrintOpen?: boolean;
  /** Arrive in edit mode (`?edit=1`). */
  initialEditing?: boolean;
  /** Arrive with the Slice Studio open on the current page (`?slice=1`, from the slice guide). */
  initialStudioOpen?: boolean;
}

export function BinderScreen({
  binderId,
  onClose,
  onOpenBinder,
  initialPrintOpen = false,
  initialEditing = false,
  initialStudioOpen = false,
}: BinderScreenProps) {
  const store = useBinders();
  // Which of the user's physical cards each placement claims (see use-owned-copies): every
  // add path resolves it the same way, so what a pocket costs no longer depends on the screen
  // it was added from.
  const assignCopies = useCopyAssigner();
  const availableCopies = useAvailableCopies();
  const ownedCopies = useOwnedCopies();
  const { user } = useAuth();
  /**
   * PRINT FINISH, pocket by pocket. Every other owned-copy lookup in this file is an O(n) find over
   * the whole collection; the chip layer asks once per pocket per render, so this one is a map.
   * Declared up here beside the hook that feeds it — everything past the not-found guard below is
   * after an early return, where a hook cannot go.
   */
  // The finish chip needs to know what a card COULD have been printed as, which lives in the price
  // summary's variant keys. Loaded on the same terms as the Price caption — only while the Finish
  // label is actually switched on — because it is several megabytes and most sessions never need
  // it. The label preference is per-account and shared, so reading it here costs nothing.
  const labelPrefs = useCardLabelPrefs();
  const finishOn = labelPrefs.on && labelPrefs.fields.includes('finish');
  const priceSummary = usePriceSummaryWhen(finishOn);

  const entryById = useMemo(
    () => new Map((ownedCopies ?? []).map((c) => [c.entryId, c])),
    [ownedCopies],
  );
  const theme = useTheme();
  const { width } = useWindowDimensions();
  /**
   * ONE COPY OF THE VIEW PREFERENCES FOR THE WHOLE EDITOR, passed down to BinderPages.
   *
   * `setPref` writes the whole bag from the instance's own resolved values, so two instances are
   * two writers, each stale about every field the other owns. This screen needs to write the dock
   * fractions and BinderPages needs to write the pills; with two hooks, dragging a dock edge here
   * would silently put the nav rail back wherever it was when this screen mounted.
   */
  const view = useViewPrefs();
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
  // What the user ASKED for, and what they actually get. The workbench opens only while this
  // tab may write: another tab of the same browser can hold the editing lease (see
  // store.canEdit), and losing it has to close the workbench on the very same render, or the
  // pockets stay draggable on a page whose saves are being refused. Derived rather than reset
  // in an effect, so getting the lease back also reopens the workbench where it was left.
  const [editingWanted, setEditingWanted] = useState(initialEditing);
  /**
   * CONTEST LOCK. At most sixty binders in the world are ever a locked finalist, so this is one
   * cheap read on mount rather than anything threaded through the store.
   *
   * It gates `editing` below rather than only `canEdit`, because the read is asynchronous: a
   * binder opened straight into the workbench (initialEditing) would otherwise be editable for
   * the length of one round trip, and every change made in that window is refused by the trigger
   * with a raw policy error. Better to close the workbench the moment we learn.
   */
  const [contestLock, setContestLock] = useState<Finalist | null>(null);
  useEffect(() => {
    if (!isSupabaseConfigured) return;
    let stale = false;
    fetchLockState(binderId)
      .then((f) => !stale && setContestLock(f))
      .catch(() => {});
    return () => {
      stale = true;
    };
  }, [binderId]);
  const contestLocked = !!contestLock?.locked;
  // The binder-details / page-tools disclosure. Closed on entry, and session-only on purpose: the
  // default that matters is what you see the moment you tap Edit, and that should be the binder.
  /**
   * THE DETAILS DIALOG SPLIT INTO THE TWO THINGS IT EDITED, each opened by tapping what it names.
   *
   * One modal used to hold the binder's title and description, the page's title and description,
   * and a card of tools — reached from a chip on a row above the binder. Now the header title
   * opens the binder's own details, the page's title (which is the column label) opens the page's,
   * and the tools are icons in the header. Nothing to hunt for: you tap the words you want to
   * change.
   */
  const [binderInfoOpen, setBinderInfoOpen] = useState(false);
  const [pageInfoOpen, setPageInfoOpen] = useState(false);
  // The view chips (double-sided, labels, strip side, owned, scans) are rendered by BinderPages,
  // but the gear that opens them belongs up in this screen's header, where it costs no page height.
  const [settingsOpen, setSettingsOpen] = useState(false);
  /**
   * WHICH BINDER COVER IS BEING DECORATED — FC, IFC, IBC or BC — and which sticker on it.
   *
   * BinderPages used to own both and draw the cover's toolbar under the binder. Held here, the
   * toolbar can go in the Artwork panel instead, which is where art work belongs and, unlike the
   * space under the binder, costs the pages no height at all.
   */
  const [coverCtx, setCoverCtx] = useState<CoverToolsContext | null>(null);
  const editing = editingWanted && store.canEdit && !contestLocked;
  const [pageIndex, setPageIndex] = useState(0);
  const [pickerCell, setPickerCell] = useState<{ row: number; col: number } | null>(null);
  // A placement waiting on "which copy?" - held whole, because the answer arrives from a sheet
  // that does not know the pocket, the footprint, or whether we are still adding.
  const [copyChoice, setCopyChoice] = useState<{
    cardId: string;
    cardName?: string;
    row: number;
    col: number;
    rows: number;
    cols: number;
    copies: OwnedEntry[];
    /** True when an EXISTING pocket is changing hands rather than a new card being placed. */
    existing?: boolean;
    /** The copy that pocket holds right now, if any. */
    currentEntryId?: string;
  } | null>(null);

  // "Find similar to all" seed handed to the picker's card browser as an explicit prop (not via
  // the broadcast command bus, which a second mounted browser would steal — see kit initialSimilar).
  const [similarSeed, setSimilarSeed] = useState<string[] | null>(null);
  // Held so a dismiss can commit unsaved framing before the studio unmounts.
  const studioRef = useRef<SliceStudioHandle>(null);
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
  /**
   * MULTI-SELECT WITHOUT A KEYBOARD.
   *
   * Selecting several pockets was Ctrl/Cmd-click, and acting on them was RELEASING the modifier —
   * two behaviours advertised nowhere, in a product whose editor is meant to work under a thumb.
   * On touch there is no modifier at all, so the whole bulk-action path was unreachable; on the
   * web it was unreachable unless you already knew.
   *
   * The toggle is the same thing said out loud: while it is on, a tap adds to the selection, and a
   * second control opens the actions the modifier-release used to open. Ctrl/Cmd-click still works
   * exactly as before — this is a second door, not a replacement.
   */
  const [selectMode, setSelectMode] = useState(false);
  const modifierHeld = useRef(false);
  const multiIdsRef = useRef(multiIds);
  // "Keep adding" fast-fill: after placing a card the picker stays open and jumps to the next pocket.
  // Default ON wherever the picker docks. It was off because the picker was a sheet OVER the binder,
  // so leaving it up meant staring at a search panel and guessing which pocket you were filling.
  // Docked, the binder is right there beside it and the next pocket lights up — so the fast path
  // (tap a pocket once, then one tap per card) is the one you get without having to find a toggle.
  // Initialised, not synced: once you turn it off it stays off, resizing the window included.
  const [keepAdding, setKeepAdding] = useState(() => width >= CARD_PICKER_DOCK_MIN_WIDTH);
  /**
   * THE ARTWORK PANEL, on the other side.
   *
   * Deliberately its own switch rather than another tab of the picker: the point of two panels is
   * having the card browser and your cut art on screen AT ONCE, and a tab can only be one of them.
   *
   * It is the artwork side and not a second card browser for a reason that is not a preference.
   * `browseState` in tcgscan-browse is a module-level singleton — every CatalogBrowser hydrates
   * from it on mount and writes back on every change, and `sendBrowseCommand` is a broadcast — so
   * two mounted browsers would inherit each other's position, clobber the same object, both write
   * the ?browse= URL, and a colour search in one would land in both. One browser, one tray.
   */
  const [artworkOpen, setArtworkOpen] = useState(false);
  /**
   * BOTH SIDES ARE ALWAYS THERE WHILE EDITING — collapsed to a rail, or open.
   *
   * They used to appear and disappear: the cards panel only existed while a pocket was targeted,
   * and the artwork panel only while its chip was on. That made the two most-used surfaces in the
   * editor things you had to summon, and it made the layout jump as they came and went. A rail is
   * 34px, always in the same place, and says what is behind it — the slice tray's old trick.
   */
  const [cardsCollapsed, setCardsCollapsed] = useState(true);
  // Where the scroller starts in the window: the only part of the page's height budget that lives
  // outside the scroller, so the only part BinderPages cannot measure for itself.
  // What the page settled on, reported up by BinderPages so the panel beside it can be sized from
  // the space the page did NOT take. Seeded at the page's preferred width so the very first frame
  // is close rather than zero.
  const [pageWidthUsed, setPageWidthUsedRaw] = useState(LEGACY_MIN_WIDTH);
  const setPageWidthUsed = (w: number) =>
    setPageWidthUsedRaw((cur: number) => (Math.abs(cur - w) > 2 ? Math.round(w) : cur));
  const [viewportTop, setViewportTopRaw] = useState(0);
  const setViewportTop = (y: number) =>
    setViewportTopRaw((cur) => (Math.abs(cur - y) > 2 ? Math.round(y) : cur));
  // What this screen stacks above the pages, INSIDE the scroller — measured as a height, because a
  // height is what react-native-web reports reliably. See the contentAbove note in BinderPages: an
  // element's onLayout there is a ResizeObserver on the element itself, so measuring a POSITION
  // silently misses anything above it growing.
  /**
   * How wide the header's right-hand group is. Measured, because its contents change with mode —
   * the page tools appear only while editing, the like chip only when there are likes. Rounded and
   * only accepted on a real change, exactly like the two guards above: the title's own width is not
   * an input to this, so nothing can loop, but a sub-pixel wobble would still re-render for free.
   */
  const [headerRightW, setHeaderRightWRaw] = useState(0);
  const setHeaderRightW = (w: number) =>
    setHeaderRightWRaw((cur: number) => (Math.abs(cur - w) > 2 ? Math.round(w) : cur));
  const [callerChrome, setCallerChromeRaw] = useState(0);
  const setCallerChrome = (h: number) =>
    setCallerChromeRaw((cur) => (Math.abs(cur - h) > 2 ? Math.round(h) : cur));
  // "Send page to…" — the destination picker, and whether it moves or copies.
  const [sendPageOpen, setSendPageOpen] = useState(false);
  /** Choosing which real binder these pages sit in. */
  const [sendAsMove, setSendAsMove] = useState(false);
  const [confirm, setConfirm] = useState<ConfirmSpec | null>(null);
  // The pocket whose PRINT FINISH is being changed. Holds the slot rather than an id because the
  // sheet needs the card and the owned copy behind it, and both are looked up once on open.
  const [variantChoice, setVariantChoice] = useState<{
    entryId: string;
    cardId: string;
    cardName?: string;
    current: string;
    updatedAt: string;
    quantity: number;
  } | null>(null);
  // Bulk multi-select "Add to another binder…" — the card ids awaiting a target binder.
  const [addElsewhereIds, setAddElsewhereIds] = useState<string[] | null>(null);
  const [shareOpen, setShareOpen] = useState(false);
  // PRINT, FROM THE BINDER ITSELF. Fill sheets were reachable only from the shelf on My binders,
  // so the page most people spend their time on — and every public binder a visitor opens —
  // never said the thing on screen could be printed at true size. Two people had ever tried
  // the free example. The sheet gates the paid path by entitlement as it always has; a visitor
  // gets the free sample and the pitch.
  const [printOpen, setPrintOpen] = useState(initialPrintOpen);
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
  // VIP "Pages around this card": the fill sheet hands up the (evolution-enriched) seed and the
  // active collection pool, and this owns the preview sheet + the store write.
  const [composeAll, setComposeAll] = useState<{
    seed: CatalogCard;
    pool: ReadonlySet<string> | null;
  } | null>(null);
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
  // ARRIVING WITH THE STUDIO OPEN (the slice guide's button). Once, after the binder and its
  // page exist and editing is on; deferred a tick so it is an event, not a render-time write.
  // Above the early return below, with the other hooks.
  const studioArrived = useRef(false);
  useEffect(() => {
    const p = binder?.pages[Math.min(pageIndex, (binder?.pages.length ?? 1) - 1)];
    if (!initialStudioOpen || studioArrived.current || !editing || !p) return;
    studioArrived.current = true;
    const t = setTimeout(() => setStudio({ rows: p.rows, cols: p.cols, row: 0, col: 0, imageUrl: undefined }), 0);
    return () => clearTimeout(t);
  }, [initialStudioOpen, editing, binder, pageIndex]);

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

  // Hitting a cap ends the action the user was mid-way through, so every cap toast gets the
  // prominent tone and a button out. Which way out depends on the tier (see limitCta): the plans
  // page for accounts that can pay, the auth sheet for guests, whose cap is lifted by the free
  // tier rather than by a plan.
  const showLimitToast = (message: string) => {
    toastId.current += 1;
    setToast({ id: toastId.current, message, tone: 'limit', cta: limitCta(store.tier) });
  };
  // One wall, one report: a dialog on its first hit today, the toast after that.
  const capGate = useCapGate(showLimitToast);

  // Hovering the binder title answers the same question the tap does, without taking the screen.
  //
  // IN BOTH MODES. Hover and click do not compete — the pointer asks what this binder is, the
  // click opens the fields to change it — and an editor who has to leave edit mode to read the
  // description they are editing is being asked to work around the app.
  //
  // Above the `if (!binder)` guard with the rest of the hooks, hence the optional chain: the hook
  // order has to hold on the render where the binder is missing too (see the note at the top).
  // Hover shows the description at once, and a placeholder when there is none — never a dead
  // title. The dialog being open is the one time the card would only get in the way.
  const binderHover = useHoverReveal(!binderInfoOpen);

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
  // The picker DOCKS beside the binder on a wide screen rather than covering it, so the page has
  // to make room — otherwise the column would sit on top of the very pockets it is filling. The
  // two constants are one decision, so they are imported rather than repeated.
  /**
   * THE PANEL TAKES WHAT THE PAGE DOES NOT WANT.
   *
   * It used to be a fixed 460 whatever the window was — so a 1920 desktop, whose height-fitted page
   * is about 510px wide, kept hundreds of pixels of empty margin either side while the card grid
   * scrolled in a column too narrow for it.
   *
   * `pageNeed` is what the page area wants: the width the page actually settled on (reported up
   * from BinderPages, and decided by HEIGHT, which is what keeps this from being circular), but
   * never less than PEEK_MIN_WIDTH while there are neighbours to peek at — below that the spread
   * collapses to a single page, and trading the spread for a wider panel is the wrong way round.
   */
  const pageNeed = Math.max(pageWidthUsed, binder.pages.length > 1 ? PEEK_MIN_WIDTH : 0);
  // While editing there are always two sides. Each is EITHER a rail (a fixed 34px) or an open
  // panel (elastic), so the rails come off the top of the budget and panelLayout divides what is
  // left between however many are actually open.
  const sidesShown = editing;
  const cardsWantsPanel = sidesShown && !cardsCollapsed;
  const artWantsPanel = sidesShown && artworkOpen;
  const railCount = sidesShown ? (cardsWantsPanel ? 0 : 1) + (artWantsPanel ? 0 : 1) : 0;
  const railCost = railCount * CARD_PICKER_RAIL_WIDTH;
  const panelCount = (cardsWantsPanel ? 1 : 0) + (artWantsPanel ? 1 : 0);
  /**
   * A DOCK CAN BE TOLD HOW WIDE TO BE. Zero means nobody has ever dragged this edge, which is every
   * account until it happens, so the automatic split below is unchanged for them.
   *
   * The floor the panels are measured against is a CONSTANT, never `pageNeed`: `pageNeed` contains
   * the page's own measured width, so clamping against it would let a dragged panel squeeze the
   * page, which shrinks the measurement, which lets the panel grow again.
   */
  const pctPx = (pct: number) => (pct > 0 ? Math.round(pct * width) : undefined);
  const pageFloor = binder.pages.length > 1 ? PEEK_MIN_WIDTH : MIN_PAGE_WIDTH;
  const panels = panelLayout({
    availableWidth: width - 32 - railCost,
    pageNeed,
    panels: panelCount,
    // Same order the fits are read in below: the picker first, the artwork panel second.
    desired: [
      ...(cardsWantsPanel ? [pctPx(view.cardsDockPct)] : []),
      ...(artWantsPanel ? [pctPx(view.artDockPct)] : []),
    ],
    pageFloor,
  });
  // Asked for in priority order, and panelLayout keeps the earlier ones docked when only some fit.
  // The picker goes first because it is the one you just asked for by tapping a pocket; the artwork
  // panel is a standing choice and survives a spell as a modal better.
  let fitIdx = 0;
  const pickerFit = cardsWantsPanel ? panels.fits[fitIdx++] : 'modal';
  const artworkFit = artWantsPanel ? panels.fits[fitIdx++] : 'modal';
  /**
   * WHETHER IT DOCKS IS DECIDED HERE, not in the panel.
   *
   * It used to be a width breakpoint on each side — the screen checked one thing and the picker
   * checked another, and they disagreed on the Artwork tab: the screen shaved 460px off the page's
   * budget while the picker rendered as a full-screen sheet. There is one answer now, it comes from
   * the arithmetic that also decides the width, and the panel is told it.
   */
  const pickerDocked = sidesShown && (cardsWantsPanel ? pickerFit === 'docked' : true);
  const artworkDocked = sidesShown && (artWantsPanel ? artworkFit === 'docked' : true);
  // A side that is not open, or is open but too narrow to dock, still holds its rail.
  // Per side now, not one shared number: the two can be dragged to different widths.
  let widthIdx = 0;
  const pickerWidth =
    cardsWantsPanel && pickerFit === 'docked' ? panels.widths[widthIdx++] : CARD_PICKER_RAIL_WIDTH;
  const artworkWidth =
    artWantsPanel && artworkFit === 'docked' ? panels.widths[widthIdx++] : CARD_PICKER_RAIL_WIDTH;
  const available =
    width - 32 - (pickerDocked ? pickerWidth : 0) - (artworkDocked ? artworkWidth : 0);
  /**
   * WHAT A DRAGGED EDGE IS ALLOWED TO REACH, and what it stores.
   *
   * Stored as a FRACTION of the window, because the choice travels to a different monitor: "about a
   * third" survives that and "620px" does not. The stored value is never the clamped one — a window
   * too narrow to honour a choice must not quietly erase it — so widening the window brings the
   * original back whole.
   *
   * The live ceiling subtracts the page's floor and the other dock, so the edge under the finger
   * physically cannot reach the binder even before the layout gets a say.
   */
  const dockCeiling = (otherWidth: number) =>
    Math.max(
      PANEL_MIN_WIDTH,
      Math.min(
        PANEL_MAX_WIDTH,
        Math.round(DOCK_PCT_MAX * width),
        width - 32 - railCost - pageFloor - PANEL_GAP - otherWidth,
      ),
    );
  const commitDock = (key: 'cardsDockPct' | 'artDockPct') => (px: number) =>
    view.setPref(key, Math.min(Math.max(px / width, PANEL_MIN_WIDTH / width), DOCK_PCT_MAX));
  // Two taps hands the width back to the layout — 0 is already the "never dragged" sentinel.
  const resetDock = (key: 'cardsDockPct' | 'artDockPct') => () => view.setPref(key, 0);
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
      showToast('This is a shared binder, private art (added from a link) can’t go in it. Upload your own art instead.', true);
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
    // ARMING ENDS WHEN THE SLICE LANDS. It never did, so after tap-placing a slice every later
    // pocket tap placed ANOTHER copy of the same art instead of opening the picker — the binder
    // filling with one picture, with nothing on screen explaining why. The refusals above return
    // before this and leave it armed, which is right: you did not place it, so you are still
    // holding it.
    setArmedSlice(null);
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
    if (hit) {
      const pgIndex = binder.pages.findIndex((p) => p.id === hit.pageId);
      if (pgIndex < 0) return;
      placeSliceOnPage(slice, binder.pages[pgIndex], pgIndex, hit.row, hit.col);
      return;
    }
    // NOT A POCKET. If a cover surface is being decorated and the drop landed on it, the piece
    // becomes a decoration where it was dropped — the same ghost, the same gesture, a different
    // destination. Measured at drop time, because the surface's window rect moves with the scroll.
    const ctx = coverCtx;
    if (!ctx) return;
    void ctx.measureSurface().then((r) => {
      if (!r || windowX < r.x || windowY < r.y || windowX > r.x + r.width || windowY > r.y + r.height) return;
      const items = ctx.cover.surfaces?.[ctx.surface] ?? [];
      const d = { ...sliceToDecoration(slice), x: (windowX - r.x) / r.width, y: (windowY - r.y) / r.height };
      const next = addDecoration(items, d);
      if (next === items) {
        showToast(`This surface already holds ${MAX_DECORATIONS_PER_SURFACE} — remove one first.`);
        return;
      }
      ctx.onChange(withSurface(ctx.cover, ctx.surface, next));
      ctx.onSelect(d.id);
    });
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
  //
  // store.canEdit joins them for a different reason: another tab of this browser holds the
  // editing lease, so nothing saved here would stick. Offering an Edit button that quietly
  // discards the work would be worse than not offering one.
  const canEdit = !binder.isExample && !binder.isDemo && store.canEdit && !contestLocked;


  const handleDuplicate = () => {
    const copy = store.duplicateBinder(binder.id);
    if (copy) {
      onOpenBinder?.(copy.id);
      return;
    }
    // The store refuses past the binder cap. This used to be a bare toast with no event, which is
    // exactly the drift useCapGate exists to stop: a wall that a user meets and the stream cannot
    // see. Through the gate it gets the same dialog-then-toast pacing and the same impression as
    // every other binder cap.
    capGate.hit({
      limit: 'binders',
      surface: 'binder_editor',
      isGuest: store.tier === 'guest',
      title: 'You are at your binder limit',
      message: binderLimitMessage(store.tier, store.limits),
      trialMessage: binderTrialMessage(store.limits),
      tier: store.tier,
      used: store.binderCount,
      cap: store.limits.binders,
    });
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
      showLimitToast(pageLimitMessage(store.tier, store.limits));
      return;
    }
    const result = store.duplicatePage(binder.id, page.id);
    if (result) {
      setSelectedSlotId(null);
      setPageIndex(result.pageIndex);
      showToast(parityNote('Page duplicated', result.blanksInserted));
    }
  };

  /**
   * Send the current page to another binder. `move` also removes it here, so the page ends up in
   * exactly one binder; a plain send leaves this one untouched. Every refusal the store can
   * return is explained in a toast rather than failing silently.
   */
  const handleSendPage = (toBinderId: string, move: boolean) => {
    setSendPageOpen(false);
    const target = store.getBinder(toBinderId);
    const result = store.sendPageToBinder(binder.id, page.id, toBinderId, { move });
    if (result.status !== 'ok') {
      // A full target is the page cap like any other, so it gets the same prominent tone and
      // route out rather than being flattened into the generic "couldn't send" line.
      if (result.status === 'target-full') showLimitToast(pageLimitMessage(store.tier, store.limits));
      else {
        showToast(
          result.status === 'size-mismatch'
            ? `“${target?.title ?? 'That binder'}” uses a different pocket layout, so this page won’t fit.`
            : result.status === 'last-page'
              ? 'This is the binder’s only page. Send a copy instead of moving it.'
              : 'Could not send that page.',
        );
      }
      return;
    }
    if (move) {
      setSelectedSlotId(null);
      setPageIndex(0);
    }
    showToast(
      parityNote(
        `Page ${move ? 'moved' : 'copied'} to “${target?.title ?? 'binder'}”`,
        result.blanksInserted,
      ),
    );
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

  /**
   * Aim the picker at a pocket AND bring the cards side forward.
   *
   * THE TWO HALVES BELONG TOGETHER. `setPickerCell` only says which pocket the picker is for; the
   * cards side spends most of its life collapsed to a 34px rail, so aiming it without this reads
   * as the button doing nothing at all. Every path that aims the picker goes through here, because
   * the ones that did it by hand kept forgetting the second line — Replace, "Find similar to all"
   * and a tap on the facing page each shipped without it.
   */
  const openPickerAt = (cell: { row: number; col: number }) => {
    setPickerCell(cell);
    setCardsCollapsed(false);
  };

  const closePicker = () => {
    setPickerCell(null);
    setSimilarSeed(null); // consume the one-shot seed so a later normal open doesn't re-run it
    // "Done" on the cards panel folds it back to its rail rather than removing it. The panel is a
    // permanent side of the editor now; closing it means putting it away, not making it vanish.
    setCardsCollapsed(true);
  };

  // Tapping a filled pocket selects it (for the action bar + resize handle); tapping an empty
  // pocket opens the picker to add. Ctrl/Cmd-click instead toggles the pocket in a multi-selection
  // (seeding from any single selection so it extends). Selecting never opens the sheet.
  const handleSelectSlot = (slot: DemoSlot) => {
    if (modifierHeld.current || selectMode) {
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
    // The picker points at ONE pocket, so tap-to-select has to stand down with it. Left armed it
    // is a mode whose selection the next pocket tap wipes, under a "Selecting" pill with no toggle
    // beside it to turn off.
    setSelectMode(false);
    // The cards side comes forward for the pocket you just tapped — it is a rail the rest of the
    // time, not absent, so this is an expand rather than an appearance.
    openPickerAt({ row, col });
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
  /** Place the card, then keep the picker moving. Both answers to "which copy?" land here. */
  const placeCardInPocket = (
    cardId: string,
    row: number,
    col: number,
    rows: number,
    cols: number,
    sourceEntryId: string | undefined,
  ) => {
    store.upsertSlot(binder.id, page.id, {
      row,
      col,
      cardId,
      type: 'card',
      rowSpan: rows,
      colSpan: cols,
      sourceEntryId,
    });
    if (keepAdding) {
      const next = nextEmptyCell(row, col, rows, cols);
      if (next) {
        setPickerCell(next);
        return;
      }
    }
    closePicker();
  };

  // Whether the user owns ANY copy of this card, placed or not - the line between "aspirational
  // by choice" (never warn) and "ran out of free copies" (say so).
  const ownsCard = (cardId: string) => !!ownedCopies?.some((c) => c.cardId === cardId);

  /**
   * The finish to badge a pocket with, or undefined for no chip.
   *
   * Keyed off THE LOOKUP SUCCEEDING, never off `slot.sourceEntryId` merely being present: that
   * stamp is persisted and handed to every viewer, so on someone else's binder it is an opaque id
   * that joins to nothing here. A pocket whose copy sits in an archived collection also resolves
   * to nothing, and quietly showing no chip is the right answer in both cases.
   */
  const variantOf = (slot: DemoSlot): string | undefined => {
    if (!slot.cardId) return undefined;
    const owned = slot.sourceEntryId ? entryById.get(slot.sourceEntryId)?.variant : undefined;
    return effectiveFinish(slot.finish, owned, priceSummary?.[slot.cardId]?.variants);
  };

  /**
   * Tapping the finish chip.
   *
   * TWO DIFFERENT ACTS WEAR THE SAME CHIP, and they are not equally consequential. On a pocket
   * that claims an owned copy, the finish is a fact about a card someone physically has: it edits
   * the collection, it reaches the phone, and it keeps its confirmation. On every other pocket it
   * is a property of the pocket — cheap, private, instantly reversible — so it cycles on the tap
   * with no ceremony, which is what makes marking up a page of reverse holos bearable.
   */
  /** A pocket whose card could be more than one finish, and has not been told which. */
  const finishAskable = (slot: DemoSlot): boolean =>
    !!slot.cardId && finishIsAskable(priceSummary?.[slot.cardId]?.variants);

  const onFinishPress = (slot: DemoSlot) => {
    if (!slot.cardId) return;
    if (slot.sourceEntryId && entryById.get(slot.sourceEntryId)) {
      openVariantPicker(slot);
      return;
    }
    if (!store.canEdit) {
      showToast('Editing is open in another tab, so changes are paused here');
      return;
    }
    const priced = priceSummary?.[slot.cardId]?.variants;
    const next = nextFinish(variantOf(slot), priced);
    if (!next) {
      // Said plainly rather than by doing nothing: a chip that ignores a tap reads as broken.
      showToast(`${resolveCard(slot.cardId)?.name ?? 'This card'} was only printed one way`);
      return;
    }
    store.setSlotFinish(binder.id, page.id, slot.id, next);
  };

  const openVariantPicker = (slot: DemoSlot) => {
    if (!slot.sourceEntryId || !slot.cardId) return;
    const entry = entryById.get(slot.sourceEntryId);
    if (!entry) return;
    // The edit lease covers binder writes; this one goes to the COLLECTION, which the lease knows
    // nothing about. Without this check a read-only tab — the one showing "editing is open in
    // another tab" — could still change a real card detail, which is the exact failure the lease
    // exists to end, reintroduced through a table it does not cover.
    if (!store.canEdit) {
      showToast('Editing is open in another tab, so collection changes are paused here');
      return;
    }
    setVariantChoice({
      entryId: entry.entryId,
      cardId: slot.cardId,
      cardName: resolveCard(slot.cardId)?.name,
      current: entry.variant,
      updatedAt: entry.updatedAt,
      quantity: entry.quantity,
    });
  };

  /**
   * Write the finish to the collection row, optimistically.
   *
   * Optimistic because the confirm dialog closes the instant it calls back, so the write settles
   * with nothing on screen to hold a spinner. The cache is patched first so every pocket claiming
   * that lot repaints at once, and rolled back on failure — a chip that silently kept a value the
   * server rejected would be the same silence that made a lost binder undiagnosable.
   */
  const applyVariant = (
    entryId: string,
    next: string,
    previous: { variant: string; updatedAt: string },
  ) => {
    const userId = user?.id;
    if (!userId) return;
    const patch = (variant: string, updatedAt: string) => {
      invalidateOwnedEntries(userId, (entries) =>
        entries.map((e) => (e.entryId === entryId ? { ...e, variant, updatedAt } : e)),
      );
      refreshAllOwnedCopies();
    };
    patch(next, new Date().toISOString());
    setEntryVariant(entryId, next, previous)
      .then((saved) => {
        patch(saved.variant, saved.updatedAt);
        toastId.current += 1;
        setToast({
          id: toastId.current,
          message: `Set to ${chipFor(next).label}`,
          actionLabel: 'Undo',
          // A REAL undo of the collection row. Deliberately not showToast(msg, true), whose Undo
          // is wired to the binder's in-memory snapshot stack — that would revert an unrelated
          // binder edit and leave the collection row changed.
          onAction: () => applyVariant(entryId, previous.variant, saved),
        });
      })
      .catch((error: unknown) => {
        patch(previous.variant, previous.updatedAt);
        showToast(
          error instanceof EntryChangedElsewhereError
            ? 'That copy changed somewhere else, so nothing was altered here'
            : 'Couldn’t change the finish — your collection is unchanged',
        );
      });
  };

  const handlePickCard = (cardId: string, card?: CatalogCard) => {
    if (!pickerCell) return;
    const { rows, cols } = footprintForKind(card?.kind ?? resolveCard(cardId)?.kind);
    const { row, col } = pickerCell;
    // ASK ONLY WHEN THERE IS A QUESTION. Own an unplaced copy of this card and the pocket could
    // mean either "here is my card" or "here is one I want" - and those are different facts about
    // the collection, so the user says which. Own none and there is nothing to ask about.
    const copies = availableCopies(cardId);
    if (copies.length > 0) {
      setCopyChoice({ cardId, cardName: card?.name, row, col, rows, cols, copies });
      return;
    }
    // Owned but every copy is spoken for: still place it (an aspirational pocket is the design
    // default), but say why it will wear catalogue art - this used to happen in silence.
    if (ownsCard(cardId)) {
      showToast('Your copies are all in pockets, so this one shows catalogue art');
    }
    placeCardInPocket(cardId, row, col, rows, cols, undefined);
  };

  /**
   * "My card" on a filled pocket: change which copy it holds, or hand the copy back.
   *
   * The pocket's OWN copy is not in `availableCopies` — it is unavailable precisely because this
   * pocket has it — so it is put back at the top of the list, where it reads as the current answer
   * rather than as a missing option.
   */
  const pickCopyForSelected = () => {
    const slot = selectedSlot;
    if (!slot?.cardId) return;
    const held = slot.sourceEntryId
      ? ownedCopies?.find((c) => c.entryId === slot.sourceEntryId)
      : undefined;
    const copies = [...(held ? [held] : []), ...availableCopies(slot.cardId)];
    if (copies.length === 0) {
      // Nothing to choose between - but WHY matters: owning none is different from owning copies
      // that are all claimed by other pockets, and the old single message called owners liars.
      showToast(
        ownsCard(slot.cardId)
          ? 'Your copies of this card are all in other pockets'
          : 'You don’t own a copy of this card yet',
      );
      return;
    }
    setCopyChoice({
      cardId: slot.cardId,
      row: slot.row,
      col: slot.col,
      rows: slot.rowSpan,
      cols: slot.colSpan,
      copies,
      existing: true,
      currentEntryId: slot.sourceEntryId,
    });
  };

  const replaceSelected = () => {
    if (!selectedSlot) return;
    // BRING FORWARD THE SIDE THAT ANSWERS THE TAP, which depends on what is in the pocket and
    // matches the tab CardPicker already defaults to for this slot: art is replaced from the
    // Artwork panel (the Slice Studio), a card or a colour insert from the cards panel. Opening
    // both would answer one tap with two panels and take the width from the page.
    if (selectedSlot.type === 'artwork') {
      setPickerCell({ row: selectedSlot.row, col: selectedSlot.col });
      setArtworkOpen(true);
    } else {
      openPickerAt({ row: selectedSlot.row, col: selectedSlot.col });
    }
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

  /**
   * What Delete clears, which is whatever is actually selected.
   *
   * It was wired straight to removeSelected, which acts on the SINGLE selected pocket — and
   * `handleSelectSlot` sets that to null the moment a multi-selection starts. So selecting five
   * pockets and pressing Delete did nothing at all: the key had no idea the other selection
   * existed, while the actions sheet beside it did.
   */
  const deleteSelection = () => {
    if (multiIds.size > 0) removeMany();
    else removeSelected();
  };

  const removeSelected = () => {
    if (!selectedSlot) return;
    store.removeSlot(binder.id, page.id, selectedSlot.id);
    setSelectedSlotId(null);
    showToast('Pocket cleared', true);
  };

  // ✨ Fill page: place the composer's picks (one commit → one Undo) and report the result.
  const handleComposeAll = (seed: CatalogCard, pool: ReadonlySet<string> | null) => {
    setAutoFillOpen(false);
    setComposeAll({ seed, pool });
  };
  const handleKeepComposed = (
    kept: { title: string; seedCardId: string; placements: ComposePlacement[] }[],
  ) => {
    const { added, skipped } = store.appendComposedPages(binder.id, kept);
    setSelectedSlotId(null);
    if (added === 0) {
      showToast('This binder is at its page limit');
      return;
    }
    showToast(
      skipped > 0
        ? `Added ${added} page${added === 1 ? '' : 's'}, ${skipped} left out at the page limit`
        : `Added ${added} page${added === 1 ? '' : 's'}`,
      true,
    );
  };

  const handleAutoFillPlaced = (placements: ComposePlacement[], methodLabel: string) => {
    // A fill from the owned pool places the user's actual cards, so each pocket claims one -
    // resolved here rather than in the sheet, which has the card ids but not the placed set.
    const copies = assignCopies(placements.map((p) => p.cardId ?? ''));
    const withCopies = placements.map((p, i) =>
      p.cardId && p.fromCollection ? { ...p, sourceEntryId: copies[i] } : p,
    );
    const { placed, placedUnclaimed } = store.placeCards(binder.id, page.id, withCopies);
    setSelectedSlotId(null);
    // A fill FROM the owned pool that could not claim a copy for every pocket says so: either the
    // assigner ran dry (copies already placed elsewhere) or the store's guard refused a stale
    // claim. placedUnclaimed is counted by the store over pockets actually CREATED, so a
    // placement skipped for an occupied cell never inflates the note.
    showToast(
      placed > 0
        ? `Filled ${placed} pocket${placed === 1 ? '' : 's'} · ${methodLabel}${catalogArtNote(placedUnclaimed, placed)}`
        : 'Nothing placed',
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
    const ids = addElsewhereIds;
    const entryIds = assignCopies(ids);
    const { added, unplaced, droppedClaims } = store.addCardsToBinder(targetId, ids, { entryIds });
    const title = store.getBinder(targetId)?.title ?? 'binder';
    setAddElsewhereIds(null);
    // Anything the target binder's page cap left out is named, never dropped in silence — and
    // so are owned cards whose free copies ran out (they land as catalogue-art pockets).
    if (unplaced > 0) showLimitToast(pageLimitMessage(store.tier, store.limits));
    else if (added > 0) {
      const short =
        droppedClaims + ids.filter((id, i) => entryIds[i] === undefined && ownsCard(id)).length;
      showToast(`Added ${added} card${added === 1 ? '' : 's'} to ${title}${catalogArtNote(short, added)}`);
    }
  };
  const addElsewhereNew = () => {
    if (!addElsewhereIds?.length) return;
    const ids = addElsewhereIds;
    const entryIds = assignCopies(ids);
    const copy = store.createBinder({
      title: 'New binder',
      pages: pagesForCards(ids, entryIds),
    });
    const count = ids.length;
    setAddElsewhereIds(null);
    // The store refuses past the binder cap — say so instead of silently doing nothing.
    if (!copy) {
      showLimitToast(binderLimitMessage(store.tier, store.limits));
      return;
    }
    const short = ids.filter((id, i) => entryIds[i] === undefined && ownsCard(id)).length;
    showToast(`Added ${count} card${count === 1 ? '' : 's'} to ${copy.title}${catalogArtNote(short, count)}`);
  };

  const findSimilarToAll = () => {
    const cardIds = selectedCardIds();
    if (cardIds.length === 0) return;
    // PRO and above (see TierLimits.findSimilar). The action stays on the multi-select bar at
    // every tier and answers the tap here, rather than opening the picker and refusing inside it.
    if (!hasFindSimilar(store.tier)) {
      setMultiActionsOpen(false);
      capGate.hit(similarityWall(store.tier, 'binder_editor'));
      return;
    }
    const chosen0 = page.slots.find((s) => multiIds.has(s.id));
    // Hand the seed to the picker as an explicit prop, then open it: the picker's CatalogBrowser
    // runs the multi-similar search on mount. A fresh array each call re-triggers it (kit
    // initialSimilar is ref-guarded). Not the command bus — the home browser would intercept that.
    setSimilarSeed(cardIds);
    const cell = firstFreePlacement(page, 1, 1) ?? (chosen0 ? { row: chosen0.row, col: chosen0.col } : null);
    setMultiActionsOpen(false);
    clearMulti();
    setSelectedSlotId(null);
    // The results land in the picker's browser, so the picker has to be open to run the search at
    // all. Collapsed, the search never started: the action looked inert, and the PRO wall it
    // raises only appeared later, when opening the dock finally mounted the browser.
    if (cell) openPickerAt(cell);
  };

  const handlePickVUnion = (pieces: readonly string[]) => {
    if (!pickerCell) return;
    store.placeVUnion(binder.id, page.id, pickerCell.row, pickerCell.col, pieces);
    closePicker();
  };

  // Batch "Add all to a binder" (multi-select): fill THIS page, then keep going on fresh pages
  // inserted directly behind it, and report the result in one toast.
  const handlePickCards = (cardIds: string[]) => {
    // One batch pass, so the cards never collide on a cell — a per-card loop re-read stale state
    // and 409'd on every card but the first.
    //
    // `startPageIndex` is what makes a batch land where the user is looking. Without it placement
    // scans from page 1 for any gap and appends the rest at the very end, so picking nine cards
    // while on page 4 could scatter them across pages 1, 2 and the back of the binder.
    const entryIds = assignCopies(cardIds);
    const { added, unplaced, blanksInserted, droppedClaims } = store.addCardsToBinder(binder.id, cardIds, {
      startPageIndex: pageIndex,
      entryIds,
    });
    closePicker();
    // The binder can run out of pages at the tier cap — name it (with the upgrade route) rather
    // than quietly placing fewer cards than the user picked.
    if (unplaced > 0) {
      capGate.hit({
        limit: 'pagesPerBinder',
        surface: 'binder_editor',
        isGuest: store.tier === 'guest',
        title: 'This binder is full',
        message: pageLimitMessage(store.tier, store.limits),
        trialMessage: pageTrialMessage(store.limits),
        tier: store.tier,
        used: binder.pages.length,
        cap: store.limits.pagesPerBinder,
      });
    } else if (added > 0) {
      // parityNote names any blank page the insertion forced, same as duplicate/send do, so a
      // page appearing out of nowhere is explained rather than looking like a bug. The catalogue
      // note names pockets for OWNED cards that ran out of free copies (assigner came up empty,
      // or the store's guard refused a stale claim) - never the never-owned, which are
      // aspirational by choice.
      const short =
        droppedClaims + cardIds.filter((id, i) => entryIds[i] === undefined && ownsCard(id)).length;
      showToast(
        parityNote(`Added ${added} card${added === 1 ? '' : 's'}`, blanksInserted) +
          catalogArtNote(short, added),
      );
    }
  };

  // The artworks-kept cap covers EVERY way new art enters the account: studio saves are gated
  // in the studio, and direct placements are gated here — each placed piece is mirrored into
  // the tray by the import scan, so an unchecked placement would grow the tray past the cap
  // silently. `newPieces` is the footprint's piece count (an upper bound: folded pairs merge).
  const artCapBlocks = (newPieces: number): boolean => {
    if (keptArtworks + newPieces <= store.limits.artUploads) return false;
    // This is the single choke point for art entering the account, so one event here covers
    // every path (tray import, direct placement, studio save).
    capGate.hit({
      limit: 'artUploads',
      surface: 'binder_editor',
      isGuest: store.tier === 'guest',
      title: 'Your artwork shelf is full',
      message: artLimitMessage(store.tier, store.limits),
      trialMessage: artTrialMessage(store.limits),
      tier: store.tier,
      used: keptArtworks,
      cap: store.limits.artUploads,
    });
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

  const handlePickInsert = (insertColor: string, rowSpan: number, colSpan: number) => {
    if (!pickerCell) return;
    const { row, col } = pickerCell;
    store.upsertSlot(binder.id, page.id, { row, col, type: 'insert', insertColor, rowSpan, colSpan });
    // Keep adding: jump to the next empty pocket that fits this insert's footprint (mirrors cards),
    // so a run of dividers/spacers can be laid down without reopening the sheet each time.
    if (keepAdding) {
      const next = nextEmptyCell(row, col, rowSpan, colSpan);
      if (next) {
        setPickerCell(next);
        return;
      }
    }
    closePicker();
  };

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
    ownedIds,
    scanUrlOf,
    decorative,
  }: {
    page: DemoPage;
    width: number;
    role: GridRole;
    captionFields: CaptionFieldKey[];
    ownedIds?: ReadonlySet<string>;
    scanUrlOf?: (slot: DemoSlot) => string | undefined;
    decorative?: boolean;
  }) => {
    // A COPY FOR THE PAGE TURN IS INERT. Every editable branch below attaches prevRef / nextRef and
    // registers drop targets, so handing the animation a live grid let a decorative duplicate take
    // the ref the editor was holding — the reason turning misbehaved in one's own binders only.
    if (decorative) {
      return (
        <BinderGrid
          page={p}
          width={width}
          editable={false}
          captionFields={captionFields}
          ownedIds={ownedIds}
          scanUrlOf={scanUrlOf}
          variantOf={variantOf}
          instantImages
        />
      );
    }
    if (!editing) {
      return (
        <BinderGrid page={p} width={width} editable={false} captionFields={captionFields} ownedIds={ownedIds} scanUrlOf={scanUrlOf} variantOf={variantOf} onVariantPress={onFinishPress} finishAskable={finishAskable} />
      );
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
          ownedIds={ownedIds} scanUrlOf={scanUrlOf}
          variantOf={variantOf} onVariantPress={onFinishPress} finishAskable={finishAskable}
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
          ownedIds={ownedIds} scanUrlOf={scanUrlOf}
          variantOf={variantOf} onVariantPress={onFinishPress} finishAskable={finishAskable}
          // The facing page is a first-class drop surface for tray slices too.
          dropTargets={isPrev ? prevDropTargets : nextDropTargets}
          onCellPress={(row, col) => {
            // An armed tray slice places here directly — without stealing the page focus.
            if (armedSlice) {
              placeSliceOnPage(armedSlice, p, pIdx, row, col);
              return;
            }
            changePage(pIdx);
            openPickerAt({ row, col });
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
        ownedIds={ownedIds} scanUrlOf={scanUrlOf}
        variantOf={variantOf} onVariantPress={onFinishPress} finishAskable={finishAskable}
        selectedSlotId={selectedSlotId}
        // Which pocket the panels are pointed at. Only on the ACTIVE page: pickerCell is a cell
        // reference, and the same row/col exists on every page.
        activeCell={p.id === page.id ? pickerCell : null}
        multiSelectedIds={multiIds}
        onCellPress={handleAddCell}
        onSlotPress={handleSelectSlot}
        onResizeSlot={handleResizeSlot}
        onReplaceSlot={replaceSelected}
        onDuplicateSlot={duplicateSelected}
        onRemoveSlot={removeSelected}
        onDeselectSlot={() => setSelectedSlotId(null)}
        onAutoFillSlot={() => setAutoFillOpen(true)}
        onPickCopySlot={pickCopyForSelected}
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
  /**
   * THE EDITING TOOLS, AS ICONS, IN THE HEADER.
   *
   * They used to be a card of labelled pills inside the details dialog: two clicks and a scroll to
   * reach Undo. As symbols they fit in chrome this screen already draws, which is the only place a
   * control is free — anything in the flow above the binder pushes the binder down and shrinks it.
   *
   * Each one keeps its old behaviour exactly; only the label became a glyph, and every button
   * carries its words in `accessibilityLabel` so the meaning is not lost with the text.
   */
  /**
   * THE EDITING TOOLS, AS ICONS, IN THE HEADER — but in three scopes, not one row.
   *
   * They arrived as six glyphs at a 2px gap with no separator, no container and no label, and the
   * eye groups by adjacency: everything read as "things that act on this page". Two of them do not.
   *
   *   - Undo and redo swap a whole binder-list snapshot (see store/binders.tsx's history), so one
   *     press can roll back an edit made on a different page. Session-wide, the widest scope here,
   *     and it sat first in a run that read as "page".
   *   - "+" appends a page at the END of the binder and does not navigate. On a twelve-page binder
   *     it makes page thirteen and leaves you on page four.
   *   - Duplicate, send and delete are the only true current-page operations.
   *
   * So: a hairline after history, then one bordered group whose first element is the page's own
   * number. The container is the cheapest true statement of scope — no prose, no extra row — and
   * on a two-page spread the badge is the only thing on screen that answers "which of these two
   * would the ✕ delete".
   */
  const editIcons = (
    <View style={styles.iconBar}>
      <IconBtn glyph="↶" label="Undo" onPress={store.undo} disabled={!store.canUndo} testID="tool-undo" />
      <IconBtn glyph="↷" label="Redo" onPress={store.redo} disabled={!store.canRedo} testID="tool-redo" />
      <View style={styles.groupRule} />
      <View style={styles.pageGroup}>
        {/* Tapping it opens the page's details — the same dialog the title above the page opens —
            so a page's name sits at the head of the page's own tools as well as over its art. */}
        <Pressable
          onPress={() => setPageInfoOpen(true)}
          hitSlop={6}
          accessibilityRole="button"
          accessibilityLabel={`Page ${idx + 1} of ${binder.pages.length} — name and description`}
          testID="tool-page-badge"
          style={styles.pageBadge}>
          <Text style={styles.pageBadgeText}>{`▤ ${idx + 1}/${binder.pages.length}`}</Text>
        </Pressable>
        <IconBtn
          glyph="+"
          // Named for what it does. "Add a page", beside three this-page tools, read as "insert one
          // here" — which it has never done.
          label="Add a page at the end"
          testID="tool-add-page"
          onPress={() =>
            store.pageLimitReached(binder.id)
              ? showLimitToast(pageLimitMessage(store.tier, store.limits))
              : store.addPage(binder.id)
          }
        />
        <IconBtn glyph="⧉" label="Duplicate this page" onPress={handleDuplicatePage} testID="tool-duplicate" />
        {/* Send this page into ANOTHER of your binders (copy, or move it out of this one). */}
        {store.userBinders.some((b) => b.id !== binder.id) ? (
          <IconBtn
            glyph="➦"
            label="Send this page to another binder"
            onPress={() => setSendPageOpen(true)}
            testID="tool-send-page"
          />
        ) : null}
        {binder.pages.length > 1 ? (
          <IconBtn
            glyph="✕"
            label="Delete this page"
            tone="danger"
            testID="tool-delete-page"
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
        ) : null}
      </View>
    </View>
  );

  /**
   * HOW THE WHOLE BINDER LOOKS — shown under the view chips, behind the gear.
   *
   * Page size was already binder-wide; background now is too. A binder is one object, and letting
   * each page carry its own colour let one drift into a patchwork nobody chose — invisible until
   * you flipped onto the odd page out. Both live with the other "how this binder shows itself"
   * choices instead of in a per-page tools card.
   */
  const binderLookSettings = editing ? (
    <View style={styles.lookBox}>
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
      </View>
      <View style={styles.inlineRow}>
        <ThemedText type="small" themeColor="textSecondary" style={styles.inlineLabel}>
          Background
        </ThemedText>
        <View style={styles.colorFieldBox}>
          <ColorField
            key={binder.id}
            value={page.backgroundColor}
            onChange={(backgroundColor) => store.setBinderBackground(binder.id, backgroundColor)}
          />
        </View>
      </View>
      {binder.pages.some(isBlankPage) ? (
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
      ) : null}
    </View>
  ) : null;

  /**
   * ONE SOURCE OF TRUTH FOR THE HEADER'S CONTENT BOX. The header row and the floating title take
   * the same insets, so the title's centre IS the centre of the space the pages get — which is the
   * whole point of floating it.
   */
  const headerInset = {
    paddingLeft: (artworkDocked ? artworkWidth : 0) + Spacing.three,
    paddingRight: (pickerDocked ? pickerWidth : 0) + Spacing.three,
  };
  // How much the title may claim before it would sit under a side group. Symmetric by construction
  // — any equal inset keeps the centre — so it is the WIDER side, doubled, that has to clear.
  const headerContentW = width - headerInset.paddingLeft - headerInset.paddingRight;
  const titleMaxW = Math.max(120, headerContentW - 2 * (headerRightW + Spacing.three));

  return (
    <ThemedView style={styles.flex}>
      <SafeAreaView style={styles.flex} edges={['top']}>
          {/* Header */}
          {/* The picker is a full-height column on the right edge, so the header's own controls
              have to step aside for it too — otherwise the panel clips Done and Share. */}
          <View style={[styles.header, headerInset]}>
            <Pressable onPress={onClose} hitSlop={10}>
              <Text style={[styles.headerAction, { color: theme.text }]}>Close</Text>
            </Pressable>
            {/* TAP THE TITLE TO EDIT IT. The binder's name is already on screen, so a separate
                "Binder title" field in a dialog was the same words twice. Tapping opens the
                binder's details while editing — its name and its description — and, while
                reading, the description on its own. Both are keyed to MODE, not to permission: an
                owner reading their own binder wants what a visitor wants.

                Live in both modes, described or not: a blank description opens onto the
                placeholder, which says where to write one. */}
            <View pointerEvents="box-none" style={[styles.titleFloat, headerInset]}>
              <Pressable
                onPress={() => setBinderInfoOpen(true)}
                onHoverIn={binderHover.onHoverIn}
                onHoverOut={binderHover.onHoverOut}
                hitSlop={6}
                style={[styles.titlePress, { maxWidth: titleMaxW }]}
                accessibilityRole="button"
                testID="binder-title"
                accessibilityLabel={
                  editing ? 'Binder details \u2014 edit the title and description' : 'About this binder'
                }>
                <ThemedText type="subtitle" numberOfLines={1} style={styles.titleText}>
                  {binder.title || (editing ? 'Untitled binder' : '')}
                </ThemedText>
              </Pressable>
              {binderHover.shown ? (
                <AboutHoverCard
                  kicker={binder.title || 'This binder'}
                  text={binder.description?.trim() || BINDER_DESCRIPTION_PLACEHOLDER}
                  style={styles.titleHover}
                />
              ) : null}
            </View>
            {canEdit ? (
              <View
                style={styles.headerRight}
                onLayout={(e) => setHeaderRightW(e.nativeEvent.layout.width)}>
                {editing ? editIcons : null}
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
                {/* The view settings, in both modes. A gear, not a row. */}
                <Pressable
                  onPress={() => setSettingsOpen(true)}
                  hitSlop={10}
                  accessibilityRole="button"
                  accessibilityLabel="View settings"
                  testID="binder-settings-btn">
                  <Text style={[styles.headerAction, { color: theme.text }]}>⚙</Text>
                </Pressable>
                {/* SELECT SEVERAL POCKETS acts on a SELECTION, not on the page, so it belongs
                    with the count it produces rather than inside the page group.

                    Gone entirely while the picker is aimed at a pocket: the two modes are already
                    mutually exclusive in code — handleAddCell clears the selection on the way in,
                    and every further empty-pocket tap clears it again — so offering it beside an
                    "Add to pocket" panel offers a mode the next tap destroys. That is exactly the
                    state in the screenshot this came from. An empty page has nothing to select
                    either, so it waits for the page to have something on it. */}
                {editing && !pickerCell && page.slots.length > 0 ? (
                  <IconBtn
                    glyph="⊕"
                    label="Select several pockets"
                    testID="binder-select-toggle"
                    active={selectMode}
                    onPress={() => {
                      setSelectMode((v) => {
                        if (v) clearMulti();
                        return !v;
                      });
                      setSelectedSlotId(null);
                    }}
                  />
                ) : null}
                {/* SELECT MODE HAS TO SAY IT IS ON somewhere you can see without opening a
                    dialog — it changes what every tap on the binder does. The header is chrome
                    this screen already draws, so saying it here costs the page no height, and it
                    doubles as the one-tap route to the actions the selection leads to. */}
                {editing && selectMode ? (
                  <Pressable
                    onPress={() => setMultiActionsOpen(true)}
                    hitSlop={10}
                    accessibilityRole="button"
                    accessibilityLabel={`Actions for ${multiIds.size} selected pockets`}
                    testID="binder-actions-btn">
                    <View style={[pillChip.base, pillChip.active]}>
                      <Text style={[pillChip.text, pillChip.textActive]}>
                        ✓ Selecting · {multiIds.size}
                      </Text>
                    </View>
                  </Pressable>
                ) : null}
                <Pressable onPress={() => setPrintOpen(true)} hitSlop={10} accessibilityLabel="Print fill sheets">
                  <Text style={[styles.headerAction, { color: theme.text }]}>Print</Text>
                </Pressable>
                {isSupabaseConfigured ? (
                  <Pressable onPress={() => setShareOpen(true)} hitSlop={10}>
                    <Text style={[styles.headerAction, { color: theme.text }]}>Share</Text>
                  </Pressable>
                ) : null}
                <Pressable
                  onPress={() => {
                    setEditingWanted((e) => !e);
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
            ) : binder.locked ? (
              // A locked reference (the print sampler): view only — no edit, no Duplicate. Print
              // is the whole point of it, though: the sheet's free example is this binder.
              <View style={styles.headerRight}>
                <Pressable onPress={() => setPrintOpen(true)} hitSlop={10} accessibilityLabel="Print fill sheets">
                  <View style={styles.modeBtn}>
                    <Text style={styles.modeBtnText}>Print</Text>
                  </View>
                </Pressable>
                <Text style={[styles.headerAction, { color: theme.textSecondary }]}>View only</Text>
              </View>
            ) : (
              <View style={styles.headerRight}>
                <Pressable onPress={() => setPrintOpen(true)} hitSlop={10} accessibilityLabel="Print fill sheets">
                  <Text style={[styles.headerAction, { color: theme.text }]}>Print</Text>
                </Pressable>
                <Pressable onPress={handleDuplicate} hitSlop={10}>
                  <View style={styles.modeBtn}>
                    <Text style={styles.modeBtnText}>Duplicate</Text>
                  </View>
                </Pressable>
              </View>
            )}
          </View>

          {/* Pad the page over by whatever the picker occupies, so the binder sits centred in the
              space it actually has rather than centred in the window with a panel parked on top of
              its right-hand third. The rail's 34px is padded too, for the same reason. */}
          <ScrollView
            // Named, because "does the binder need scrolling" is a question a test has to be able
            // to ask about THIS scroller — the filmstrip and the two panels scroll on purpose.
            testID="binder-scroll"
            // Its own position in the window: the header and any safe-area inset sit above it, and
            // this is the one term of the page's height budget that BinderPages cannot see.
            onLayout={(e) => setViewportTop(e.nativeEvent.layout.y)}
            contentContainerStyle={[
              styles.scroll,
              pickerDocked && { paddingRight: pickerWidth },
              artworkDocked && { paddingLeft: artworkWidth },
            ]}>
            {/* Everything this screen stacks above the pages, measured as one height. */}
            <View onLayout={(e) => setCallerChrome(e.nativeEvent.layout.height)}>
            {/* Read-only because another tab of this browser owns editing — see EditLockBanner. */}
            <EditLockBanner />
            {/* Read-only because the contest froze it. A different lock, so a different banner:
                one of these you can take back with a click, the other you cannot. */}
            <ContestLockBanner finalist={contestLock} />
            <SaveErrorBanner />
            {/* THE EDITOR'S ROW OF CHIPS IS GONE - all four of its buttons now live elsewhere.

                Edit mode used to open with a wall of forms above the art; that became this one row
                of chips, which was better but still a row. A row above the binder pushes the binder
                DOWN, and the space above the page feeds the height budget, so every control parked
                here costs page size in the mode where the page matters most.

                Where they went: "Artwork" is redundant - that panel is a permanent rail on the left
                now, so the rail IS the button. "Select" and its Actions moved into the details
                dialog. "Binder details & tools" is a Tools button in the header above, which is
                chrome this screen already draws. The header is also where the gear lives, holding
                the view chips that used to sit on their own row inside BinderPages. */}
            {/* THE DETAILS PANEL IS A DIALOG NOW, not a row that opens here.
                Anything that expands in the flow above the binder pushes the binder DOWN, and the
                space above the page is measured and feeds the height budget — so opening this used
                to move the pages and re-size them at the same time. A dialog changes neither.
                See the ConfirmDialog-style overlay near the other sheets below.

                The description does not print here either. It was a permanent line of centred grey
                text answering a question most visits are not asking, paid for out of the height
                the binder is short of. It lives behind the title now (AboutPopup), which is where
                edit mode already kept it: one home for the words, in both modes. */}
            </View>

            {/* One shared page-browsing surface, arrows · prev·current·next spread · filmstrip ·
                Card labels, identical to the public viewer. Only what each grid *does* differs by
                mode, injected through renderGrid; edit adds the value badge, page-detail inputs and
                filmstrip reordering. */}
            <BinderPages
              binder={binder}
              pageIndex={idx}
              onPageChange={changePage}
              availableWidth={available}
              // The header, plus the title fields and tools card that edit mode stacks above the
              // art. Until those move beside the page (audit A3) they are simply a cost the page
              // has to be told about, or it fits itself to a window taller than it really has.
              // Edit mode costs a single disclosure row now, not a wall of forms — unless the
              // user opens it, in which case the page yields the space it asked for.
              // Measured, not guessed. This was `editing ? (toolsOpen ? 330 : 130) : 88` — an
              // estimate of chrome the page component cannot see, wrong by about a hundred pixels,
              // and silently wrong again every time anything was added to the editor's header.
              viewportTop={viewportTop + callerChrome}
              onPageWidth={setPageWidthUsed}
              editable={editing}
              // Binders reachable here come from the signed-in user's own store (userBinders) or
              // are bundled examples, so the viewer is the owner. The public route decides for
              // itself by comparing owner_id (see app/binder/[id].tsx).
              viewerIsOwner
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
              // No page header in the flow at all: naming a page happens in the details dialog,
              // and the read-only title line BinderPages draws for itself is a fixed height.
              //
              // Live in BOTH modes: editing, the title opens the page's fields; reading, it opens
              // the page's description. Not offered when there is nothing to read, because a title
              // that opens an empty card is worse than one that does not respond.
              onEditPage={editing || page.description ? () => setPageInfoOpen(true) : undefined}
              settingsOpen={settingsOpen}
              onCloseSettings={() => setSettingsOpen(false)}
              settingsExtras={binderLookSettings}
              view={view}
              onCoverContext={(ctx) => {
                setCoverCtx(ctx);
                // Picking a surface IS the request to decorate it, so the panel holding the
                // cover's tools comes forward with it.
                if (ctx) setArtworkOpen(true);
              }}
              renderGrid={renderGrid}
            />

            {/* DELETING THE BINDER IS NOT AN EDITING TOOL. It sat at the foot of the editor,
                below the pages, where the only reason to scroll past your own binder was to find
                the one control that destroys it. /my-binders already offers it from each tile's
                ⋯ menu, which is the right place: you delete a binder from the shelf, not from
                inside the thing you are working on. */}
          </ScrollView>

          {/* THE BOTTOM SLICE TRAY IS GONE. It was a full-width bar pinned under the binder plus a
              150px spacer to stop the page sliding beneath it — 150px of a height budget the page
              never got back, spent on a surface the Artwork panel now does better: taller, beside
              the binder rather than under it, and browsable instead of a single scrolling line.
              Same chips, same drag, same store; the ghost below still belongs to both. */}
          {dragSlice ? (
            <Animated.View pointerEvents="none" style={[styles.dragGhost, ghostStyle]}>
              <SliceThumb slice={dragSlice} style={StyleSheet.absoluteFill} />
            </Animated.View>
          ) : null}
        </SafeAreaView>

        {/* "Which finish?" — the one sheet here that edits the COLLECTION rather than the binder.
            Picking raises the confirmation; the write happens on confirm and is reversible from
            the toast, which is why this is a plain confirm and not the type-the-name gate the
            repo reserves for irreversible loss of authored work. */}
        {variantChoice ? (
          <VariantPickerSheet
            visible
            cardId={variantChoice.cardId}
            cardName={variantChoice.cardName}
            current={variantChoice.current}
            quantity={variantChoice.quantity}
            onClose={() => setVariantChoice(null)}
            onPick={(next) => {
              const c = variantChoice;
              setVariantChoice(null);
              const from = chipFor(c.current).label;
              const to = chipFor(next).label;
              const many = c.quantity > 1;
              setConfirm({
                title: 'Change this card in your collection?',
                // Naming the count is not caution, it is accuracy: one row covers the whole lot,
                // so a three-card lot really does change three cards.
                message: `${c.cardName ?? 'This card'} is recorded as ${from}. Setting it to ${to} changes ${
                  many ? `all ${c.quantity} cards in that lot` : 'that card'
                } in your collection, not just this pocket.`,
                confirmLabel: 'Change it',
                onConfirm: () =>
                  applyVariant(c.entryId, next, { variant: c.current, updatedAt: c.updatedAt }),
              });
            }}
          />
        ) : null}

        {/* "Which copy?" - only ever open on top of the card picker, and closing it without an
            answer leaves the pocket empty and the picker where it was, which is a cancel. */}
        {copyChoice ? (
          <CopyPickerSheet
            visible
            cardId={copyChoice.cardId}
            cardName={copyChoice.cardName}
            copies={copyChoice.copies}
            onClose={() => setCopyChoice(null)}
            currentEntryId={copyChoice.currentEntryId}
            onPick={(entryId) => {
              const c = copyChoice;
              setCopyChoice(null);
              // An existing pocket keeps its card and only changes hands; a new one is placed.
              // `null` is an explicit detach, which is why it is not collapsed to undefined here.
              if (c.existing) {
                store.upsertSlot(binder.id, page.id, {
                  row: c.row,
                  col: c.col,
                  sourceEntryId: entryId,
                });
                return;
              }
              placeCardInPocket(c.cardId, c.row, c.col, c.rows, c.cols, entryId ?? undefined);
            }}
          />
        ) : null}

        {/* THE OTHER SIDE. Cards on the right, cut art on the left, both feeding the one pocket
            you have selected — which is why the active pocket had to become unmistakable. */}
        <ArtworkDock
          visible={sidesShown}
          collapsed={!artWantsPanel}
          onToggleCollapsed={() => setArtworkOpen((v) => !v)}
          onResize={commitDock('artDockPct')}
          onResizeReset={resetDock('artDockPct')}
          resizeMin={PANEL_MIN_WIDTH}
          resizeMax={dockCeiling(pickerDocked ? pickerWidth : 0)}
          coverTools={
            editing && coverCtx ? (
              <CoverPanel
                ctx={coverCtx}
                view={view}
                canUndo={store.canUndo}
                canRedo={store.canRedo}
                onUndo={store.undo}
                onRedo={store.redo}
                onToast={(m) => showToast(m)}
                surfaceAspect={coverCtx.surfaceAspect}
              />
            ) : undefined
          }
          // The layers tray rides under the dock's head on every tab while a surface is focused.
          coverLayers={
            editing && coverCtx ? (
              <LayersTray
                items={coverCtx.cover.surfaces?.[coverCtx.surface] ?? []}
                selected={coverCtx.selected}
                onSelect={coverCtx.onSelect}
                onChange={(next) => coverCtx.onChange(withSurface(coverCtx.cover, coverCtx.surface, next))}
              />
            ) : undefined
          }
          docked={artworkDocked}
          width={artworkWidth}
          side="left"
          // Done on the dock lets the cover go too: "a surface is focused" and "the dock is open on
          // Cover" are meant to be the same fact.
          onClose={() => {
            setArtworkOpen(false);
            coverCtx?.onClearFocus();
          }}
          armedId={armedSlice?.id ?? null}
          onArm={setArmedSlice}
          onDragStart={handleSliceDragStart}
          onDrop={handleSliceDrop}
          onRemove={handleRemoveSlice}
          onNewSlice={openStudioForPage}
          // Inserts moved to this side with the artwork: both are "not a card", and the card
          // browser has to stay alone on its own side anyway.
          onPickInsert={handlePickInsert}
          onClear={handleClear}
          ghostOn={ghostOn}
          ghostX={ghostX}
          ghostY={ghostY}
        />

        <CardPicker
          visible={sidesShown}
          page={page}
          cell={pickerCell}
          slot={slotAtCell}
          onClose={closePicker}
          onPickCard={handlePickCard}
          onPickVUnion={handlePickVUnion}
          onPickCards={handlePickCards}
          onPickArtwork={handlePickArtwork}
          onSaveSlices={(slices) => {
            // The embedded studio disables Save past the cap; this is the belt-and-braces guard.
            if (artCapBlocks(slices.length)) return;
            addSavedSlices(slices);
            closePicker();
            showToast(`Saved ${slices.length} slice${slices.length === 1 ? '' : 's'} to your tray`);
          }}
          trayCount={keptArtworks}
          trayLimit={store.limits.artUploads}
          guest={store.tier === 'guest'}
          onPickInsert={handlePickInsert}
          onClear={handleClear}
          keepAdding={keepAdding}
          onToggleKeepAdding={() => setKeepAdding((v) => !v)}
          initialSimilar={similarSeed ?? undefined}
          onSimilarLocked={() => capGate.hit(similarityWall(store.tier, 'binder_editor'))}
          // The Artwork tab is the slice tray now, so it takes the tray's wiring: the same handlers
          // the bottom tray uses, so a piece behaves identically whichever surface you pick it up
          // from, and the drag ghost is the same one.
          armedSliceId={armedSlice?.id ?? null}
          onArmSlice={setArmedSlice}
          onSliceDragStart={handleSliceDragStart}
          onSliceDrop={handleSliceDrop}
          onRemoveSlice={handleRemoveSlice}
          onOpenStudio={openStudioForPage}
          ghostOn={ghostOn}
          ghostX={ghostX}
          ghostY={ghostY}
          collapsed={!cardsWantsPanel}
          onToggleCollapsed={() => setCardsCollapsed((v) => !v)}
          collapsedLabel="Cards"
          onResize={commitDock('cardsDockPct')}
          onResizeReset={resetDock('cardsDockPct')}
          resizeMin={PANEL_MIN_WIDTH}
          resizeMax={dockCeiling(artworkDocked ? artworkWidth : 0)}
          docked={pickerDocked}
          dockWidth={pickerWidth}
        />

        <AutoFillSheet
          visible={autoFillOpen}
          seedCardId={selectedSlot?.cardId ?? null}
          page={page}
          onClose={() => setAutoFillOpen(false)}
          onPlaced={handleAutoFillPlaced}
          onComposeAll={handleComposeAll}
          onSimilarLocked={() => capGate.hit(similarityWall(store.tier, 'binder_editor'))}
        />

        {/* Mounted only while open, keyed by seed: each invocation gets fresh state, so the
            build effect never resets anything synchronously. */}
        {composeAll ? (
        <ComposeAllSheet
          key={composeAll.seed.id}
          visible
          seed={composeAll.seed}
          page={page}
          pool={composeAll.pool}
          onClose={() => setComposeAll(null)}
          onKeep={handleKeepComposed}
        />
        ) : null}

        {/* BINDER DETAILS — over the binder, never above it, and opened by tapping the title.

            TWO DIALOGS, ONE TAP, chosen by MODE rather than by permission. Editing, the title is a
            way into the binder's own fields. Reading, it is a way to the description and nothing
            else: an owner looking at their binder is doing the same thing a visitor is, and a form
            that appears because of who you are rather than what you are doing is a surprise. */}
        {binderInfoOpen && !editing ? (
          <AboutPopup
            kicker={binder.title || 'This binder'}
            text={binder.description?.trim() || BINDER_DESCRIPTION_PLACEHOLDER}
            onClose={() => setBinderInfoOpen(false)}
          />
        ) : binderInfoOpen ? (
          <Modal visible transparent animationType="fade" onRequestClose={() => setBinderInfoOpen(false)}>
            <View style={sheet.dialogBackdrop}>
              <Pressable style={StyleSheet.absoluteFill} onPress={() => setBinderInfoOpen(false)} />
              <ThemedView type="backgroundElement" style={styles.toolsCard}>
                <View style={styles.toolsHead}>
                  <ThemedText type="subtitle">Binder details</ThemedText>
                  <Pressable onPress={() => setBinderInfoOpen(false)} hitSlop={10} testID="binder-info-done">
                    <Text style={[styles.headerAction, styles.primaryText]}>Done</Text>
                  </Pressable>
                </View>
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
              </ThemedView>
            </View>
          </Modal>
        ) : null}

        {/* PAGE DETAILS — opened by tapping the page's own title above it, and split by mode
            exactly the way the binder's is. */}
        {pageInfoOpen && !editing ? (
          <AboutPopup
            kicker={page.title || `Page ${idx + 1}`}
            text={page.description?.trim() || PAGE_DESCRIPTION_PLACEHOLDER}
            onClose={() => setPageInfoOpen(false)}
          />
        ) : pageInfoOpen ? (
          <Modal visible transparent animationType="fade" onRequestClose={() => setPageInfoOpen(false)}>
            <View style={sheet.dialogBackdrop}>
              <Pressable style={StyleSheet.absoluteFill} onPress={() => setPageInfoOpen(false)} />
              <ThemedView type="backgroundElement" style={styles.toolsCard}>
                <View style={styles.toolsHead}>
                  <ThemedText type="subtitle">Page {idx + 1}</ThemedText>
                  <Pressable onPress={() => setPageInfoOpen(false)} hitSlop={10} testID="page-info-done">
                    <Text style={[styles.headerAction, styles.primaryText]}>Done</Text>
                  </Pressable>
                </View>
                {/* Scrolls: the composition notes below can run past a short phone. */}
                <ScrollView contentContainerStyle={styles.binderFields} keyboardShouldPersistTaps="handled">
                  <LabeledInput
                    label="Page title"
                    value={page.title ?? ''}
                    onChangeText={(title) => store.updatePage(binder.id, page.id, { title })}
                    placeholder="Untitled page"
                  />
                  <LabeledInput
                    label="Page description"
                    value={page.description ?? ''}
                    onChangeText={(description) => store.updatePage(binder.id, page.id, { description })}
                    placeholder="What's on this page?"
                    multiline
                  />
                  {/* Why the page looks the way it does: what the open pockets mean, and what each
                      reserved art panel is for. See PageComposition for why it lives here. */}
                  <PageComposition page={page} />
                </ScrollView>
              </ThemedView>
            </View>
          </Modal>
        ) : null}

        {studio && (
          <SliceStudio
            ref={studioRef}
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
            // DISMISSING SAVES. The studio is the only place this work exists until it reaches the
            // tray, and Close used to throw it away — the same defect the picker's backdrop had,
            // which now matters more because this is the ONLY way the studio opens. commit() is a
            // no-op unless there is genuinely unsaved framing, so this never duplicates a save.
            onClose={() => {
              studioRef.current?.commit();
              setStudio(null);
            }}
            trayCount={keptArtworks}
            trayLimit={store.limits.artUploads}
            guest={store.tier === 'guest'}
          />
        )}

        {/* Web keyboard shortcuts (edit mode; disabled while a sheet is open). */}
        <EditorKeyboardShortcuts
          undoable={editing && !studio && !confirm}
          pocketKeys={!pickerCell}
          onUndo={store.undo}
          onRedo={store.redo}
          onDelete={deleteSelection}
          onPrevPage={() => changePage(idx - 1)}
          onNextPage={() => changePage(idx + 1)}
        />

        <Toast spec={toast} onDismiss={() => setToast(null)} />
        <CapGateDialog wall={capGate.wall} onDismiss={capGate.dismissWall} onResolve={capGate.resolveWall} />
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
        {/* The account-level attestation, offered on an editable binder when due (first binder,
            then at most every 7 days until accepted). Decides everything internally. */}
        {canEdit ? <RightsPrompt binder={binder} surface="binder" /> : null}
        {printOpen ? (
          <PrintPlaceholdersSheet
            binder={binder}
            onClose={() => setPrintOpen(false)}
            onDone={(sheets) => showToast(`Placeholder PDF downloaded (${sheets + 1} pages)`)}
          />
        ) : null}
        <ShareSheet
          visible={shareOpen}
          binder={binder}
          isPublic={!!binder.isPublic}
          onClose={() => setShareOpen(false)}
          onSetPublic={(v) => store.updateBinder(binder.id, { isPublic: v })}
          onSetPagePublic={(pageId, v) => store.updatePage(binder.id, pageId, { isPublic: v })}
          onSetSharePages={(ids) => store.updateBinder(binder.id, { sharePageIds: ids })}
          onToast={showToast}
        />
        {sendPageOpen && (
          <AddToBinderSheet
            title={`Send page ${idx + 1} to…`}
            binders={store.userBinders.filter((b) => b.id !== binder.id)}
            emptyText="You don’t have another binder to send this page to yet."
            accessory={
              <Pressable
                onPress={() => setSendAsMove((v) => !v)}
                accessibilityRole="switch"
                accessibilityState={{ checked: sendAsMove }}
                style={styles.sendModeRow}
                hitSlop={4}>
                <View style={[styles.sendModeBox, sendAsMove && styles.sendModeBoxOn]}>
                  {sendAsMove ? <Text style={styles.sendModeTick}>✓</Text> : null}
                </View>
                <ThemedText type="small" themeColor="textSecondary" style={styles.sendModeText}>
                  Move it (remove this page from “{binder.title}”). Off = send a copy.
                </ThemedText>
              </Pressable>
            }
            onPick={(toId) => handleSendPage(toId, sendAsMove)}
            onClose={() => setSendPageOpen(false)}
          />
        )}
        <LikersSheet visible={likesOpen} binderId={binder.id} onClose={() => setLikesOpen(false)} />
        {/* THE LAYERS TRAY MUST BE ON SCREEN whenever a surface is being decorated. When the Art
            dock is docked and open it lives under the dock's head; when the dock is a rail or has
            fallen back to a modal, it floats over the binder instead. An overlay is free space —
            nothing enters the flow above the pages. */}
        {editing && coverCtx && !(artworkDocked && artWantsPanel) ? (
          <LayersTray
            floating
            items={coverCtx.cover.surfaces?.[coverCtx.surface] ?? []}
            selected={coverCtx.selected}
            onSelect={coverCtx.onSelect}
            onChange={(next) => coverCtx.onChange(withSurface(coverCtx.cover, coverCtx.surface, next))}
          />
        ) : null}
      </ThemedView>
  );
}

/**
 * Installs web keyboard shortcuts for the editor: ⌘/Ctrl+Z undo, ⇧⌘Z / Ctrl+Y redo,
 * Delete/Backspace to clear the selection, ←/→ to change pages. No-op on native and while typing
 * in a field. A component (not an inline effect) so its hook order stays stable.
 *
 * TWO GATES, NOT ONE. Undo used to be switched off whenever the picker was aimed at a pocket,
 * which is the state you are in right after clicking an empty pocket and — with keep-adding on —
 * after every single card you place. Undo was unavailable at exactly the moment you reach for it.
 * It is safe there: this handler already ignores keys typed into the picker's search field, so
 * `undoable` only asks that the editor is the thing on screen.
 *
 * `pocketKeys` stays narrow. Delete and the page arrows act on the page BEHIND an open picker, so
 * they keep waiting for it to close: a Delete meant for a search box that clears a pocket instead
 * is the kind of help nobody asked for.
 */
function EditorKeyboardShortcuts({
  undoable,
  pocketKeys,
  onUndo,
  onRedo,
  onDelete,
  onPrevPage,
  onNextPage,
}: {
  /** The editor is up: undo/redo apply. */
  undoable: boolean;
  /** Nothing is layered over the page, so keys that act ON the page apply too. */
  pocketKeys: boolean;
  onUndo: () => void;
  onRedo: () => void;
  onDelete: () => void;
  onPrevPage: () => void;
  onNextPage: () => void;
}) {
  useEffect(() => {
    if (Platform.OS !== 'web' || !undoable || typeof window === 'undefined') return;
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
      } else if (!pocketKeys) {
        // Everything below acts on the page itself, which something is currently sitting over.
      } else if (e.key === 'Delete' || e.key === 'Backspace') {
        // Backspace is browser Back on a page with nothing focused, which would leave the editor
        // entirely on a keystroke meant to clear one pocket.
        e.preventDefault();
        onDelete();
      } else if (e.key === 'ArrowLeft') {
        onPrevPage();
      } else if (e.key === 'ArrowRight') {
        onNextPage();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [undoable, pocketKeys, onUndo, onRedo, onDelete, onPrevPage, onNextPage]);
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

/**
 * A tool as a symbol. Thirty pixels square, so a row of them fits in a header beside the title —
 * which is the whole point: a labelled pill row cannot live there, and anywhere else it would sit
 * above the binder and take height from the pages. The words survive in `label`, which is both the
 * accessible name and the hover title, so nothing is lost by dropping them from the face.
 */
function IconBtn({
  glyph,
  label,
  onPress,
  disabled = false,
  active = false,
  tone = 'default',
  testID,
}: {
  glyph: string;
  label: string;
  onPress: () => void;
  disabled?: boolean;
  active?: boolean;
  tone?: 'default' | 'danger';
  testID?: string;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      hitSlop={6}
      testID={testID}
      accessibilityRole="button"
      accessibilityState={{ disabled, selected: active }}
      accessibilityLabel={label}
      // Web only, and harmless elsewhere: the same words as a native tooltip.
      {...({ title: label } as object)}
      style={({ pressed }) => [
        styles.iconBtn,
        active && styles.iconBtnActive,
        pressed && !disabled && styles.pressed,
      ]}>
      <Text
        style={[
          styles.iconGlyph,
          tone === 'danger' && styles.iconGlyphDanger,
          active && styles.iconGlyphActive,
          disabled && styles.iconGlyphOff,
        ]}>
        {glyph}
      </Text>
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
  notFound: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 12,
    // The header is EARLIER in the tree than the binder, so anything of its own that hangs below
    // it — today the title's hover card — paints under the page without this. Raising the header
    // rather than the card is what actually works: a z-index only sorts against siblings, and the
    // card's sibling is the rest of the header, not the page it needs to sit over.
    zIndex: 30,
    borderBottomWidth: 1,
    borderBottomColor: Palette.hairline,
  },
  headerAction: { fontSize: FontSize.md, fontWeight: Weight.semibold },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    // Narrow windows wrap the header rather than pushing Done off the edge. It grows the header,
    // not the space above the page, on exactly the screens that have no width to spare.
    flexWrap: 'wrap',
    justifyContent: 'flex-end',
  },
  // The title and the card it reveals share a column so the card centres under the title
  // (an absolute child with no left/right takes the parent's alignItems).
  /**
   * THE TITLE IS CENTRED ON THE PAGES, NOT ON WHAT THE BUTTONS LEFT OVER.
   *
   * In the flow it was a flex:1 box between a ~45px "Close" and a ~450px stack of tools, so it was
   * centred on the LEFTOVER span and its centre sat ~200px left of the binder it names. Out of the
   * flow, taking the header's own left/right padding, it is centred on the header's content box —
   * which is the pages' box grown by a symmetric 16px either side, so: the same centre.
   *
   * left/right: 0 is the header's PADDING box, since a parent's padding does not apply to an
   * absolutely positioned child (in CSS or in Yoga). That is why this repeats `headerInset`.
   */
  titleFloat: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Self-sized, so only the words take the click and the buttons underneath stay reachable.
  titlePress: { minWidth: 0 },
  // Clear of the header's bottom rule, so the card reads as floating over the binder rather than
  // as another band of chrome attached to the header.
  // Clear of the header's bottom rule. The float spans the header's full height, where the old
  // in-flow column started below its 12px of vertical padding.
  titleHover: { top: 52 },
  iconBar: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  /**
   * A GROUP, NOT A ROW OF LOOSE GLYPHS. One hairlined container is what makes "these act on the
   * page" legible with no copy and no extra row. The arithmetic that keeps the binder where it is:
   * a 30px IconBtn plus two 1px borders is 32px, still under the ~33px Done pill that already sets
   * this row's height — so the header does not grow and nothing below it moves.
   */
  pageGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    paddingHorizontal: 3,
    borderWidth: 1,
    borderColor: Palette.hairline,
    borderRadius: Radius.control,
    backgroundColor: Palette.surface,
  },
  // The seam between "the session's history" and "this page". 18px inside a 30px row reads as a
  // divider; a full-height rule would read as a second border and fight the group's own.
  groupRule: { width: 1, height: 18, marginHorizontal: 5, backgroundColor: Palette.hairline },
  pageBadge: { height: 24, paddingHorizontal: 5, justifyContent: 'center' },
  pageBadgeText: { fontSize: FontSize.sm, fontWeight: Weight.semibold, color: Palette.ink2 },
  iconBtn: {
    width: 30,
    height: 30,
    borderRadius: Radius.control,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconBtnActive: { backgroundColor: Palette.accent },
  iconGlyph: { fontSize: FontSize.md, color: Palette.ink, lineHeight: 20 },
  iconGlyphActive: { color: Palette.accentText },
  iconGlyphDanger: { color: Palette.dangerAlt },
  iconGlyphOff: { opacity: 0.3 },
  lookBox: { alignSelf: 'stretch', gap: 10, paddingTop: 4 },
  headerPrimary: { color: Palette.accent },
  // The Edit/Done mode toggle — filled pill, same voice as the studio's "Save slices".
  modeBtn: { paddingVertical: 8, paddingHorizontal: 18, borderRadius: Radius.pill, backgroundColor: Palette.accent },
  modeBtnText: { fontSize: FontSize.body, fontWeight: Weight.bold, color: Palette.accentText },
  likeChip: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  likeChipHeart: { color: Palette.accent, fontSize: FontSize.md, lineHeight: 18 },
  likeChipText: { color: Palette.ink2, fontSize: FontSize.control, fontWeight: Weight.semibold },
  titleText: { textAlign: 'center', fontFamily: Fonts?.brand, fontSize: FontSize.title, lineHeight: 28 },
  // NOTHING LIVES BELOW THE BINDER ANY MORE, so nothing is reserved below it. This was 48px of
  // clearance for the slice tray, and then for the Delete binder button; both are gone, and 48px
  // of padding under the last thing on the page is 48px the pages could have had — and, worse,
  // 48px BinderPages could not see, so it sized the page to fit and the container overflowed
  // anyway. The page's own breathing room is reserved inside the height budget where it belongs.
  scroll: { paddingHorizontal: 16 },
  // Detail fields share one centred column (matches the edit-tools card) so the editable
  // chrome reads as a single organised stack instead of page-wide boxes.
  toolsCard: {
    width: '100%',
    maxWidth: 760,
    maxHeight: '88%',
    alignSelf: 'center',
    borderRadius: Radius.panel,
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.three,
    paddingBottom: Spacing.four,
  },
  toolsHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: Spacing.two,
  },
  primaryText: { color: Palette.accent },
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
  // "Send page to…" copy/move switch, shown above the destination list.
  sendModeRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.two,
    paddingBottom: Spacing.three,
  },
  sendModeBox: {
    width: 18,
    height: 18,
    borderRadius: Radius.xs,
    borderWidth: 1.5,
    borderColor: Palette.hairlineStrong,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
  },
  sendModeBoxOn: { backgroundColor: Palette.accent, borderColor: Palette.accent },
  sendModeTick: { color: Palette.accentText, fontSize: 12, fontWeight: Weight.bold, lineHeight: 14 },
  sendModeText: { flex: 1, lineHeight: 18 },
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
  // A contained danger chip, centred and sized to its label — so the tap target is the button,
  // not the whole row width (an easy place to fat-finger a destructive action).
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
